import { TrialGame } from './trial-game.js';
import { TrialConfig } from './trial-types.js';

class TrialManager {
  private activeTrials = new Map<string, TrialGame>();

  /**
   * Create a new trial
   */
  createTrial(config: TrialConfig, onTrialEnd?: () => void): TrialGame {
    const trial = new TrialGame(config, onTrialEnd);
    this.activeTrials.set(config.channelId, trial);
    return trial;
  }

  /**
   * Get active trial by channel
   */
  getTrial(channelId: string): TrialGame | undefined {
    return this.activeTrials.get(channelId);
  }

  /**
   * Check if channel has active trial
   */
  hasActiveTrial(channelId: string): boolean {
    return this.activeTrials.has(channelId);
  }

  /**
   * Remove trial
   */
  removeTrial(channelId: string): void {
    const trial = this.activeTrials.get(channelId);
    if (trial) {
      trial.cleanup();
      this.activeTrials.delete(channelId);
    }
  }

  /**
   * Clean up all trials
   */
  cleanupAll(): void {
    this.activeTrials.forEach(trial => trial.cleanup());
    this.activeTrials.clear();
  }
}

export const trialManager = new TrialManager();