import { SmashRepository } from '../database/repositories/smash-repository.js';
import type { RecentUserActivity } from '../database/schema.js';
import { config } from '../config/index.js';

/**
 * RecentUserTracker tracks user activity in channels to build a selection pool
 * for automatic Smash events.
 * 
 * This ensures that Smash events feature people who have actually been active
 * in the channel recently, rather than random server members.
 */
export class RecentUserTracker {
  private repository = new SmashRepository();
  
  // Default time window: 7 days of recent activity
  private readonly DEFAULT_TIME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

  /**
   * Records that a user was active in a channel.
   * Called on every user message (not bot messages).
   */
  async recordUserActivity(
    userId: string,
    displayName: string,
    avatarUrl: string | undefined,
    channelId: string
  ): Promise<void> {
    await this.repository.recordUserActivity({
      userId,
      displayName,
      avatarUrl,
      channelId,
    });
  }

  /**
   * Gets recently active users in a channel who are eligible for Smash selection.
   * 
   * @param channelId - The channel to get users from
   * @param botId - The bot's user ID (to exclude from selection)
   * @param timeWindowMs - How far back to look for activity (default: 7 days)
   * @returns Array of eligible recently active users
   */
  getEligibleUsers(
    channelId: string,
    botId: string,
    timeWindowMs: number = this.DEFAULT_TIME_WINDOW_MS
  ): RecentUserActivity[] {
    const recentUsers = this.repository.getRecentActiveUsers(channelId, timeWindowMs);
    
    // Filter out bots and duplicates
    const eligibleUsers = recentUsers.filter(user => {
      // Exclude the bot itself
      if (user.userId === botId) {
        return false;
      }
      
      // Additional filters could be added here:
      // - Exclude other known bots
      // - Exclude users with certain roles
      // - Exclude users who have opted out
      
      return true;
    });
    
    // Remove duplicates (same user ID, different records)
    const uniqueUsers = new Map<string, RecentUserActivity>();
    for (const user of eligibleUsers) {
      // Keep the most recent record for each user
      const existing = uniqueUsers.get(user.userId);
      if (!existing || user.lastActiveAt > existing.lastActiveAt) {
        uniqueUsers.set(user.userId, user);
      }
    }
    
    return Array.from(uniqueUsers.values());
  }

  /**
   * Selects two random eligible users from the recent activity pool.
   * 
   * @param channelId - The channel to select users from
   * @param botId - The bot's user ID (to exclude from selection)
   * @returns Two random users, or null if insufficient eligible users
   */
  selectTwoRandomUsers(
    channelId: string,
    botId: string
  ): { user1: RecentUserActivity; user2: RecentUserActivity } | null {
    const eligibleUsers = this.getEligibleUsers(channelId, botId);
    
    if (eligibleUsers.length < 2) {
      return null;
    }
    
    // Shuffle and pick first two
    const shuffled = this.shuffleArray([...eligibleUsers]);
    const user1 = shuffled[0];
    const user2 = shuffled[1];
    
    return { user1, user2 };
  }

  /**
   * Cleans up old activity records to prevent database bloat.
   * Should be called periodically (e.g., daily).
   */
  async cleanupOldActivity(): Promise<void> {
    // Clean up activity older than 30 days
    const cleanupWindowMs = 30 * 24 * 60 * 60 * 1000;
    await this.repository.cleanupOldActivity(cleanupWindowMs);
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
