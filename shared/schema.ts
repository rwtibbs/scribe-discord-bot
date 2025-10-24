import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const discordSessions = pgTable("discord_sessions", {
  discordUserId: text("discord_user_id").primaryKey(),
  accessToken: text("access_token").notNull(),
  username: text("username").notNull(),
  sub: text("sub").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const setupTokens = pgTable("setup_tokens", {
  token: text("token").primaryKey(),
  discordUserId: text("discord_user_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: timestamp("used"),
});

export const insertDiscordSessionSchema = createInsertSchema(discordSessions).omit({
  updatedAt: true,
});

export type InsertDiscordSession = z.infer<typeof insertDiscordSessionSchema>;
export type DiscordSession = typeof discordSessions.$inferSelect;

export const insertSetupTokenSchema = createInsertSchema(setupTokens).omit({
  used: true,
});

export type InsertSetupToken = z.infer<typeof insertSetupTokenSchema>;
export type SetupToken = typeof setupTokens.$inferSelect;

export const activeRecordings = pgTable("active_recordings", {
  discordUserId: text("discord_user_id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  campaignName: text("campaign_name").notNull(),
  filePath: text("file_path").notNull(),
  startedAt: timestamp("started_at").notNull(),
});

export const insertActiveRecordingSchema = createInsertSchema(activeRecordings);

export type InsertActiveRecording = z.infer<typeof insertActiveRecordingSchema>;
export type ActiveRecording = typeof activeRecordings.$inferSelect;

export const pendingUploads = pgTable("pending_uploads", {
  discordUserId: text("discord_user_id").primaryKey(),
  aacFilePath: text("aac_file_path").notNull(),
  audioUrl: text("audio_url").notNull(),
  duration: text("duration").notNull(), // Store as text to avoid type issues
  fileSizeMB: text("file_size_mb").notNull(),
  campaignId: text("campaign_id").notNull(),
  campaignName: text("campaign_name").notNull(),
  startedAt: timestamp("started_at").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const insertPendingUploadSchema = createInsertSchema(pendingUploads);

export type InsertPendingUpload = z.infer<typeof insertPendingUploadSchema>;
export type PendingUpload = typeof pendingUploads.$inferSelect;
