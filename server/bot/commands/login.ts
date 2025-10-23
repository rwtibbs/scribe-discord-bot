import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AuthService } from '../../lib/auth';
import { sessionManager } from '../session-manager';
import { DISCORD_COLORS } from '../types';
import { getEnvironment } from '../../lib/aws-config';

export const data = new SlashCommandBuilder()
  .setName('login')
  .setDescription('Authenticate with your TabletopScribe account')
  .addStringOption(option =>
    option
      .setName('username')
      .setDescription('Your TabletopScribe username')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('password')
      .setDescription('Your TabletopScribe password')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const username = interaction.options.getString('username', true);
  const password = interaction.options.getString('password', true);

  try {
    const loadingEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.INFO)
      .setTitle('🔐 Authenticating...')
      .setDescription('Please wait while we verify your credentials with TabletopScribe.')
      .setTimestamp();

    await interaction.editReply({ embeds: [loadingEmbed] });

    const authUser = await AuthService.signIn(username, password);

    sessionManager.setUserSession(interaction.user.id, {
      discordId: interaction.user.id,
      username: authUser.username,
      sub: authUser.sub,
      accessToken: authUser.accessToken,
      authenticatedAt: new Date(),
    });

    const successEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.SUCCESS)
      .setTitle('✅ Authentication Successful')
      .setDescription(`You're now connected to TabletopScribe!`)
      .addFields(
        { name: 'Username', value: authUser.username, inline: true },
        { name: 'Environment', value: getEnvironment(), inline: true }
      )
      .setFooter({ text: 'You can now use /campaigns and /record commands' })
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });
  } catch (error: any) {
    console.error('Login error:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Authentication Failed')
      .setDescription(error.message || 'Unable to authenticate with TabletopScribe')
      .addFields(
        { name: 'Troubleshooting', value: '• Check your username and password\n• Ensure your account is active\n• Try again in a moment' }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
