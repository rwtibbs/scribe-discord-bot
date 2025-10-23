import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { DISCORD_COLORS } from '../types';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Get a secure link to configure your TabletopScribe account');

export async function execute(interaction: ChatInputCommandInteraction) {
  const discordUserId = interaction.user.id;
  const baseUrl = process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : 'http://localhost:5000';
  
  const loginUrl = `${baseUrl}/login?userId=${discordUserId}`;

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
      '⚠️ This link is unique to you. Don\'t share it with others!'
    )
    .setFooter({ text: 'Your credentials are stored securely and never exposed in Discord' })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setLabel('Login to TabletopScribe')
    .setStyle(ButtonStyle.Link)
    .setURL(loginUrl);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(button);

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}
