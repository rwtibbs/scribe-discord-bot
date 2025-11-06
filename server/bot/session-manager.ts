import { UserSession, RecordingSession } from './types';
import type { WriteStream } from 'fs';

class SessionManager {
  private userSessions: Map<string, UserSession> = new Map();
  private recordingSessions: Map<string, RecordingSession> = new Map();
  private mixerIntervals: Map<string, NodeJS.Timeout> = new Map();
  private writeStreams: Map<string, WriteStream> = new Map();

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

  setMixerInterval(discordId: string, interval: NodeJS.Timeout): void {
    // Clear existing interval if any
    this.clearMixerInterval(discordId);
    this.mixerIntervals.set(discordId, interval);
    console.log(`🎛️ Set mixer interval for Discord user: ${discordId}`);
  }

  clearMixerInterval(discordId: string): void {
    const interval = this.mixerIntervals.get(discordId);
    if (interval) {
      clearInterval(interval);
      this.mixerIntervals.delete(discordId);
      console.log(`🛑 Cleared mixer interval for Discord user: ${discordId}`);
    }
  }

  setWriteStream(discordId: string, stream: WriteStream): void {
    // Close existing stream if any
    this.closeWriteStream(discordId);
    this.writeStreams.set(discordId, stream);
    console.log(`💾 Set write stream for Discord user: ${discordId}`);
  }

  closeWriteStream(discordId: string): Promise<void> {
    return new Promise((resolve) => {
      const stream = this.writeStreams.get(discordId);
      if (stream) {
        stream.end(() => {
          this.writeStreams.delete(discordId);
          console.log(`✅ Closed and flushed write stream for Discord user: ${discordId}`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export const sessionManager = new SessionManager();
