import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { graphqlClient } from '../../lib/graphql';
import { storage } from '../../storage';
import { DISCORD_COLORS } from '../types';
import { getEnvironment } from '../../lib/aws-config';

export const data = new SlashCommandBuilder()
  .setName('campaigns')
  .setDescription('List your TabletopScribe campaigns');

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

  try {
    const campaigns = await graphqlClient.getCampaignsByOwner(
      dbSession.sub,
      dbSession.accessToken
    );

    if (campaigns.length === 0) {
      const noCampaignsEmbed = new EmbedBuilder()
        .setColor(DISCORD_COLORS.INFO)
        .setTitle('📚 No Campaigns Found')
        .setDescription('You don\'t have any campaigns yet. Create one in TabletopScribe to get started!')
        .setTimestamp();

      await interaction.editReply({ embeds: [noCampaignsEmbed] });
      return;
    }

    const campaignFields = campaigns.map(campaign => ({
      name: campaign.name,
      value: campaign.description || 'No description',
      inline: false,
    }));

    const campaignsEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.SUCCESS)
      .setTitle('📚 Your TabletopScribe Campaigns')
      .setDescription('Use the campaign name with `/record` to start recording')
      .addFields(campaignFields)
      .setFooter({ text: `${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''} • ${getEnvironment()}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [campaignsEmbed] });
  } catch (error: any) {
    console.error('Campaigns error:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(DISCORD_COLORS.ERROR)
      .setTitle('❌ Failed to Load Campaigns')
      .setDescription(error.message || 'Unable to fetch your campaigns')
      .addFields(
        { name: 'Troubleshooting', value: '• Check your network connection\n• Try logging in again with `/setup`\n• Contact support if the issue persists' }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
