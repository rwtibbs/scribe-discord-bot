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
import { uploadAudioToS3, deleteAudioFromS3, generateFileName, getS3Url } from '../../lib/s3-upload';
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
  aacFilePath: string;
  audioUrl: string;
  duration: number;
  fileSizeMB: string;
  campaignId: string;
  campaignName: string;
  startedAt: Date;
  createdAt: Date;
}>();

// TTL for pending uploads (30 minutes)
const PENDING_UPLOAD_TTL_MS = 30 * 60 * 1000;

// Cleanup stale pending uploads
async function cleanupStalePendingUploads() {
  const now = Date.now();
  const staleUserIds: string[] = [];

  for (const [userId, pending] of Array.from(pendingUploads.entries())) {
    const age = now - pending.createdAt.getTime();
    if (age > PENDING_UPLOAD_TTL_MS) {
      staleUserIds.push(userId);
    }
  }

  for (const userId of staleUserIds) {
    const pending = pendingUploads.get(userId);
    if (!pending) continue;

    console.log(`🧹 Cleaning up stale pending upload for user ${userId} (age: ${Math.floor((now - pending.createdAt.getTime()) / 60000)}min)`);

    try {
      // Delete S3 file
      await deleteAudioFromS3(pending.audioUrl);
      
      // Delete local AAC file
      if (fs.existsSync(pending.aacFilePath)) {
        fs.unlinkSync(pending.aacFilePath);
      }
      
      // Delete from database
      await storage.deletePendingUpload(userId);
    } catch (error) {
      console.error(`Failed to cleanup stale upload for user ${userId}:`, error);
    } finally {
      pendingUploads.delete(userId);
    }
  }

  if (staleUserIds.length > 0) {
    console.log(`🧹 Cleaned up ${staleUserIds.length} stale pending upload(s)`);
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupStalePendingUploads, 10 * 60 * 1000);

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop recording and upload to TabletopScribe');

async function convertPcmToAac(pcmPath: string, aacPath: string): Promise<void> {
  const ffmpegPath = require('ffmpeg-static');
  
  // Convert to AAC at 96 kbps mono for efficient voice recording
  const command = `${ffmpegPath} -f s16le -ar 48000 -ac 2 -i "${pcmPath}" -codec:a aac -b:a 96k -ac 1 "${aacPath}"`;
  
  await execAsync(command);
}

export async function execute(interaction: ChatInputCommandInteraction) {
  // CRITICAL: Defer IMMEDIATELY before any async operations to prevent Discord timeout
  // Discord requires response within 3 seconds - don't do ANYTHING before this
  try {
    await interaction.deferReply();
  } catch (error: any) {
    console.error('Failed to defer /stop interaction (likely already expired):', error.message);
    return; // Can't respond - interaction already expired
  }

  // Check in-memory first (fast, no database query)
  let recordingSession = sessionManager.getRecordingSession(interaction.user.id);
  
  // If not in memory, check database (in case bot restarted)
  if (!recordingSession) {
    try {
      const dbRecording = await storage.getActiveRecording(interaction.user.id);
      if (dbRecording) {
        // Recreate session from database
        recordingSession = {
          discordId: dbRecording.discordUserId,
          guildId: dbRecording.guildId,
          channelId: dbRecording.channelId,
          campaignId: dbRecording.campaignId,
          campaignName: dbRecording.campaignName,
          startedAt: dbRecording.startedAt,
          filePath: dbRecording.filePath,
        };
        console.log(`🔄 Recovered recording session from database for user ${interaction.user.id}`);
      }
    } catch (dbError) {
      console.error('Database error while fetching active recording:', dbError);
      // Continue - will show "No Active Recording" if not in memory
    }
  }

  if (!recordingSession) {
    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ No Active Recording')
      .setDescription('You don\'t have an active recording. Use `/record` to start one.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
    return;
  }

  // Get user authentication (needed later for session creation)
  let dbSession;
  try {
    dbSession = await storage.getDiscordSession(interaction.user.id);
  } catch (dbError) {
    console.error('Database error while fetching discord session:', dbError);
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

    const aacFileName = path.basename(recordingSession.filePath, '.pcm') + '.m4a';
    const aacFilePath = path.join(path.dirname(recordingSession.filePath), aacFileName);

    await convertPcmToAac(recordingSession.filePath, aacFilePath);

    fs.unlinkSync(recordingSession.filePath);

    const stats = fs.statSync(aacFilePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    processingEmbed.setFields(
      { name: 'Duration', value: `${Math.floor(duration / 60)}m ${duration % 60}s`, inline: true },
      { name: 'File Size', value: `${fileSizeMB} MB`, inline: true },
      { name: 'Status', value: '📤 Uploading to S3...', inline: false }
    );
    await interaction.editReply({ embeds: [processingEmbed] });

    const s3FileName = `discord_${recordingSession.campaignName.replace(/\s+/g, '_')}_${Date.now()}.m4a`;
    const audioUrl = await uploadAudioToS3(aacFilePath, s3FileName);

    // Store pending upload data in both memory and database
    const pendingData = {
      aacFilePath,
      audioUrl,
      duration,
      fileSizeMB,
      campaignId: recordingSession.campaignId,
      campaignName: recordingSession.campaignName,
      startedAt: recordingSession.startedAt,
      createdAt: new Date(),
    };
    
    pendingUploads.set(interaction.user.id, pendingData);
    
    await storage.upsertPendingUpload({
      discordUserId: interaction.user.id,
      aacFilePath,
      audioUrl,
      duration: duration.toString(),
      fileSizeMB,
      campaignId: recordingSession.campaignId,
      campaignName: recordingSession.campaignName,
      startedAt: recordingSession.startedAt,
      createdAt: new Date(),
    });

    sessionManager.endRecording(interaction.user.id);
    
    // Also remove active recording from database
    await storage.deleteActiveRecording(interaction.user.id);

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
      .setFooter({ text: 'Click Submit to name and upload, Download to save locally, or Delete to discard' })
      .setTimestamp();

    const submitButton = new ButtonBuilder()
      .setCustomId('submit_recording')
      .setLabel('Submit to TabletopScribe')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');

    const downloadButton = new ButtonBuilder()
      .setLabel('Download Recording')
      .setStyle(ButtonStyle.Link)
      .setURL(audioUrl)
      .setEmoji('💾');

    const deleteButton = new ButtonBuilder()
      .setCustomId('delete_recording')
      .setLabel('Delete Recording')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️');

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(submitButton, downloadButton, deleteButton);

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
  // Check in-memory FIRST (synchronous, fast)
  let pending = pendingUploads.get(interaction.user.id);
  
  // If in memory, show modal immediately (no database delay)
  if (pending) {
    const modal = new ModalBuilder()
      .setCustomId('session_name_modal')
      .setTitle('Name Your Session');

    const sessionNameInput = new TextInputBuilder()
      .setCustomId('session_name')
      .setLabel('Session Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Session 1: The Adventure Begins')
      .setRequired(true)
      .setMaxLength(100);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(sessionNameInput);
    modal.addComponents(row);

    try {
      await interaction.showModal(modal);
    } catch (error: any) {
      console.error('Failed to show modal:', error.message);
    }
    return;
  }

  // NOT in memory - must defer FIRST before database lookup
  // RULE #1: DEFER FIRST - Always acknowledge Discord within 1 second
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (error: any) {
    console.error('Failed to defer submit button (interaction expired):', error.message);
    return;
  }

  // Now safe to do database lookup (already acknowledged Discord)
  try {
    const dbPending = await storage.getPendingUpload(interaction.user.id);
    if (dbPending) {
      // Restore to memory
      pending = {
        aacFilePath: dbPending.aacFilePath,
        audioUrl: dbPending.audioUrl,
        duration: parseInt(dbPending.duration),
        fileSizeMB: dbPending.fileSizeMB,
        campaignId: dbPending.campaignId,
        campaignName: dbPending.campaignName,
        startedAt: dbPending.startedAt,
        createdAt: dbPending.createdAt,
      };
      pendingUploads.set(interaction.user.id, pending);
      console.log(`🔄 Recovered pending upload from database for user ${interaction.user.id}`);
      
      // Can't show modal after defer - inform user to try again
      await interaction.editReply({
        content: '✅ Recording recovered. Please click Submit again to continue.'
      });
      return;
    }
  } catch (dbError) {
    console.error('Database error fetching pending upload:', dbError);
  }
  
  // No pending found
  await interaction.editReply({
    content: '❌ No pending recording found. Please record again.'
  });
}

// Handle delete button - remove recording
export async function handleDeleteButton(interaction: ButtonInteraction) {
  // DEFER FIRST - Acknowledge button click immediately
  try {
    await interaction.deferUpdate();
  } catch (error: any) {
    console.error('Failed to defer delete button (interaction expired):', error.message);
    return;
  }

  // Check in-memory first (fast)
  let pending = pendingUploads.get(interaction.user.id);
  
  // If not in memory, check database (in case bot restarted)
  if (!pending) {
    try {
      const dbPending = await storage.getPendingUpload(interaction.user.id);
      if (dbPending) {
        pending = {
          aacFilePath: dbPending.aacFilePath,
          audioUrl: dbPending.audioUrl,
          duration: parseInt(dbPending.duration),
          fileSizeMB: dbPending.fileSizeMB,
          campaignId: dbPending.campaignId,
          campaignName: dbPending.campaignName,
          startedAt: dbPending.startedAt,
          createdAt: dbPending.createdAt,
        };
        pendingUploads.set(interaction.user.id, pending);
        console.log(`🔄 Recovered pending upload from database for user ${interaction.user.id}`);
      }
    } catch (dbError) {
      console.error('Database error fetching pending upload:', dbError);
    }
  }
  
  if (!pending) {
    console.error('No pending upload found for delete button');
    return;
  }

  try {
    // Delete the S3 file
    await deleteAudioFromS3(pending.audioUrl);
    
    // Delete the local AAC file
    if (fs.existsSync(pending.aacFilePath)) {
      fs.unlinkSync(pending.aacFilePath);
    }

    pendingUploads.delete(interaction.user.id);
    
    // Also remove from database
    await storage.deletePendingUpload(interaction.user.id);

    const deleteEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.WARNING)
      .setTitle('🗑️ Recording Deleted')
      .setDescription('Your recording has been permanently deleted from storage.')
      .setTimestamp();

    await interaction.editReply({ 
      embeds: [deleteEmbed],
      components: []
    });

    console.log(`🗑️ Recording and S3 file deleted by user ${interaction.user.tag}`);
  } catch (error: any) {
    console.error('Delete error:', error);

    // Don't clean up - let user retry
    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Delete Failed')
      .setDescription(`Failed to delete the recording: ${error.message || 'Unknown error'}\n\nYou can try again or contact support.`)
      .setTimestamp();

    // Recreate buttons so user can retry
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
      embeds: [errorEmbed],
      components: [row]
    });
  }
}

// Handle download button - send file to user
export async function handleDownloadButton(interaction: ButtonInteraction) {
  // Check in-memory first (fast)
  const pending = pendingUploads.get(interaction.user.id);
  
  if (!pending) {
    try {
      await interaction.reply({
        content: '❌ Recording no longer available for download. It may have been cleaned up.',
        ephemeral: true
      });
    } catch (error: any) {
      console.error('Failed to respond to download button:', error.message);
    }
    return;
  }

  console.log(`📥 Download requested by ${interaction.user.tag}`);
  console.log(`   File path: ${pending.aacFilePath}`);
  console.log(`   File exists: ${fs.existsSync(pending.aacFilePath)}`);
  
  // Check if file exists
  if (!fs.existsSync(pending.aacFilePath)) {
    try {
      await interaction.reply({
        content: `❌ Recording file not found at path: \`${pending.aacFilePath}\`\n\nThe file may have been cleaned up. Please use the S3 download link instead.`,
        ephemeral: true
      });
    } catch (error: any) {
      console.error('Failed to respond to download button:', error.message);
    }
    return;
  }

  // Get file stats for debugging
  const stats = fs.statSync(pending.aacFilePath);
  console.log(`   File size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  try {
    // Send the file as an attachment
    await interaction.reply({
      content: `📥 Here is your recording file!\n**Size:** ${(stats.size / 1024 / 1024).toFixed(2)} MB`,
      files: [{
        attachment: pending.aacFilePath,
        name: `${pending.campaignName.replace(/\s+/g, '_')}_recording.m4a`
      }],
      ephemeral: true
    });

    console.log(`✅ Recording sent successfully to ${interaction.user.tag}`);
    
    // Clean up file after download (wait longer to ensure Discord has it)
    setTimeout(() => {
      if (fs.existsSync(pending.aacFilePath)) {
        fs.unlinkSync(pending.aacFilePath);
        console.log(`🗑️ Cleaned up file after download: ${pending.aacFilePath}`);
      }
      pendingUploads.delete(interaction.user.id);
    }, 10000); // Wait 10 seconds to ensure file is fully sent
  } catch (error: any) {
    console.error('Download error:', error);
    
    try {
      await interaction.reply({
        content: `❌ Failed to send the file: ${error.message}\n\nPlease use the S3 download link instead.`,
        ephemeral: true
      });
    } catch (replyError: any) {
      console.error('Failed to respond to download error:', replyError.message);
    }
  }
}

// Handle modal submission - create session
export async function handleSessionNameModal(interaction: ModalSubmitInteraction) {
  // DEFER FIRST - Acknowledge modal submission immediately
  try {
    await interaction.deferUpdate();
  } catch (error: any) {
    console.error('Failed to defer modal (interaction expired):', error.message);
    return;
  }

  // Check in-memory first (fast)
  let pending = pendingUploads.get(interaction.user.id);
  
  // If not in memory, check database (in case bot restarted)
  if (!pending) {
    try {
      const dbPending = await storage.getPendingUpload(interaction.user.id);
      if (dbPending) {
        pending = {
          aacFilePath: dbPending.aacFilePath,
          audioUrl: dbPending.audioUrl,
          duration: parseInt(dbPending.duration),
          fileSizeMB: dbPending.fileSizeMB,
          campaignId: dbPending.campaignId,
          campaignName: dbPending.campaignName,
          startedAt: dbPending.startedAt,
          createdAt: dbPending.createdAt,
        };
        pendingUploads.set(interaction.user.id, pending);
        console.log(`🔄 Recovered pending upload from database for user ${interaction.user.id}`);
      }
    } catch (dbError) {
      console.error('Database error fetching pending upload:', dbError);
    }
  }
  
  if (!pending) {
    // Can't use reply here since we already deferred
    console.error('No pending upload found for user after modal submission');
    return;
  }

  const sessionName = interaction.fields.getTextInputValue('session_name');

  try {
    // Get user session for access token
    const dbSession = await storage.getDiscordSession(interaction.user.id);
    
    if (!dbSession) {
      throw new Error('Not authenticated. Please use /setup to login.');
    }

    // Step 1: Create session with temporary audioFile to get session ID
    console.log('📝 Creating session to get ID...');
    const createdSession = await graphqlClient.createSession({
      name: sessionName,
      duration: pending.duration * 1000, // Convert seconds to milliseconds
      audioFile: 'temp.m4a', // Temporary placeholder
      transcriptionFile: 'temp.json',
      transcriptionStatus: 'UPLOADED',
      campaignSessionsId: pending.campaignId,
      date: pending.startedAt,
    }, dbSession.accessToken);

    console.log(`✅ Session created with ID: ${createdSession.id}`);

    // Step 2: Generate standardized filename using campaign ID and session ID
    const properFileName = generateFileName(pending.campaignId, createdSession.id, 'm4a');
    const properTranscriptionFileName = generateFileName(pending.campaignId, createdSession.id, 'json');
    
    console.log(`📝 Generated filename: ${properFileName}`);

    // Step 3: Upload file with correct filename
    console.log('📤 Uploading file with standardized filename...');
    await uploadAudioToS3(pending.aacFilePath, properFileName);

    // Step 4: Delete the old file with wrong name from S3
    console.log('🗑️ Removing temporary upload with old filename...');
    await deleteAudioFromS3(pending.audioUrl);

    // Step 5: Update session with correct audioFile (filename only, not URL)
    console.log('🔄 Updating session with correct audioFile...');
    await graphqlClient.updateSessionAudioFile(
      createdSession.id,
      properFileName, // Store filename only, not full URL
      properTranscriptionFileName,
      createdSession._version,
      dbSession.accessToken
    );

    // Keep file temporarily for download option
    // Store file path for download handler
    const downloadData = {
      aacFilePath: pending.aacFilePath,
      sessionName,
      campaignName: pending.campaignName,
    };
    pendingUploads.set(interaction.user.id, {
      ...downloadData,
      duration: pending.duration,
      fileSizeMB: pending.fileSizeMB,
      campaignId: pending.campaignId,
      audioUrl: getS3Url(properFileName),
      startedAt: pending.startedAt,
      createdAt: pending.createdAt,
    });

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

    const downloadButton = new ButtonBuilder()
      .setCustomId('download_recording')
      .setLabel('Download File')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📥');

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(downloadButton);

    await interaction.editReply({
      embeds: [successEmbed],
      components: [row]
    });

    console.log(`✅ Session "${sessionName}" uploaded successfully by user ${interaction.user.tag}`);
  } catch (error: any) {
    console.error('Session creation error:', error);

    // Don't clean up - let user retry
    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Upload Failed')
      .setDescription(error.message || 'Unable to create session')
      .addFields(
        { name: 'Troubleshooting', value: '• Try logging in again with `/setup`\n• Click Submit to try again\n• Or click Delete to discard the recording' }
      )
      .setTimestamp();

    // Recreate buttons so user can retry or delete
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
      embeds: [errorEmbed],
      components: [row]
    });
  }
}
