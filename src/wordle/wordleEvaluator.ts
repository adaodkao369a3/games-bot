/**
 * Wordle evaluation logic with proper duplicate letter handling
 */

export enum LetterState {
  CORRECT = 'correct',       // Green: correct letter in correct position
  WRONG_POSITION = 'wrong_position', // Yellow: correct letter in wrong position
  NOT_FOUND = 'not_found'    // Gray: letter not in word
}

export interface GuessResult {
  letters: LetterState[];
  isCorrect: boolean;
}

export interface EvaluatedGuess {
  word: string;
  result: GuessResult;
  player: string;
  timestamp: number;
}

/**
 * Evaluate a guess against the target word using proper Wordle rules
 */
export class WordleEvaluator {
  /**
   * Evaluate a guess against the target word
   * Handles duplicate letters correctly
   */
  static evaluate(guess: string, target: string): GuessResult {
    const normalizedGuess = guess.toLowerCase();
    const normalizedTarget = target.toLowerCase();
    
    if (normalizedGuess.length !== normalizedTarget.length) {
      throw new Error('Guess length must match target length');
    }
    
    const result: LetterState[] = Array(normalizedGuess.length).fill(LetterState.NOT_FOUND);
    const targetLetterCounts = this.getLetterCounts(normalizedTarget);
    
    // First pass: mark correct positions (green)
    for (let i = 0; i < normalizedGuess.length; i++) {
      const guessLetter = normalizedGuess[i];
      const targetLetter = normalizedTarget[i];
      
      if (guessLetter === targetLetter) {
        result[i] = LetterState.CORRECT;
        targetLetterCounts[guessLetter]--;
      }
    }
    
    // Second pass: mark wrong positions (yellow)
    for (let i = 0; i < normalizedGuess.length; i++) {
      const guessLetter = normalizedGuess[i];
      
      // Skip if already marked as correct
      if (result[i] === LetterState.CORRECT) {
        continue;
      }
      
      // Check if letter exists in target and we haven't used all occurrences
      if (targetLetterCounts[guessLetter] > 0) {
        result[i] = LetterState.WRONG_POSITION;
        targetLetterCounts[guessLetter]--;
      }
    }
    
    const isCorrect = result.every(state => state === LetterState.CORRECT);
    
    return { letters: result, isCorrect };
  }
  
  /**
   * Count letter occurrences in a word
   */
  private static getLetterCounts(word: string): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const letter of word) {
      counts[letter] = (counts[letter] || 0) + 1;
    }
    
    return counts;
  }
  
  /**
   * Check if a guess is valid format (correct length, only letters)
   */
  static isValidFormat(guess: string, expectedLength: number): boolean {
    const normalized = guess.toLowerCase().trim();
    return normalized.length === expectedLength && /^[a-z]+$/.test(normalized);
  }
  
  /**
   * Normalize a guess (lowercase, trim)
   */
  static normalizeGuess(guess: string): string {
    return guess.toLowerCase().trim();
  }
}