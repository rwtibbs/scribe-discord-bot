import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { sessionManager } from '../session-manager';
import { storage } from '../../storage';
import { uploadAudioToS3 } from '../../lib/s3-upload';
import { graphqlClient } from '../../lib/graphql';
import { DISCORD_COLORS } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const execAsync = promisify(exec);

// Store processed recordings waiting for user confirmation
const pendingUploads = new Map<string, {
  mp3FilePath: string;
  audioUrl: string;
  duration: number;
  fileSizeMB: string;
  campaignId: string;
  campaignName: string;
  startedAt: Date;
}>();

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

    // Store pending upload data
    pendingUploads.set(interaction.user.id, {
      mp3FilePath,
      audioUrl,
      duration,
      fileSizeMB,
      campaignId: recordingSession.campaignId,
      campaignName: recordingSession.campaignName,
      startedAt: recordingSession.startedAt,
    });

    sessionManager.endRecording(interaction.user.id);

    // Show confirmation with buttons
    const confirmEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.SUCCESS)
      .setTitle('📼 Recording Ready')
      .setDescription('Your recording has been processed and is ready to submit!')
      .addFields(
        { name: 'Duration', value: `${Math.floor(duration / 60)}m ${duration % 60}s`, inline: true },
        { name: 'Campaign', value: recordingSession.campaignName, inline: true },
        { name: 'File Size', value: `${fileSizeMB} MB`, inline: true }
      )
      .setFooter({ text: 'Click Submit to name and upload, or Delete to discard' })
      .setTimestamp();

    const submitButton = new ButtonBuilder()
      .setCustomId('submit_recording')
      .setLabel('Submit to TabletopScribe')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');

    const deleteButton = new ButtonBuilder()
      .setCustomId('delete_recording')
      .setLabel('Delete Recording')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️');

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(submitButton, deleteButton);

    await interaction.editReply({ 
      embeds: [confirmEmbed],
      components: [row]
    });

    console.log(`📼 Recording ready for user ${interaction.user.tag}, awaiting confirmation`);
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

// Handle submit button - show modal for session name
export async function handleSubmitButton(interaction: ButtonInteraction) {
  const pending = pendingUploads.get(interaction.user.id);
  
  if (!pending) {
    await interaction.reply({
      content: '❌ No pending recording found. Please record again.',
      ephemeral: true
    });
    return;
  }

  // Show modal to collect session name
  const modal = new ModalBuilder()
    .setCustomId('session_name_modal')
    .setTitle('Name Your Session');

  const sessionNameInput = new TextInputBuilder()
    .setCustomId('session_name')
    .setLabel('Session Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`${pending.campaignName} - Discord Recording`)
    .setValue(`${pending.campaignName} - Discord Recording`)
    .setRequired(true)
    .setMaxLength(100);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(sessionNameInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

// Handle delete button - remove recording
export async function handleDeleteButton(interaction: ButtonInteraction) {
  const pending = pendingUploads.get(interaction.user.id);
  
  if (!pending) {
    await interaction.reply({
      content: '❌ No pending recording found.',
      ephemeral: true
    });
    return;
  }

  // Delete the MP3 file
  if (fs.existsSync(pending.mp3FilePath)) {
    fs.unlinkSync(pending.mp3FilePath);
  }

  pendingUploads.delete(interaction.user.id);

  const deleteEmbed = new EmbedBuilder()
    .setColor(DISCORD_COLORS.WARNING)
    .setTitle('🗑️ Recording Deleted')
    .setDescription('Your recording has been discarded and will not be uploaded.')
    .setTimestamp();

  await interaction.update({ 
    embeds: [deleteEmbed],
    components: []
  });

  console.log(`🗑️ Recording deleted by user ${interaction.user.tag}`);
}

// Handle modal submission - create session
export async function handleSessionNameModal(interaction: ModalSubmitInteraction) {
  const pending = pendingUploads.get(interaction.user.id);
  
  if (!pending) {
    await interaction.reply({
      content: '❌ No pending recording found. Please record again.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferUpdate();

  const sessionName = interaction.fields.getTextInputValue('session_name');

  try {
    // Get user session for access token
    const dbSession = await storage.getDiscordSession(interaction.user.id);
    
    if (!dbSession) {
      throw new Error('Not authenticated. Please use /setup to login.');
    }

    const transcriptionUrl = pending.audioUrl.replace('.mp3', '.txt');
    
    await graphqlClient.createSession({
      name: sessionName,
      duration: pending.duration,
      audioFile: pending.audioUrl,
      transcriptionFile: transcriptionUrl,
      transcriptionStatus: 'UPLOADED',
      campaignSessionsId: pending.campaignId,
      date: pending.startedAt,
    }, dbSession.accessToken);

    // Clean up the MP3 file
    if (fs.existsSync(pending.mp3FilePath)) {
      fs.unlinkSync(pending.mp3FilePath);
    }

    pendingUploads.delete(interaction.user.id);

    const successEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.SUCCESS)
      .setTitle('✅ Session Uploaded Successfully')
      .setDescription('Your recording is ready in TabletopScribe!')
      .addFields(
        { name: 'Session Name', value: sessionName, inline: false },
        { name: 'Duration', value: `${Math.floor(pending.duration / 60)}m ${pending.duration % 60}s`, inline: true },
        { name: 'Campaign', value: pending.campaignName, inline: true },
        { name: 'File Size', value: `${pending.fileSizeMB} MB`, inline: true }
      )
      .setFooter({ text: 'Processing will continue automatically in TabletopScribe' })
      .setTimestamp();

    await interaction.editReply({
      embeds: [successEmbed],
      components: []
    });

    console.log(`✅ Session "${sessionName}" uploaded successfully by user ${interaction.user.tag}`);
  } catch (error: any) {
    console.error('Session creation error:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Upload Failed')
      .setDescription(error.message || 'Unable to create session')
      .addFields(
        { name: 'Troubleshooting', value: '• Try logging in again with `/setup`\n• Check that the campaign still exists\n• Contact support if the issue persists' }
      )
      .setTimestamp();

    await interaction.editReply({
      embeds: [errorEmbed],
      components: []
    });
  }
}
