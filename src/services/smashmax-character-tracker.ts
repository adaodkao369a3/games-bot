import * as fs from 'fs';
import * as path from 'path';

interface UsedCharacterData {
  usedCharacterIds: number[];
  version: number;
}

/**
 * Service for tracking used SmashMax character IDs persistently
 * Ensures characters are not repeated across games
 */
export class SmashMaxCharacterTracker {
  private static instance: SmashMaxCharacterTracker;
  private usedCharacterIds: Set<number> = new Set();
  private readonly TRACKER_FILE = path.join(process.cwd(), 'data', 'smashmax-used-characters.json');
  private readonly VERSION = 1;

  private constructor() {
    this.ensureDataDirectory();
    this.loadTrackerFromDisk();
  }

  static getInstance(): SmashMaxCharacterTracker {
    if (!SmashMaxCharacterTracker.instance) {
      SmashMaxCharacterTracker.instance = new SmashMaxCharacterTracker();
    }
    return SmashMaxCharacterTracker.instance;
  }

  /**
   * Mark character IDs as used
   */
  markCharactersAsUsed(characterIds: number[]): void {
    for (const id of characterIds) {
      this.usedCharacterIds.add(id);
    }
    this.saveTrackerToDisk();
    console.log(`[SmashMaxTracker] Marked ${characterIds.length} characters as used. Total used: ${this.usedCharacterIds.size}`);
  }

  /**
   * Check if a character ID has been used
   */
  isCharacterUsed(characterId: number): boolean {
    return this.usedCharacterIds.has(characterId);
  }

  /**
   * Get all used character IDs
   */
  getUsedCharacterIds(): Set<number> {
    return new Set(this.usedCharacterIds);
  }

  /**
   * Filter out used character IDs from a list
   */
  filterUsedCharacters(characterIds: number[]): number[] {
    return characterIds.filter(id => !this.usedCharacterIds.has(id));
  }

  /**
   * Filter out used characters from CachedCharacter array
   */
  filterUsedCachedCharacters<T extends { characterId: number }>(characters: T[]): T[] {
    return characters.filter(char => !this.usedCharacterIds.has(char.characterId));
  }

  /**
   * Get count of used characters
   */
  getUsedCount(): number {
    return this.usedCharacterIds.size;
  }

  /**
   * Remove specific character IDs from used list (for testing/admin purposes)
   */
  removeCharacterIds(characterIds: number[]): void {
    for (const id of characterIds) {
      this.usedCharacterIds.delete(id);
    }
    this.saveTrackerToDisk();
    console.log(`[SmashMaxTracker] Removed ${characterIds.length} characters from used list. Total used: ${this.usedCharacterIds.size}`);
  }

  /**
   * Ensure data directory exists
   */
  private ensureDataDirectory(): void {
    const dataDir = path.dirname(this.TRACKER_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * Save tracker to disk
   */
  private saveTrackerToDisk(): void {
    try {
      const trackerData: UsedCharacterData = {
        usedCharacterIds: Array.from(this.usedCharacterIds),
        version: this.VERSION,
      };
      fs.writeFileSync(this.TRACKER_FILE, JSON.stringify(trackerData, null, 2), 'utf-8');
    } catch (error) {
      console.error('[SmashMaxTracker] Failed to save tracker to disk:', error);
    }
  }

  /**
   * Load tracker from disk
   */
  private loadTrackerFromDisk(): void {
    try {
      if (fs.existsSync(this.TRACKER_FILE)) {
        const data = fs.readFileSync(this.TRACKER_FILE, 'utf-8');
        const trackerData: UsedCharacterData = JSON.parse(data);
        
        if (trackerData.version === this.VERSION) {
          this.usedCharacterIds = new Set(trackerData.usedCharacterIds);
          console.log(`[SmashMaxTracker] Loaded ${this.usedCharacterIds.size} used character IDs from tracker.`);
        } else {
          console.log('[SmashMaxTracker] Tracker version mismatch, starting fresh.');
        }
      }
    } catch (error) {
      console.error('[SmashMaxTracker] Failed to load tracker from disk:', error);
    }
  }
}
