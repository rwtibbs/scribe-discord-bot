import { UserSession, RecordingSession } from './types';

class SessionManager {
  private userSessions: Map<string, UserSession> = new Map();
  private recordingSessions: Map<string, RecordingSession> = new Map();

  setUserSession(discordId: string, session: UserSession): void {
    this.userSessions.set(discordId, session);
    console.log(`📝 Stored session for Discord user: ${discordId}`);
  }

  getUserSession(discordId: string): UserSession | undefined {
    return this.userSessions.get(discordId);
  }

  isAuthenticated(discordId: string): boolean {
    return this.userSessions.has(discordId);
  }

  clearUserSession(discordId: string): void {
    this.userSessions.delete(discordId);
    console.log(`🗑️ Cleared session for Discord user: ${discordId}`);
  }

  startRecording(discordId: string, session: RecordingSession): void {
    this.recordingSessions.set(discordId, session);
    console.log(`🎙️ Started recording session for Discord user: ${discordId}`);
  }

  getRecordingSession(discordId: string): RecordingSession | undefined {
    return this.recordingSessions.get(discordId);
  }

  isRecording(discordId: string): boolean {
    return this.recordingSessions.has(discordId);
  }

  endRecording(discordId: string): RecordingSession | undefined {
    const session = this.recordingSessions.get(discordId);
    if (session) {
      this.recordingSessions.delete(discordId);
      console.log(`⏹️ Ended recording session for Discord user: ${discordId}`);
    }
    return session;
  }

  getAllRecordingSessions(): RecordingSession[] {
    return Array.from(this.recordingSessions.values());
  }
}

export const sessionManager = new SessionManager();
