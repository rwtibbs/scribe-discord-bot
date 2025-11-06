import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  GuildMember,
  VoiceChannel,
} from 'discord.js';
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  EndBehaviorType,
  entersState,
  createAudioPlayer,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import * as prism from 'prism-media';
import { graphqlClient } from '../../lib/graphql';
import { sessionManager } from '../session-manager';
import { storage } from '../../storage';
import { DISCORD_COLORS } from '../types';
import * as path from 'path';
import * as fs from 'fs';

const pipelineAsync = promisify(pipeline);

export const data = new SlashCommandBuilder()
  .setName('record')
  .setDescription('Start recording in your current voice channel')
  .addStringOption(option =>
    option
      .setName('campaign')
      .setDescription('The name of your TabletopScribe campaign')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  // RULE #1: DEFER FIRST - Always acknowledge Discord within 1 second
  try {
    await interaction.deferReply();
  } catch (error: any) {
    console.error('Failed to defer /record (interaction expired):', error.message);
    return; // Can't respond - interaction already expired
  }

  // Get session from database
  let dbSession;
  try {
    dbSession = await storage.getDiscordSession(interaction.user.id);
  } catch (dbError) {
    console.error('Database error fetching session:', dbError);
  }

  if (!dbSession) {
    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Not Authenticated')
      .setDescription('Please use `/setup` to login with your TabletopScribe account')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
    return;
  }

  if (sessionManager.isRecording(interaction.user.id)) {
    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.WARNING)
      .setTitle('⚠️ Already Recording')
      .setDescription('You already have an active recording. Use `/stop` to end it first.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
    return;
  }

  const member = interaction.member as GuildMember;
  const voiceChannel = member?.voice?.channel as VoiceChannel;

  console.log(`Voice channel check - member: ${!!member}, voice: ${!!member?.voice}, channel: ${!!voiceChannel}`);

  if (!voiceChannel) {
    console.log(`User ${interaction.user.tag} is not in a voice channel`);
    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Not in Voice Channel')
      .setDescription('You must join a voice channel before using the `/record` command.\n\nSteps:\n1. Join a voice channel in Discord\n2. Run `/record <campaign-name>` again')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
    return;
  }

  // Check bot permissions
  const permissions = voiceChannel.permissionsFor(interaction.guild!.members.me!);
  if (!permissions?.has(['Connect', 'Speak'])) {
    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Missing Permissions')
      .setDescription('The bot needs "Connect" and "Speak" permissions in this voice channel')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
    return;
  }

  const campaignName = interaction.options.getString('campaign', true);

  try {
    const campaigns = await graphqlClient.getCampaignsByOwner(
      `${dbSession.sub}::${dbSession.username}`,
      dbSession.accessToken
    );

    const campaign = campaigns.find(
      c => c.name.toLowerCase() === campaignName.toLowerCase()
    );

    if (!campaign) {
      const errorEmbed = new EmbedBuilder()
        .setColor(DISCORD_COLORS.ERROR)
        .setTitle('❌ Campaign Not Found')
        .setDescription(`Campaign "${campaignName}" not found. Use \`/campaigns\` to see your campaigns.`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    console.log(`Attempting to join voice channel: ${voiceChannel.name} (${voiceChannel.id})`);
    
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator as any,
      selfDeaf: false,
      selfMute: true,
      debug: false,
    });

    // Log connection state changes for debugging
    connection.on('stateChange', (oldState, newState) => {
      console.log(`Voice connection state: ${oldState.status} -> ${newState.status}`);
    });

    connection.on('error', (error) => {
      console.error('Voice connection error:', error);
    });

    console.log(`Voice connection created with initial state: ${connection.state.status}`);
    console.log('Waiting for ready state...');

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      console.log('✅ Voice connection ready!');
    } catch (connectionError: any) {
      console.error('❌ Voice connection failed after timeout');
      console.error(`Final state: ${connection.state.status}`);
      console.error('Error:', connectionError);
      connection.destroy();
      throw new Error('Unable to establish voice connection. This may be a hosting environment limitation with UDP voice traffic.');
    }

    // Create and attach an audio player to maintain connection stability
    // Even though we're not playing audio, this prevents connection issues
    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });
    connection.subscribe(player);

    const receiver = connection.receiver;
    
    console.log(`📡 Voice receiver created, listening for speaking events...`);

    const recordingDir = path.join(process.cwd(), 'recordings');
    if (!fs.existsSync(recordingDir)) {
      fs.mkdirSync(recordingDir, { recursive: true });
    }

    const timestamp = Date.now();
    const fileName = `recording_${interaction.user.id}_${timestamp}.pcm`;
    const filePath = path.join(recordingDir, fileName);

    const recordingSession = {
      discordId: interaction.user.id,
      guildId: voiceChannel.guild.id,
      channelId: voiceChannel.id,
      campaignId: campaign.id,
      campaignName: campaign.name,
      startedAt: new Date(),
      filePath,
    };

    // Save to both in-memory and database for reliability
    sessionManager.startRecording(interaction.user.id, recordingSession);
    
    await storage.upsertActiveRecording({
      discordUserId: interaction.user.id,
      guildId: voiceChannel.guild.id,
      channelId: voiceChannel.id,
      campaignId: campaign.id,
      campaignName: campaign.name,
      filePath,
      startedAt: new Date(),
    });

    const writeStream = createWriteStream(filePath);
    sessionManager.setWriteStream(interaction.user.id, writeStream);
    
    // Audio mixer: Combines PCM data from multiple speakers
    // Maps userId -> Buffer[] (queued PCM chunks)
    const userBuffers = new Map<string, Buffer[]>();
    const SAMPLE_RATE = 48000;
    const CHANNELS = 2;
    const BYTES_PER_SAMPLE = 2; // 16-bit PCM
    const FRAME_DURATION_MS = 20; // Mix every 20ms
    const FRAME_SIZE = Math.floor((SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * FRAME_DURATION_MS) / 1000);
    
    // Track active audio streams
    const activeStreams = new Map<string, any>();
    
    // Mixer interval: every 20ms, mix all available audio and write to file
    // Register immediately to prevent resource leaks
    let mixCount = 0;
    const mixerInterval = setInterval(() => {
      // Collect one frame from each active user
      const frames: Buffer[] = [];
      
      for (const [userId, buffers] of Array.from(userBuffers.entries())) {
        if (buffers.length === 0) continue;
        
        // Get and remove the first buffer for this user
        const chunk = buffers.shift()!;
        frames.push(chunk);
        
        // Keep the buffer queue alive (don't delete) so future audio chunks can be queued
      }
      
      if (frames.length === 0) return; // Nothing to mix
      
      mixCount++;
      if (mixCount % 50 === 0) {
        console.log(`🎵 Mixer: Mixed ${mixCount} frames from ${frames.length} speakers, total buffers queued: ${Array.from(userBuffers.values()).reduce((sum, b) => sum + b.length, 0)}`);
      }
      
      // Mix the frames by summing and normalizing samples
      const maxLength = Math.max(...frames.map(f => f.length));
      const mixed = Buffer.alloc(maxLength);
      const numFrames = frames.length;
      
      for (let i = 0; i < maxLength; i += 2) {
        let sum = 0;
        let count = 0;
        
        // Sum samples from all frames at this position
        for (const frame of frames) {
          if (i + 1 < frame.length) {
            // Read 16-bit signed integer (little-endian)
            const sample = frame.readInt16LE(i);
            sum += sample;
            count++;
          }
        }
        
        // Normalize by number of active speakers to prevent clipping
        // This maintains headroom while preserving audio quality
        const normalized = count > 0 ? Math.floor(sum / count) : 0;
        
        // Clamp to prevent overflow (-32768 to 32767)
        const clamped = Math.max(-32768, Math.min(32767, normalized));
        mixed.writeInt16LE(clamped, i);
      }
      
      // Write mixed audio to file
      const written = writeStream.write(mixed);
      if (mixCount === 1) {
        console.log(`✍️ First write to ${filePath}: ${mixed.length} bytes, success: ${written}`);
      }
    }, FRAME_DURATION_MS);
    
    // Register mixer interval for cleanup
    sessionManager.setMixerInterval(interaction.user.id, mixerInterval);

    // Debug: Log all users in the voice channel
    const membersInChannel = voiceChannel.members.filter(m => !m.user.bot);
    console.log(`👥 Users in voice channel: ${membersInChannel.map(m => m.user.tag).join(', ')}`);
    console.log(`👥 User IDs: ${membersInChannel.map(m => m.id).join(', ')}`);
    
    // Helper function to subscribe to a user's audio
    const subscribeToUser = (userId: string) => {
      if (activeStreams.has(userId)) {
        console.log(`⏭️  User ${userId} already subscribed, skipping`);
        return;
      }

      const member = voiceChannel.guild.members.cache.get(userId);
      console.log(`🎤 Subscribing to user ${userId} (${member?.user.tag || 'Unknown'})`);

      const audioStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 2000, // 2 seconds of silence before ending
        },
      });

      const opusDecoder = new prism.opus.Decoder({
        frameSize: 960,
        channels: 2,
        rate: 48000,
      });

      // Initialize buffer queue for this user
      if (!userBuffers.has(userId)) {
        userBuffers.set(userId, []);
      }

      // When decoder produces PCM data, add to user's buffer queue
      let chunkCount = 0;
      opusDecoder.on('data', (pcmChunk: Buffer) => {
        const buffers = userBuffers.get(userId);
        if (buffers) {
          buffers.push(pcmChunk);
          chunkCount++;
          if (chunkCount % 50 === 0) {
            console.log(`📦 User ${userId}: Received ${chunkCount} PCM chunks (latest: ${pcmChunk.length} bytes), queue depth: ${buffers.length}`);
          }
        } else {
          console.warn(`⚠️ User ${userId}: No buffer queue found for PCM chunk`);
        }
      });

      activeStreams.set(userId, { audioStream, opusDecoder });

      // Cleanup when stream ends
      audioStream.on('end', () => {
        console.log(`🎤 User ${userId} stopped speaking`);
        activeStreams.delete(userId);
        
        // Flush remaining buffers for this user
        setTimeout(() => {
          userBuffers.delete(userId);
        }, 1000); // Give mixer time to process remaining data
      });

      audioStream.on('error', (error) => {
        console.error(`Audio stream error for user ${userId}:`, error);
        activeStreams.delete(userId);
        userBuffers.delete(userId);
      });

      audioStream.pipe(opusDecoder);
    };
    
    // Subscribe to all users currently in the voice channel
    console.log(`📢 Proactively subscribing to ${membersInChannel.size} users in voice channel...`);
    membersInChannel.forEach(member => {
      subscribeToUser(member.id);
    });
    
    // Also listen for new users joining or starting to speak
    receiver.speaking.on('start', (userId) => {
      const member = voiceChannel.guild.members.cache.get(userId);
      if (member && !member.user.bot) {
        console.log(`🎤 New speaker detected: ${member.user.tag}`);
        subscribeToUser(userId);
      }
    });

    const startedEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.RECORDING)
      .setTitle('🎙️ Recording Started')
      .setDescription('Joined voice channel and recording audio')
      .addFields(
        { name: 'Campaign', value: campaign.name, inline: true },
        { name: 'Voice Channel', value: voiceChannel.name, inline: true },
        { name: 'Started At', value: `<t:${Math.floor(timestamp / 1000)}:T>`, inline: true }
      )
      .setFooter({ text: 'Use /stop to end the recording and upload to TabletopScribe' })
      .setTimestamp();

    await interaction.editReply({ embeds: [startedEmbed] });

    console.log(`🎙️ Recording started for user ${interaction.user.tag} in channel ${voiceChannel.name}`);
  } catch (error: any) {
    console.error('Record error:', error);
    
    // Clean up resources if recording failed
    await sessionManager.closeWriteStream(interaction.user.id);
    sessionManager.clearMixerInterval(interaction.user.id);

    // Check if this is an authentication error (401)
    const is401Error = error.message?.includes('401') || error.statusCode === 401;
    
    if (is401Error) {
      // User's session has expired or they aren't authenticated
      const authErrorEmbed = new EmbedBuilder()
        .setColor(DISCORD_COLORS.ERROR)
        .setTitle('❌ Authentication Required')
        .setDescription('Your TabletopScribe session has expired or is invalid.')
        .addFields(
          { name: 'What to do', value: '1. Use `/setup` to login again\n2. Click the link and enter your TabletopScribe credentials\n3. Try `/record` again' }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [authErrorEmbed] });
      return;
    }

    // General error handling
    let errorMessage = error.message || 'Unable to start recording';
    let troubleshootingSteps = '• Make sure you are in a voice channel before using /record\n• Ensure the bot has permission to join voice channels\n• Check that the campaign name is correct\n• Try logging in again with `/setup`';

    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Recording Failed')
      .setDescription(errorMessage)
      .addFields(
        { name: 'Troubleshooting', value: troubleshootingSteps }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
