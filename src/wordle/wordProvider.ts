/**
 * Interface for word providers that can supply and validate words
 */
export interface WordProvider {
  /**
   * Get a random word of the specified length
   */
  getRandomWord(length: number): Promise<string>;
  
  /**
   * Check if a word is valid (exists in the dictionary)
   */
  isValidWord(word: string): Promise<boolean>;
  
  /**
   * Clear any cached data
   */
  clearCache(): void;
}