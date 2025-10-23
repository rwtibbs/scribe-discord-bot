import { type User, type InsertUser, type DiscordSession, type InsertDiscordSession, users, discordSessions } from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { Pool } from "@neondatabase/serverless";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Discord session methods
  getDiscordSession(discordUserId: string): Promise<DiscordSession | undefined>;
  upsertDiscordSession(session: InsertDiscordSession): Promise<DiscordSession>;
  deleteDiscordSession(discordUserId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private discordSessions: Map<string, DiscordSession>;

  constructor() {
    this.users = new Map();
    this.discordSessions = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getDiscordSession(discordUserId: string): Promise<DiscordSession | undefined> {
    return this.discordSessions.get(discordUserId);
  }

  async upsertDiscordSession(session: InsertDiscordSession): Promise<DiscordSession> {
    const discordSession: DiscordSession = {
      ...session,
      updatedAt: new Date(),
    };
    this.discordSessions.set(session.discordUserId, discordSession);
    return discordSession;
  }

  async deleteDiscordSession(discordUserId: string): Promise<void> {
    this.discordSessions.delete(discordUserId);
  }
}

export class DbStorage implements IStorage {
  private db;

  constructor() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    this.db = drizzle(pool);
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await this.db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async getDiscordSession(discordUserId: string): Promise<DiscordSession | undefined> {
    const result = await this.db
      .select()
      .from(discordSessions)
      .where(eq(discordSessions.discordUserId, discordUserId))
      .limit(1);
    return result[0];
  }

  async upsertDiscordSession(session: InsertDiscordSession): Promise<DiscordSession> {
    const result = await this.db
      .insert(discordSessions)
      .values({
        ...session,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: discordSessions.discordUserId,
        set: {
          accessToken: session.accessToken,
          username: session.username,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  }

  async deleteDiscordSession(discordUserId: string): Promise<void> {
    await this.db.delete(discordSessions).where(eq(discordSessions.discordUserId, discordUserId));
  }
}

export const storage = new DbStorage();
