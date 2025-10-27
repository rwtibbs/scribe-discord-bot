import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { DISCORD_COLORS } from '../types';
import { storage } from '../../storage';
import { randomBytes } from 'crypto';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Get a secure link to configure your TabletopScribe account');

function getBaseUrl(): string {
  console.log('🔍 getBaseUrl() called - checking environment variables:');
  console.log('  PUBLIC_URL:', process.env.PUBLIC_URL || '(not set)');
  console.log('  REPLIT_DEV_DOMAIN:', process.env.REPLIT_DEV_DOMAIN || '(not set)');
  
  // Check for custom PUBLIC_URL (for deployments)
  // User should set this to their deployment URL like: https://scribe-bot.replit.app
  if (process.env.PUBLIC_URL) {
    console.log('✅ Using PUBLIC_URL:', process.env.PUBLIC_URL);
    return process.env.PUBLIC_URL;
  }
  
  // Fallback to dev domain (development environment)
  if (process.env.REPLIT_DEV_DOMAIN) {
    const url = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    console.log('⚠️ Using REPLIT_DEV_DOMAIN:', url);
    return url;
  }
  
  // Final fallback for local development
  console.log('⚠️ Using localhost fallback');
  return 'http://localhost:5000';
}

export async function execute(interaction: ChatInputCommandInteraction) {
  // RULE #1: DEFER FIRST - Always acknowledge Discord within 1 second
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (error: any) {
    console.error('Failed to defer /setup (interaction expired):', error.message);
    return; // Can't respond - interaction already expired
  }

  try {
    const discordUserId = interaction.user.id;
    const baseUrl = getBaseUrl();
    
    // Generate cryptographically secure token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    
    // Store token directly in database
    await storage.createSetupToken({
      token,
      discordUserId,
      expiresAt,
    });
    
    const loginUrl = `${baseUrl}/login?token=${token}`;

    const embed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.INFO)
      .setTitle('🔐 TabletopScribe Setup')
      .setDescription(
        'Click the button below to securely login with your TabletopScribe credentials.\n\n' +
        '**What happens next:**\n' +
        '1. You\'ll be taken to a secure login page\n' +
        '2. Enter your TabletopScribe username and password\n' +
        '3. Select which campaign to record to\n' +
        '4. Copy the record command and paste it in Discord\n\n' +
        '⚠️ This link is unique to you and expires in 15 minutes. Don\'t share it with others!'
      )
      .setFooter({ text: 'Your credentials are stored securely and never exposed in Discord' })
      .setTimestamp();

    const button = new ButtonBuilder()
      .setLabel('Login to TabletopScribe')
      .setStyle(ButtonStyle.Link)
      .setURL(loginUrl);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(button);

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  } catch (error) {
    console.error('Setup command error:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Setup Failed')
      .setDescription('Unable to generate setup link. Please try again in a moment.')
      .setTimestamp();

    await interaction.editReply({
      embeds: [errorEmbed],
      components: [],
    });
  }
}
