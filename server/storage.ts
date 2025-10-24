import { type User, type InsertUser, type DiscordSession, type InsertDiscordSession, type SetupToken, type InsertSetupToken, type ActiveRecording, type InsertActiveRecording, type PendingUpload, type InsertPendingUpload, users, discordSessions, setupTokens, activeRecordings, pendingUploads } from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, gt } from "drizzle-orm";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Configure WebSocket for Neon serverless driver in Node.js
neonConfig.webSocketConstructor = ws;

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Discord session methods
  getDiscordSession(discordUserId: string): Promise<DiscordSession | undefined>;
  upsertDiscordSession(session: InsertDiscordSession): Promise<DiscordSession>;
  deleteDiscordSession(discordUserId: string): Promise<void>;
  
  // Setup token methods
  createSetupToken(token: InsertSetupToken): Promise<SetupToken>;
  getSetupToken(token: string): Promise<SetupToken | undefined>;
  markTokenUsed(token: string): Promise<void>;
  
  // Active recording methods
  getActiveRecording(discordUserId: string): Promise<ActiveRecording | undefined>;
  upsertActiveRecording(recording: InsertActiveRecording): Promise<ActiveRecording>;
  deleteActiveRecording(discordUserId: string): Promise<void>;
  
  // Pending upload methods
  getPendingUpload(discordUserId: string): Promise<PendingUpload | undefined>;
  upsertPendingUpload(upload: InsertPendingUpload): Promise<PendingUpload>;
  deletePendingUpload(discordUserId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private discordSessions: Map<string, DiscordSession>;
  private setupTokens: Map<string, SetupToken>;
  private activeRecordings: Map<string, ActiveRecording>;
  private pendingUploads: Map<string, PendingUpload>;

  constructor() {
    this.users = new Map();
    this.discordSessions = new Map();
    this.setupTokens = new Map();
    this.activeRecordings = new Map();
    this.pendingUploads = new Map();
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

  async createSetupToken(insertToken: InsertSetupToken): Promise<SetupToken> {
    const token: SetupToken = {
      ...insertToken,
      used: null,
    };
    this.setupTokens.set(insertToken.token, token);
    return token;
  }

  async getSetupToken(token: string): Promise<SetupToken | undefined> {
    const setupToken = this.setupTokens.get(token);
    // Reject tokens that have been used
    if (setupToken && setupToken.used) {
      return undefined;
    }
    return setupToken;
  }

  async markTokenUsed(token: string): Promise<void> {
    const setupToken = this.setupTokens.get(token);
    if (setupToken) {
      setupToken.used = new Date();
      this.setupTokens.set(token, setupToken);
    }
  }

  async getActiveRecording(discordUserId: string): Promise<ActiveRecording | undefined> {
    return this.activeRecordings.get(discordUserId);
  }

  async upsertActiveRecording(recording: InsertActiveRecording): Promise<ActiveRecording> {
    const activeRecording: ActiveRecording = {
      ...recording,
    };
    this.activeRecordings.set(recording.discordUserId, activeRecording);
    return activeRecording;
  }

  async deleteActiveRecording(discordUserId: string): Promise<void> {
    this.activeRecordings.delete(discordUserId);
  }

  async getPendingUpload(discordUserId: string): Promise<PendingUpload | undefined> {
    return this.pendingUploads.get(discordUserId);
  }

  async upsertPendingUpload(upload: InsertPendingUpload): Promise<PendingUpload> {
    const pendingUpload: PendingUpload = {
      ...upload,
    };
    this.pendingUploads.set(upload.discordUserId, pendingUpload);
    return pendingUpload;
  }

  async deletePendingUpload(discordUserId: string): Promise<void> {
    this.pendingUploads.delete(discordUserId);
  }
}

export class DbStorage implements IStorage {
  private db;

  constructor() {
    const pool = new Pool({ 
      connectionString: process.env.DATABASE_URL
    });
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
          sub: session.sub,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  }

  async deleteDiscordSession(discordUserId: string): Promise<void> {
    await this.db.delete(discordSessions).where(eq(discordSessions.discordUserId, discordUserId));
  }

  async createSetupToken(insertToken: InsertSetupToken): Promise<SetupToken> {
    const result = await this.db.insert(setupTokens).values(insertToken).returning();
    return result[0];
  }

  async getSetupToken(token: string): Promise<SetupToken | undefined> {
    const result = await this.db
      .select()
      .from(setupTokens)
      .where(and(
        eq(setupTokens.token, token),
        gt(setupTokens.expiresAt, new Date())
      ))
      .limit(1);
    
    const setupToken = result[0];
    // Reject tokens that have been used
    if (setupToken && setupToken.used) {
      return undefined;
    }
    return setupToken;
  }

  async markTokenUsed(token: string): Promise<void> {
    await this.db
      .update(setupTokens)
      .set({ used: new Date() })
      .where(eq(setupTokens.token, token));
  }

  async getActiveRecording(discordUserId: string): Promise<ActiveRecording | undefined> {
    const result = await this.db
      .select()
      .from(activeRecordings)
      .where(eq(activeRecordings.discordUserId, discordUserId))
      .limit(1);
    return result[0];
  }

  async upsertActiveRecording(recording: InsertActiveRecording): Promise<ActiveRecording> {
    const result = await this.db
      .insert(activeRecordings)
      .values(recording)
      .onConflictDoUpdate({
        target: activeRecordings.discordUserId,
        set: {
          guildId: recording.guildId,
          channelId: recording.channelId,
          campaignId: recording.campaignId,
          campaignName: recording.campaignName,
          filePath: recording.filePath,
          startedAt: recording.startedAt,
        },
      })
      .returning();
    return result[0];
  }

  async deleteActiveRecording(discordUserId: string): Promise<void> {
    await this.db.delete(activeRecordings).where(eq(activeRecordings.discordUserId, discordUserId));
  }

  async getPendingUpload(discordUserId: string): Promise<PendingUpload | undefined> {
    const result = await this.db
      .select()
      .from(pendingUploads)
      .where(eq(pendingUploads.discordUserId, discordUserId))
      .limit(1);
    return result[0];
  }

  async upsertPendingUpload(upload: InsertPendingUpload): Promise<PendingUpload> {
    const result = await this.db
      .insert(pendingUploads)
      .values(upload)
      .onConflictDoUpdate({
        target: pendingUploads.discordUserId,
        set: {
          aacFilePath: upload.aacFilePath,
          audioUrl: upload.audioUrl,
          duration: upload.duration,
          fileSizeMB: upload.fileSizeMB,
          campaignId: upload.campaignId,
          campaignName: upload.campaignName,
          startedAt: upload.startedAt,
          createdAt: upload.createdAt,
        },
      })
      .returning();
    return result[0];
  }

  async deletePendingUpload(discordUserId: string): Promise<void> {
    await this.db.delete(pendingUploads).where(eq(pendingUploads.discordUserId, discordUserId));
  }
}

export const storage = new DbStorage();
