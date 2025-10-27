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

    const receiver = connection.receiver;

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

    receiver.speaking.on('start', (userId) => {
      const audioStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 100,
        },
      });

      const opusDecoder = new prism.opus.Decoder({
        frameSize: 960,
        channels: 2,
        rate: 48000,
      });

      audioStream.pipe(opusDecoder).pipe(writeStream, { end: false });
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
