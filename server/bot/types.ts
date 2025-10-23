export interface UserSession {
  discordId: string;
  username: string;
  sub: string;
  accessToken: string;
  authenticatedAt: Date;
}

export interface RecordingSession {
  discordId: string;
  guildId: string;
  channelId: string;
  campaignId: string;
  campaignName: string;
  startedAt: Date;
  filePath?: string;
}

export const DISCORD_COLORS = {
  SUCCESS: 0x43B581,
  ERROR: 0xF04747,
  INFO: 0x5865F2,
  WARNING: 0xFAA61A,
  RECORDING: 0xED4245,
} as const;
