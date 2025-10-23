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
