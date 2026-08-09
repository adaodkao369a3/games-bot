import { SmashEventHandler } from '../games/smash-this/smash-event.js';
import { RecentUserTracker } from './recent-user-tracker.js';
import { ActivityTracker } from './activity-tracker.js';
import { SmashRepository } from '../database/repositories/smash-repository.js';
import { TextChannel } from 'discord.js';
import { config } from '../config/index.js';

/**
 * SmashScheduler handles automatic Smash event spawning with random delays.
 * 
 * Flow:
 * 1. Detect activity gap + renewed activity
 * 2. Select two random recent users
 * 3. Wait random 1-5 minutes
 * 4. Post Smash event
 * 5. 20-second voting
 * 6. Reveal winner
 */
export class SmashScheduler {
  private repository = new SmashRepository();
  private recentUserTracker = new RecentUserTracker();
  private activityTracker = new ActivityTracker();
  private pendingEvents: Map<string, NodeJS.Timeout> = new Map();
  private activeEvents: Map<string, SmashEventHandler> = new Map();

  /**
   * Checks if an automatic event should be triggered.
   * Called on every user message.
   */
  async checkForAutomaticEvent(channelId: string, guildId: string, botId: string): Promise<void> {
    // Check if there's already an active event in this channel
    const existingEvent = this.repository.getActiveEventInChannel(channelId);
    if (existingEvent) {
      return;
    }

    // Check if there's already a pending event scheduled
    if (this.pendingEvents.has(channelId)) {
      return;
    }

    // Check if activity conditions are met
    if (!this.activityTracker.shouldSpawnGame(channelId)) {
      return;
    }

    // Check if we have enough eligible users
    const eligibleUsers = this.recentUserTracker.getEligibleUsers(channelId, botId);
    if (eligibleUsers.length < 2) {
      return;
    }

    // All conditions met - schedule the event
    this.scheduleAutomaticEvent(channelId, guildId, botId);
  }

  /**
   * Schedules an automatic event with a random 1-5 minute delay.
   */
  private async scheduleAutomaticEvent(channelId: string, guildId: string, botId: string): Promise<void> {
    // Mark the activity window as consumed
    await this.activityTracker.markSpawnHappened(channelId);

    // Generate random delay between 1-5 minutes (in milliseconds)
    const minDelayMs = 1 * 60 * 1000; // 1 minute
    const maxDelayMs = 5 * 60 * 1000; // 5 minutes
    const randomDelayMs = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;

    // Schedule the event
    const timer = setTimeout(() => {
      this.executeAutomaticEvent(channelId, guildId, botId);
      this.pendingEvents.delete(channelId);
    }, randomDelayMs);

    this.pendingEvents.set(channelId, timer);
  }

  /**
   * Executes the automatic event after the delay.
   */
  private async executeAutomaticEvent(channelId: string, guildId: string, botId: string): Promise<void> {
    // Select two random recent users
    const selectedUsers = this.recentUserTracker.selectTwoRandomUsers(channelId, botId);
    if (!selectedUsers) {
      // Not enough eligible users anymore
      return;
    }

    // Create and start the event
    await this.startEvent(channelId, guildId, selectedUsers.user1, selectedUsers.user2, false);
  }

  /**
   * Starts a Smash event immediately (manual trigger).
   */
  async startManualEvent(
    channelId: string,
    guildId: string,
    botId: string,
    user1?: any,
    user2?: any
  ): Promise<{ success: boolean; message?: string }> {
    // Check if there's already an active event
    const existingEvent = this.repository.getActiveEventInChannel(channelId);
    if (existingEvent) {
      return { success: false, message: 'There is already an active Smash event in this channel!' };
    }

    let selectedUsers: { user1: any; user2: any } | null;

    if (user1 && user2) {
      // Convert Discord User objects to RecentUserActivity format
      const user1Data = {
        userId: user1.id,
        displayName: user1.displayName || user1.username,
        avatarUrl: user1.displayAvatarURL(),
        channelId,
        lastActiveAt: Date.now(),
      };
      const user2Data = {
        userId: user2.id,
        displayName: user2.displayName || user2.username,
        avatarUrl: user2.displayAvatarURL(),
        channelId,
        lastActiveAt: Date.now(),
      };
      selectedUsers = { user1: user1Data, user2: user2Data };
    } else {
      // Select two random recent users
      selectedUsers = this.recentUserTracker.selectTwoRandomUsers(channelId, botId);
      if (!selectedUsers) {
        return { success: false, message: 'Not enough eligible users. Need at least 2 recently active users.' };
      }
    }

    // Start the event immediately
    console.log(`[SmashScheduler] Starting manual event for users: ${selectedUsers.user1.displayName} and ${selectedUsers.user2.displayName}`);
    await this.startEvent(channelId, guildId, selectedUsers.user1, selectedUsers.user2, true);
    console.log(`[SmashScheduler] Manual event started successfully`);
    return { success: true };
  }

  /**
   * Starts a Smash event and posts it to the channel.
   */
  private async startEvent(
    channelId: string,
    guildId: string,
    player1: any,
    player2: any,
    isManual: boolean
  ): Promise<void> {
    console.log(`[SmashScheduler] startEvent called for players: ${player1.displayName} vs ${player2.displayName}`);
    
    // Create the event
    const smashEvent = new SmashEventHandler(channelId, guildId);
    const createdEvent = await smashEvent.createEvent(player1, player2, isManual);
    
    console.log(`[SmashScheduler] Event created with ID: ${createdEvent.eventId}`);
    
    // Store the active event
    this.activeEvents.set(channelId, smashEvent);

    // Post the event to the channel
    // This will be handled by the Discord client
    // For now, we'll just create the event in the database
    // The actual posting will be done by the command handler
    
    // Start the 20-second voting timer
    await smashEvent.startVoting();
    
    console.log(`[SmashScheduler] Voting period started for event: ${createdEvent.eventId}`);
  }

  /**
   * Cancels a pending event (e.g., if bot is shutting down).
   */
  cancelPendingEvent(channelId: string): void {
    const timer = this.pendingEvents.get(channelId);
    if (timer) {
      clearTimeout(timer);
      this.pendingEvents.delete(channelId);
    }
  }

  /**
   * Cancels an active event (e.g., if bot is shutting down).
   */
  cancelActiveEvent(channelId: string): void {
    const event = this.activeEvents.get(channelId);
    if (event) {
      event.cancel();
      this.activeEvents.delete(channelId);
    }
  }

  /**
   * Gets the active event for a channel.
   */
  getActiveEvent(channelId: string): SmashEventHandler | undefined {
    return this.activeEvents.get(channelId);
  }
}
