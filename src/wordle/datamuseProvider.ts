import { WordProvider } from './wordProvider.js';

/**
 * Datamuse API implementation of WordProvider
 * Supports optional API key for future authentication
 */
export class DatamuseWordProvider implements WordProvider {
  private static readonly API_BASE = 'https://api.datamuse.com/words';
  private static readonly CACHE_SIZE_LIMIT = 1000;
  
  // Cache for word pools by length
  private wordPoolCache: Map<number, string[]> = new Map();
  
  // Cache for validated words
  private validationCache: Map<string, boolean> = new Map();
  
  // API key (optional, for future use)
  private apiKey: string | null = null;
  
  constructor() {
    // Check for API key in environment (optional, not required)
    this.apiKey = process.env.DATAMUSE_API_KEY || null;
  }
  
  /**
   * Get a random word of the specified length from Datamuse
   */
  async getRandomWord(length: number): Promise<string> {
    // Check cache first
    if (this.wordPoolCache.has(length) && this.wordPoolCache.get(length)!.length > 0) {
      const pool = this.wordPoolCache.get(length)!;
      const randomIndex = Math.floor(Math.random() * pool.length);
      return pool[randomIndex];
    }
    
    // Fetch from API
    try {
      const words = await this.fetchWordsByLength(length);
      
      if (words.length === 0) {
        throw new Error(`No ${length}-letter words found from Datamuse`);
      }
      
      // Cache the word pool
      this.wordPoolCache.set(length, words);
      
      // Return a random word
      const randomIndex = Math.floor(Math.random() * words.length);
      return words[randomIndex];
    } catch (error) {
      console.error('[DatamuseProvider] Failed to fetch words:', error);
      
      // Try to use cached pool if available
      if (this.wordPoolCache.has(length) && this.wordPoolCache.get(length)!.length > 0) {
        console.log('[DatamuseProvider] Using cached word pool as fallback');
        const pool = this.wordPoolCache.get(length)!;
        const randomIndex = Math.floor(Math.random() * pool.length);
        return pool[randomIndex];
      }
      
      throw new Error('Failed to fetch words from Datamuse and no cache available');
    }
  }
  
  /**
   * Check if a word is valid using Datamuse
   */
  async isValidWord(word: string): Promise<boolean> {
    const normalizedWord = word.toLowerCase().trim();
    
    // Check cache first
    if (this.validationCache.has(normalizedWord)) {
      return this.validationCache.get(normalizedWord)!;
    }
    
    // Validate basic format
    if (!/^[a-z]+$/.test(normalizedWord)) {
      this.validationCache.set(normalizedWord, false);
      return false;
    }
    
    try {
      // Check if word exists in Datamuse
      const result = await this.checkWordExists(normalizedWord);
      
      // Cache the result
      this.cacheValidationResult(normalizedWord, result);
      
      return result;
    } catch (error) {
      console.error('[DatamuseProvider] Failed to validate word:', error);
      
      // If API fails, we have to be conservative and reject the word
      // to avoid accepting invalid words
      return false;
    }
  }
  
  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.wordPoolCache.clear();
    this.validationCache.clear();
  }
  
  /**
   * Fetch words of a specific length from Datamuse
   */
  private async fetchWordsByLength(length: number): Promise<string[]> {
    const url = new URL(this.constructor.name as any === 'DatamuseWordProvider' 
      ? 'https://api.datamuse.com/words' 
      : DatamuseWordProvider.API_BASE);
    
    url.searchParams.append('sp', '?'.repeat(length)); // Pattern match for exact length
    url.searchParams.append('max', '100'); // Get up to 100 words
    
    const response = await this.makeApiRequest(url.toString());
    
    if (!response.ok) {
      throw new Error(`Datamuse API returned ${response.status}`);
    }
    
    const data = await response.json() as Array<{ word: string }>;
    
    // Extract and normalize words
    const words = data
      .map((item: { word: string }) => item.word.toLowerCase())
      .filter((word: string) => word.length === length && /^[a-z]+$/.test(word));
    
    return words;
  }
  
  /**
   * Check if a specific word exists in Datamuse
   */
  private async checkWordExists(word: string): Promise<boolean> {
    const url = new URL(DatamuseWordProvider.API_BASE);
    url.searchParams.append('sp', word);
    url.searchParams.append('max', '1');
    
    const response = await this.makeApiRequest(url.toString());
    
    if (!response.ok) {
      throw new Error(`Datamuse API returned ${response.status}`);
    }
    
    const data = await response.json() as Array<{ word: string }>;
    
    // Check if the exact word is in the results
    return data.some((item: { word: string }) => item.word.toLowerCase() === word.toLowerCase());
  }
  
  /**
   * Make an API request with optional authentication
   */
  private async makeApiRequest(url: string): Promise<Response> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    // Add API key if available (for future use)
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    return fetch(url, { headers });
  }
  
  /**
   * Cache a validation result with size limit management
   */
  private cacheValidationResult(word: string, isValid: boolean): void {
    // Enforce cache size limit
    if (this.validationCache.size >= DatamuseWordProvider.CACHE_SIZE_LIMIT) {
      // Remove oldest entries (simple FIFO)
      const keysToDelete = Array.from(this.validationCache.keys()).slice(0, 100);
      keysToDelete.forEach(key => this.validationCache.delete(key));
    }
    
    this.validationCache.set(word, isValid);
  }
}