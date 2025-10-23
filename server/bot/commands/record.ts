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
  await interaction.deferReply();

  // Get session from database
  const dbSession = await storage.getDiscordSession(interaction.user.id);

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

  if (!voiceChannel) {
    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Not in Voice Channel')
      .setDescription('You need to be in a voice channel to start recording')
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
      dbSession.sub,
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

    console.log('Voice connection created, waiting for ready state...');

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      console.log('Voice connection ready');
    } catch (connectionError: any) {
      console.error('Voice connection failed:', connectionError);
      connection.destroy();
      throw new Error('Failed to connect to voice channel. The bot may need to be re-invited with proper permissions.');
    }

    const receiver = connection.receiver;

    const recordingDir = path.join(process.cwd(), 'recordings');
    if (!fs.existsSync(recordingDir)) {
      fs.mkdirSync(recordingDir, { recursive: true });
    }

    const timestamp = Date.now();
    const fileName = `recording_${interaction.user.id}_${timestamp}.pcm`;
    const filePath = path.join(recordingDir, fileName);

    sessionManager.startRecording(interaction.user.id, {
      discordId: interaction.user.id,
      guildId: voiceChannel.guild.id,
      channelId: voiceChannel.id,
      campaignId: campaign.id,
      campaignName: campaign.name,
      startedAt: new Date(),
      filePath,
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

    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Recording Failed')
      .setDescription(error.message || 'Unable to start recording')
      .addFields(
        { name: 'Troubleshooting', value: '• Ensure the bot has permission to join voice channels\n• Check that the campaign name is correct\n• Try again in a moment' }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
