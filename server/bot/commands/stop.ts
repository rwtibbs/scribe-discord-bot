import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { sessionManager } from '../session-manager';
import { uploadAudioToS3 } from '../../lib/s3-upload';
import { graphqlClient } from '../../lib/graphql';
import { DISCORD_COLORS } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop recording and upload to TabletopScribe');

async function convertPcmToMp3(pcmPath: string, mp3Path: string): Promise<void> {
  const ffmpegPath = require('ffmpeg-static');
  
  const command = `${ffmpegPath} -f s16le -ar 48000 -ac 2 -i "${pcmPath}" -codec:a libmp3lame -b:a 192k "${mp3Path}"`;
  
  await execAsync(command);
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const userSession = sessionManager.getUserSession(interaction.user.id);

  if (!userSession) {
    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Not Authenticated')
      .setDescription('Please login first using `/login` command')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
    return;
  }

  const recordingSession = sessionManager.getRecordingSession(interaction.user.id);

  if (!recordingSession) {
    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ No Active Recording')
      .setDescription('You don\'t have an active recording. Use `/record` to start one.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
    return;
  }

  try {
    const connection = getVoiceConnection(recordingSession.guildId);
    
    if (connection) {
      connection.destroy();
    }

    const duration = Math.floor((Date.now() - recordingSession.startedAt.getTime()) / 1000);

    const processingEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.INFO)
      .setTitle('⏸️ Recording Stopped')
      .setDescription('Processing and uploading your session...')
      .addFields(
        { name: 'Duration', value: `${Math.floor(duration / 60)}m ${duration % 60}s`, inline: true },
        { name: 'Status', value: '📝 Converting audio...', inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [processingEmbed] });

    if (!recordingSession.filePath || !fs.existsSync(recordingSession.filePath)) {
      throw new Error('Recording file not found');
    }

    const mp3FileName = path.basename(recordingSession.filePath, '.pcm') + '.mp3';
    const mp3FilePath = path.join(path.dirname(recordingSession.filePath), mp3FileName);

    await convertPcmToMp3(recordingSession.filePath, mp3FilePath);

    fs.unlinkSync(recordingSession.filePath);

    const stats = fs.statSync(mp3FilePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    processingEmbed.setFields(
      { name: 'Duration', value: `${Math.floor(duration / 60)}m ${duration % 60}s`, inline: true },
      { name: 'File Size', value: `${fileSizeMB} MB`, inline: true },
      { name: 'Status', value: '📤 Uploading to S3...', inline: false }
    );
    await interaction.editReply({ embeds: [processingEmbed] });

    const s3FileName = `discord_${recordingSession.campaignName.replace(/\s+/g, '_')}_${Date.now()}.mp3`;
    const audioUrl = await uploadAudioToS3(mp3FilePath, s3FileName);

    processingEmbed.setFields(
      { name: 'Duration', value: `${Math.floor(duration / 60)}m ${duration % 60}s`, inline: true },
      { name: 'File Size', value: `${fileSizeMB} MB`, inline: true },
      { name: 'Status', value: '🔗 Creating session...', inline: false }
    );
    await interaction.editReply({ embeds: [processingEmbed] });

    const sessionName = `${recordingSession.campaignName} - Discord Recording`;
    const transcriptionUrl = audioUrl.replace('.mp3', '.txt');
    
    const session = await graphqlClient.createSession({
      name: sessionName,
      duration,
      audioFile: audioUrl,
      transcriptionFile: transcriptionUrl,
      transcriptionStatus: 'UPLOADED',
      campaignSessionsId: recordingSession.campaignId,
      date: recordingSession.startedAt.toISOString(),
    }, userSession.accessToken);

    fs.unlinkSync(mp3FilePath);

    sessionManager.endRecording(interaction.user.id);

    const successEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.SUCCESS)
      .setTitle('✅ Session Uploaded Successfully')
      .setDescription('Your recording is ready in TabletopScribe!')
      .addFields(
        { name: 'Session Name', value: sessionName, inline: false },
        { name: 'Duration', value: `${Math.floor(duration / 60)}m ${duration % 60}s`, inline: true },
        { name: 'Campaign', value: recordingSession.campaignName, inline: true },
        { name: 'File Size', value: `${fileSizeMB} MB`, inline: true }
      )
      .setFooter({ text: 'Processing will continue automatically in TabletopScribe' })
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

    console.log(`✅ Recording uploaded successfully for user ${interaction.user.tag}`);
  } catch (error: any) {
    console.error('Stop error:', error);

    sessionManager.endRecording(interaction.user.id);

    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Upload Failed')
      .setDescription(error.message || 'Unable to process and upload recording')
      .addFields(
        { name: 'Troubleshooting', value: '• The recording may be too short\n• Check your network connection\n• Try recording again' }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
