import { SmashRepository } from '../../database/repositories/smash-repository.js';
import { RecentUserActivity, SmashEvent } from '../../database/schema.js';
import { randomUUID } from 'crypto';

/**
 * SmashEventHandler handles a single standalone Smash This event.
 * 
 * Each event is independent:
 * - Select two users
 * - 20-second voting period
 * - Reveal winner or tie
 * - Done
 * 
 * No tournaments, no rounds, no brackets.
 */
export class SmashEventHandler {
  private repository = new SmashRepository();
  private eventId: string;
  private channelId: string;
  private guildId: string;
  private votingDurationMs: number = 20 * 1000; // 20 seconds
  private votingTimer?: NodeJS.Timeout;

  constructor(channelId: string, guildId: string) {
    this.eventId = randomUUID();
    this.channelId = channelId;
    this.guildId = guildId;
  }

  /**
   * Creates and starts a new Smash event.
   */
  async createEvent(
    player1: RecentUserActivity,
    player2: RecentUserActivity,
    isManual: boolean = false
  ): Promise<SmashEvent> {
    const event = await this.repository.createEvent({
      eventId: this.eventId,
      guildId: this.guildId,
      channelId: this.channelId,
      player1Id: player1.userId,
      player1DisplayName: player1.displayName,
      player1AvatarUrl: player1.avatarUrl,
      player2Id: player2.userId,
      player2DisplayName: player2.displayName,
      player2AvatarUrl: player2.avatarUrl,
      createdAt: Date.now(),
      isManual,
    });

    return event;
  }

  /**
   * Starts the 20-second voting period.
   * Returns a promise that resolves when voting ends.
   */
  async startVoting(): Promise<void> {
    await this.repository.updateEvent(this.eventId, {
      votingStartedAt: Date.now(),
    });

    return new Promise((resolve) => {
      // Set timer for 20 seconds
      this.votingTimer = setTimeout(() => {
        this.endVoting();
        resolve();
      }, this.votingDurationMs);
    });
  }

  /**
   * Casts a vote for a player.
   */
  async castVote(voterId: string, votedForId: string): Promise<{ success: boolean; message?: string }> {
    const event = this.repository.getEvent(this.eventId);
    if (!event) {
      return { success: false, message: 'Event not found' };
    }

    if (event.status !== 'active') {
      return { success: false, message: 'This event has already ended' };
    }

    // Check if user already voted
    const existingVote = this.repository.getVote(this.eventId, voterId);
    if (existingVote) {
      return { success: false, message: 'You have already voted!' };
    }

    // Check if voted for player is in this event
    if (votedForId !== event.player1Id && votedForId !== event.player2Id) {
      return { success: false, message: 'Invalid vote target' };
    }

    // Record the vote
    await this.repository.addVote({
      eventId: this.eventId,
      voterId,
      votedForId,
      votedAt: Date.now(),
    });

    return { success: true };
  }

  /**
   * Ends the voting period and determines the winner.
   */
  private async endVoting(): Promise<void> {
    const event = this.repository.getEvent(this.eventId);
    if (!event || event.status !== 'active') {
      return;
    }

    const { player1, player2 } = this.repository.countVotesForEvent(this.eventId);
    
    await this.repository.updateEvent(this.eventId, {
      votingEndedAt: Date.now(),
      player1Votes: player1,
      player2Votes: player2,
    });

    // Determine winner or tie
    if (player1 > player2) {
      await this.repository.updateEvent(this.eventId, {
        status: 'completed',
        winnerId: event.player1Id,
      });
    } else if (player2 > player1) {
      await this.repository.updateEvent(this.eventId, {
        status: 'completed',
        winnerId: event.player2Id,
      });
    } else {
      // Tie
      await this.repository.updateEvent(this.eventId, {
        status: 'tie',
      });
    }
  }

  /**
   * Gets the current event state.
   */
  getEvent(): SmashEvent | undefined {
    return this.repository.getEvent(this.eventId);
  }

  /**
   * Gets the vote counts.
   */
  getVoteCounts(): { player1: number; player2: number } {
    return this.repository.countVotesForEvent(this.eventId);
  }

  /**
   * Cancels the event (e.g., if bot is shutting down).
   */
  async cancel(): Promise<void> {
    if (this.votingTimer) {
      clearTimeout(this.votingTimer);
      this.votingTimer = undefined;
    }
    
    await this.repository.updateEvent(this.eventId, {
      status: 'completed',
      votingEndedAt: Date.now(),
    });
  }

  /**
   * Gets the event ID.
   */
  getEventId(): string {
    return this.eventId;
  }
}
