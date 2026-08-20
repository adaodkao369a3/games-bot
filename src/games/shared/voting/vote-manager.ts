import { VoteState, VoteResult, VotePhase } from './vote-types.js';

export class VoteManager {
  private state: VoteState;
  private currentPhase: VotePhase = VotePhase.VOTING;
  private votingDuration: number;
  private timers: NodeJS.Timeout[] = [];
  private onVoteEnd?: (result: VoteResult) => void;
  private onVoteUpdate?: () => void;

  constructor(votingDuration: number, onVoteEnd?: (result: VoteResult) => void, onVoteUpdate?: () => void) {
    this.state = {
      subject1Votes: 0,
      subject2Votes: 0,
      voters: new Set(),
    };
    this.votingDuration = votingDuration;
    this.onVoteEnd = onVoteEnd;
    this.onVoteUpdate = onVoteUpdate;
  }

  /**
   * Start the voting period
   */
  startVoting(): void {
    this.currentPhase = VotePhase.VOTING;
    this.state.votingStartTime = Date.now();

    const timeout = setTimeout(() => {
      if (this.currentPhase === VotePhase.VOTING) {
        this.endVoting();
      }
    }, this.votingDuration);

    this.timers.push(timeout);
  }

  /**
   * Handle a vote from a user
   */
  handleVote(userId: string, choice: 'subject1' | 'subject2'): { success: boolean; message: string } {
    if (this.currentPhase !== VotePhase.VOTING) {
      return { success: false, message: 'Voting is not active' };
    }

    if (this.state.voters.has(userId)) {
      return { success: false, message: 'You already voted!' };
    }

    this.state.voters.add(userId);
    if (choice === 'subject1') {
      this.state.subject1Votes++;
    } else {
      this.state.subject2Votes++;
    }

    if (this.onVoteUpdate) {
      this.onVoteUpdate();
    }

    return { success: true, message: 'Vote recorded!' };
  }

  /**
   * Check if a user has already voted
   */
  hasVoted(userId: string): boolean {
    return this.state.voters.has(userId);
  }

  /**
   * End voting and determine result
   */
  private endVoting(): void {
    this.currentPhase = VotePhase.RESULT;
    this.clearTimers();

    const result = this.calculateResult();
    if (this.onVoteEnd) {
      this.onVoteEnd(result);
    }
  }

  /**
   * Calculate the voting result
   */
  calculateResult(): VoteResult {
    let winner: 'subject1' | 'subject2' | 'tie' = 'tie';
    if (this.state.subject1Votes > this.state.subject2Votes) {
      winner = 'subject1';
    } else if (this.state.subject2Votes > this.state.subject1Votes) {
      winner = 'subject2';
    }

    return {
      winner,
      subject1Votes: this.state.subject1Votes,
      subject2Votes: this.state.subject2Votes,
    };
  }

  /**
   * Get current vote state
   */
  getState(): VoteState {
    return { ...this.state };
  }

  /**
   * Get current phase
   */
  getPhase(): VotePhase {
    return this.currentPhase;
  }

  /**
   * Get remaining voting time in seconds
   */
  getRemainingTime(): number {
    if (!this.state.votingStartTime || this.currentPhase !== VotePhase.VOTING) {
      return 0;
    }
    const elapsed = Date.now() - this.state.votingStartTime;
    return Math.max(0, Math.ceil((this.votingDuration - elapsed) / 1000));
  }

  /**
   * Force end voting (for cleanup)
   */
  forceEnd(): void {
    if (this.currentPhase === VotePhase.VOTING) {
      this.endVoting();
    }
    this.currentPhase = VotePhase.FINISHED;
  }

  /**
   * Clean up timers
   */
  cleanup(): void {
    this.clearTimers();
    this.currentPhase = VotePhase.FINISHED;
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers = [];
  }
}