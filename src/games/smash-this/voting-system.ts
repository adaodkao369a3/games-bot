import { SmashRepository } from '../../database/repositories/smash-repository.js';
import { BobKunPersonality } from '../../services/bob-kun-personality.js';

/**
 * Simplified voting system for Smash events.
 * 
 * Each user can vote once per event.
 * Voting period is exactly 20 seconds.
 * Bot votes are rejected.
 */
export class VotingSystem {
  private repository = new SmashRepository();

  /**
   * Casts a vote for a player in an event.
   */
  async castVote(eventId: string, voterId: string, votedForId: string): Promise<{ success: boolean; message?: string }> {
    const event = this.repository.getEvent(eventId);
    if (!event) {
      return { success: false, message: 'Event not found' };
    }

    if (event.status !== 'active') {
      return { success: false, message: 'This event has already ended' };
    }

    // Check if user already voted
    const existingVote = this.repository.getVote(eventId, voterId);
    if (existingVote) {
      return { success: false, message: `${BobKunPersonality.emojis.confused} Bob Kun sees you already voted!` };
    }

    // Check if voted for player is in this event
    if (votedForId !== event.player1Id && votedForId !== event.player2Id) {
      return { success: false, message: 'Invalid vote target' };
    }

    // Record the vote
    await this.repository.addVote({
      eventId,
      voterId,
      votedForId,
      votedAt: Date.now(),
    });

    return { success: true };
  }

  /**
   * Gets the vote counts for an event.
   */
  getVoteCounts(eventId: string): { player1: number; player2: number } {
    return this.repository.countVotesForEvent(eventId);
  }

  /**
   * Determines the winner of an event.
   * Returns null if the event is tied.
   */
  determineWinner(eventId: string): { winnerId: string; player1Votes: number; player2Votes: number } | null {
    const { player1, player2 } = this.getVoteCounts(eventId);
    const event = this.repository.getEvent(eventId);
    
    if (!event) {
      return null;
    }

    // Determine winner (in case of tie, return null)
    let winnerId: string | null = null;
    if (player1 > player2) {
      winnerId = event.player1Id;
    } else if (player2 > player1) {
      winnerId = event.player2Id;
    } else {
      // Tie - return null
      return null;
    }

    if (!winnerId) {
      return null;
    }

    return { winnerId, player1Votes: player1, player2Votes: player2 };
  }

  /**
   * Checks if a user has voted in an event.
   */
  hasUserVoted(eventId: string, userId: string): boolean {
    const vote = this.repository.getVote(eventId, userId);
    return vote !== undefined;
  }

  /**
   * Gets the total number of votes in an event.
   */
  getTotalVotes(eventId: string): number {
    const votes = this.repository.getVotesForEvent(eventId);
    return votes.length;
  }
}
