import { getDatabase } from '../connection.js';
import type { SmashEvent, Vote, RecentUserActivity, ChannelActivity } from '../schema.js';

export class SmashRepository {
  // Smash Events
  async createEvent(event: Omit<SmashEvent, 'status' | 'player1Votes' | 'player2Votes'>): Promise<SmashEvent> {
    const db = getDatabase();
    const newEvent: SmashEvent = {
      ...event,
      status: 'active',
      player1Votes: 0,
      player2Votes: 0,
    };
    db.data.smashEvents.push(newEvent);
    try {
      await db.write();
    } catch (error) {
      console.error('Database write error in createEvent:', error);
    }
    return newEvent;
  }

  getEvent(eventId: string): SmashEvent | undefined {
    const db = getDatabase();
    return db.data.smashEvents.find(e => e.eventId === eventId);
  }

  getActiveEventInChannel(channelId: string): SmashEvent | undefined {
    const db = getDatabase();
    return db.data.smashEvents.find(e => e.channelId === channelId && e.status === 'active');
  }

  async updateEvent(eventId: string, updates: Partial<SmashEvent>): Promise<void> {
    const db = getDatabase();
    const index = db.data.smashEvents.findIndex(e => e.eventId === eventId);
    if (index !== -1) {
      db.data.smashEvents[index] = { ...db.data.smashEvents[index], ...updates };
      try {
        await db.write();
      } catch (error) {
        console.error('Database write error in updateEvent:', error);
      }
    }
  }

  // Votes
  async addVote(vote: Omit<Vote, 'id'>): Promise<Vote> {
    const db = getDatabase();
    const id = db.data.votes.length + 1;
    const newVote: Vote = { ...vote, id };
    db.data.votes.push(newVote);
    try {
      await db.write();
    } catch (error) {
      console.error('Database write error in addVote:', error);
    }
    return newVote;
  }

  getVote(eventId: string, voterId: string): Vote | undefined {
    const db = getDatabase();
    return db.data.votes.find(v => v.eventId === eventId && v.voterId === voterId);
  }

  getVotesForEvent(eventId: string): Vote[] {
    const db = getDatabase();
    return db.data.votes.filter(v => v.eventId === eventId);
  }

  countVotesForEvent(eventId: string): { player1: number; player2: number } {
    const db = getDatabase();
    const votes = db.data.votes.filter(v => v.eventId === eventId);
    const event = this.getEvent(eventId);
    
    if (!event) {
      return { player1: 0, player2: 0 };
    }

    let player1Votes = 0;
    let player2Votes = 0;

    for (const vote of votes) {
      if (vote.votedForId === event.player1Id) {
        player1Votes++;
      } else if (vote.votedForId === event.player2Id) {
        player2Votes++;
      }
    }

    return { player1: player1Votes, player2: player2Votes };
  }

  // Recent User Activity
  async recordUserActivity(activity: Omit<RecentUserActivity, 'lastActiveAt'>): Promise<void> {
    const db = getDatabase();
    const now = Date.now();
    
    // Update existing record or create new one
    const existingIndex = db.data.recentUserActivity.findIndex(
      a => a.userId === activity.userId && a.channelId === activity.channelId
    );
    
    if (existingIndex !== -1) {
      db.data.recentUserActivity[existingIndex] = {
        ...activity,
        lastActiveAt: now,
      };
    } else {
      db.data.recentUserActivity.push({
        ...activity,
        lastActiveAt: now,
      });
    }
    
    try {
      await db.write();
    } catch (error) {
      console.error('Database write error in recordUserActivity:', error);
    }
  }

  getRecentActiveUsers(channelId: string, timeWindowMs: number): RecentUserActivity[] {
    const db = getDatabase();
    const now = Date.now();
    const cutoffTime = now - timeWindowMs;
    
    return db.data.recentUserActivity.filter(
      a => a.channelId === channelId && a.lastActiveAt >= cutoffTime
    );
  }

  async cleanupOldActivity(timeWindowMs: number): Promise<void> {
    const db = getDatabase();
    const now = Date.now();
    const cutoffTime = now - timeWindowMs;
    
    const originalLength = db.data.recentUserActivity.length;
    db.data.recentUserActivity = db.data.recentUserActivity.filter(
      a => a.lastActiveAt >= cutoffTime
    );
    
    if (db.data.recentUserActivity.length !== originalLength) {
      try {
        await db.write();
      } catch (error) {
        console.error('Database write error in cleanupOldActivity:', error);
      }
    }
  }

  // Channel Activity
  async updateChannelActivity(channelId: string, lastActivityAt: number): Promise<void> {
    const db = getDatabase();
    const existing = db.data.channelActivity.find(a => a.channelId === channelId);
    
    if (existing) {
      existing.lastActivityAt = lastActivityAt;
    } else {
      db.data.channelActivity.push({
        channelId,
        lastActivityAt,
        activityWindowConsumed: false,
      });
    }
    try {
      await db.write();
    } catch (error) {
      console.error('Database write error in updateChannelActivity:', error);
    }
  }

  getChannelActivity(channelId: string): ChannelActivity | undefined {
    const db = getDatabase();
    return db.data.channelActivity.find(a => a.channelId === channelId);
  }

  async updateChannelSpawn(channelId: string, lastSpawnAt: number, activityWindowConsumed: boolean): Promise<void> {
    const db = getDatabase();
    const activity = db.data.channelActivity.find(a => a.channelId === channelId);
    if (activity) {
      activity.lastSpawnAt = lastSpawnAt;
      activity.activityWindowConsumed = activityWindowConsumed;
      try {
        await db.write();
      } catch (error) {
        console.error('Database write error in updateChannelSpawn:', error);
      }
    }
  }

  async resetChannelActivityWindow(channelId: string): Promise<void> {
    const db = getDatabase();
    const activity = db.data.channelActivity.find(a => a.channelId === channelId);
    if (activity) {
      activity.activityWindowConsumed = false;
      try {
        await db.write();
      } catch (error) {
        console.error('Database write error in resetChannelActivityWindow:', error);
      }
    }
  }
}
