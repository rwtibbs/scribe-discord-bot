import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { DISCORD_COLORS } from '../types';
import { storage } from '../../storage';
import { randomBytes } from 'crypto';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Get a secure link to configure your TabletopScribe account');

function getBaseUrl(): string {
  // Check for custom PUBLIC_URL (for deployments)
  // User should set this to their deployment URL like: https://scribe-bot.replit.app
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL;
  }
  
  // Fallback to dev domain (development environment)
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  
  // Final fallback for local development
  return 'http://localhost:5000';
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

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
