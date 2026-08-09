import { SmashRepository } from '../database/repositories/smash-repository.js';
import type { ChannelActivity } from '../database/schema.js';
import { config } from '../config/index.js';

/**
 * ActivityTracker implements activity-based spawning for simplified Smash events.
 * 
 * CRITICAL BEHAVIOR:
 * 
 * The intended spawning behavior is:
 * 1. USER CHAT ACTIVITY - users are talking normally
 * 2. CHAT GOES QUIET - no user messages for 30+ minutes
 * 3. 30+ MINUTES WITH NO QUALIFYING USER ACTIVITY - inactivity gap detected
 * 4. A USER STARTS TALKING AGAIN - renewed activity after the gap
 * 5. BOB KUN MAY SPAWN SMASH THIS - spawn opportunity created
 * 
 * Key rules for simplified system:
 * - Continuous active conversation does NOT repeatedly trigger Smash events
 * - A 30-minute cooldown alone does NOT trigger Smash events
 * - Bob Kun requires an actual 30+ minute inactivity gap
 * - Renewed user activity after that gap creates a spawn opportunity
 * - Bob Kun's own messages do NOT count as user activity
 * - Bot messages do NOT incorrectly reset the inactivity timer
 * - Multiple messages after the quiet period cannot create multiple simultaneous spawn events
 * - The configured spawn probability is respected
 * - The global cooldown is respected in addition to the activity-gap requirement
 * - An active event prevents another event from spawning
 * - Fewer than two eligible participants prevents spawning
 */
export class ActivityTracker {
  private repository = new SmashRepository();
  private activityGaps: Map<string, NodeJS.Timeout> = new Map();
  
  // Hardcoded configuration values
  private readonly ACTIVITY_GAP_MINUTES = 30;
  private readonly GLOBAL_COOLDOWN_MINUTES = 60;
  private readonly SPAWN_CHANCE = 0.5;
  private readonly MONITORED_CHANNELS: string[] = [];

  /**
   * Records user activity in a channel.
   * This is called on every user message (not bot messages).
   * 
   * The logic here implements the critical behavior:
   * - If this message comes after a 30+ minute gap, reset the activity window (create spawn opportunity)
   * - If this message is continuous activity, consume any existing spawn opportunity
   * - Always update the last activity timestamp
   */
  async recordActivity(channelId: string): Promise<void> {
    const now = Date.now();
    const activity = this.repository.getChannelActivity(channelId);
    
    if (!activity) {
      // First activity ever recorded - just record it
      await this.repository.updateChannelActivity(channelId, now);
      return;
    }

    const activityGapMs = this.ACTIVITY_GAP_MINUTES * 60 * 1000;
    const timeSinceLastActivity = now - activity.lastActivityAt;

    // Check if this message comes after a sufficient inactivity gap
    const isAfterGap = timeSinceLastActivity >= activityGapMs;

    if (isAfterGap) {
      // This message comes after a gap - create a spawn opportunity
      // Reset the consumed flag so we can spawn
      await this.repository.resetChannelActivityWindow(channelId);
    } else {
      // Continuous activity - consume any existing spawn opportunity
      // This prevents repeated spawning during active conversation
      if (!activity.activityWindowConsumed) {
        await this.repository.updateChannelSpawn(channelId, activity.lastSpawnAt || 0, true);
      }
    }

    // Update the last activity time
    await this.repository.updateChannelActivity(channelId, now);
    
    // Clear any existing gap timer for this channel
    const existingTimer = this.activityGaps.get(channelId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.activityGaps.delete(channelId);
    }
  }

  /**
   * Checks if a game can spawn in the given channel.
   * This validates all the spawning conditions:
   * - Activity window is not consumed
   * - Not in global cooldown
   * - Channel is monitored (if monitoring is enabled)
   */
  canSpawnGame(channelId: string): boolean {
    const activity: ChannelActivity | undefined = this.repository.getChannelActivity(channelId);
    if (!activity) {
      // No activity recorded yet, can't spawn
      return false;
    }

    const now = Date.now();
    const activityGapMs = this.ACTIVITY_GAP_MINUTES * 60 * 1000;
    const globalCooldownMs = this.GLOBAL_COOLDOWN_MINUTES * 60 * 1000;

    // Check if activity window is already consumed
    if (activity.activityWindowConsumed) {
      return false;
    }

    // Check if we're in global cooldown
    if (activity.lastSpawnAt && (now - activity.lastSpawnAt) < globalCooldownMs) {
      return false;
    }

    // Check if this channel is monitored
    if (this.MONITORED_CHANNELS.length > 0 && 
        !this.MONITORED_CHANNELS.includes(channelId)) {
      return false;
    }

    // If we reach here, all conditions are met for a spawn opportunity
    return true;
  }

  /**
   * Checks if a game should spawn, combining the conditions with the spawn probability.
   */
  shouldSpawnGame(channelId: string): boolean {
    if (!this.canSpawnGame(channelId)) {
      return false;
    }

    // Random chance check
    return Math.random() < this.SPAWN_CHANCE;
  }

  /**
   * Marks that a spawn has happened in the given channel.
   * This consumes the activity window and updates the last spawn time.
   */
  async markSpawnHappened(channelId: string): Promise<void> {
    const now = Date.now();
    await this.repository.updateChannelSpawn(channelId, now, true);
  }

  /**
   * Resets the activity window for the given channel.
   * This is typically called after an event ends to allow future spawns.
   */
  async resetActivityWindow(channelId: string): Promise<void> {
    await this.repository.resetChannelActivityWindow(channelId);
  }

  /**
   * Checks if a message is from the bot itself.
   */
  isBotMessage(userId: string, botId: string): boolean {
    return userId === botId;
  }

  /**
   * Determines if a message should be tracked for activity purposes.
   * Bot messages (including the bot's own messages) are not tracked.
   */
  shouldTrackMessage(userId: string, botId: string): boolean {
    // Don't track bot's own messages
    if (this.isBotMessage(userId, botId)) {
      return false;
    }

    // Could add more filters here (e.g., ignore other bots)
    return true;
  }
}
