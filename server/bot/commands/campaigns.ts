import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { graphqlClient } from '../../lib/graphql';
import { sessionManager } from '../session-manager';
import { DISCORD_COLORS } from '../types';
import { getEnvironment } from '../../lib/aws-config';

export const data = new SlashCommandBuilder()
  .setName('campaigns')
  .setDescription('List your TabletopScribe campaigns');

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

  try {
    const campaigns = await graphqlClient.getCampaignsByOwner(
      userSession.sub,
      userSession.accessToken
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
        { name: 'Troubleshooting', value: '• Check your network connection\n• Try logging in again with `/login`\n• Contact support if the issue persists' }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
