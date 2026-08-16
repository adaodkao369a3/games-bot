import * as fs from 'fs';
import * as path from 'path';

interface JikanCharacter {
  mal_id: number;
  name: string;
  images: {
    jpg: {
      image_url: string | null;
    };
  };
  about: string | null;
}

interface JikanResponse {
  data: JikanCharacter;
}

export interface CachedCharacter {
  characterId: number;
  name: string;
  imageUrl: string | null;
  anime: string | null;
  cachedAt: number;
  hasValidImage: boolean;
}

interface CacheEntry {
  characterId: number;
  name: string;
  imageUrl: string | null;
  anime: string | null;
  cachedAt: number;
  hasValidImage: boolean;
}

interface CacheData {
  characters: CacheEntry[];
  version: number;
}

/**
 * Service for fetching and caching anime characters from Jikan API
 * Implements persistent cache, rate limiting, and proper error backoff
 */
export class JikanCharacterService {
  private static instance: JikanCharacterService;
  private cache: Map<number, CachedCharacter> = new Map();
  private readonly API_BASE = 'https://api.jikan.moe/v4';
  private readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly CACHE_FILE = path.join(process.cwd(), 'data', 'jikan-cache.json');
  private readonly MIN_CACHE_SIZE = 20; // Minimum characters needed before using cache-only
  private readonly MAX_RETRIES = 2; // Reduced from 3
  private readonly BASE_RETRY_DELAY = 2000; // Increased from 1000
  
  // Rate limiting
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;
  private readonly REQUEST_INTERVAL = 400; // 400ms between requests (2.5 req/sec)
  private lastRequestTime = 0;

  private constructor() {
    this.ensureDataDirectory();
    this.loadCacheFromDisk();
    this.startQueueProcessor();
  }

  static getInstance(): JikanCharacterService {
    if (!JikanCharacterService.instance) {
      JikanCharacterService.instance = new JikanCharacterService();
    }
    return JikanCharacterService.instance;
  }

  /**
   * Fetch a random anime character from Jikan API with rate limiting and proper backoff
   */
  async fetchRandomCharacter(): Promise<CachedCharacter | null> {
    return this.enqueueRequest(async () => {
      return this.fetchRandomCharacterInternal();
    });
  }

  /**
   * Internal fetch implementation with retry logic and backoff
   */
  private async fetchRandomCharacterInternal(): Promise<CachedCharacter | null> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.API_BASE}/random/characters`, {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json() as JikanResponse;
          const character = data.data;

          const anime = this.extractAnimeFromAbout(character.about);
          const hasValidImage = !!character.images.jpg.image_url;

          const cachedChar: CachedCharacter = {
            characterId: character.mal_id,
            name: character.name,
            imageUrl: character.images.jpg.image_url,
            anime: anime,
            cachedAt: Date.now(),
            hasValidImage: hasValidImage,
          };

          this.cache.set(character.mal_id, cachedChar);
          this.saveCacheToDisk();

          console.log(`[JikanService] Fetched character: ${character.name} (ID: ${character.mal_id})`);
          return cachedChar;
        }

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : this.BASE_RETRY_DELAY * attempt;
          console.log(`[JikanService] Rate limited. Waiting ${waitTime}ms before retry.`);
          await this.delay(waitTime);
          continue;
        }

        // Handle gateway errors
        if (response.status === 504 || response.status >= 500) {
          console.log(`[JikanService] Temporary gateway error. Retry ${attempt}/${this.MAX_RETRIES}.`);
          if (attempt < this.MAX_RETRIES) {
            await this.delay(this.BASE_RETRY_DELAY * Math.pow(2, attempt - 1)); // Exponential backoff
          }
          continue;
        }

        // Other errors
        console.log(`[JikanService] API error: ${response.status} ${response.statusText}`);
        return null;

      } catch (error) {
        console.log(`[JikanService] Network error on attempt ${attempt}/${this.MAX_RETRIES}.`);
        if (attempt < this.MAX_RETRIES) {
          await this.delay(this.BASE_RETRY_DELAY * Math.pow(2, attempt - 1));
        }
      }
    }

    console.log('[JikanService] Failed to fetch character after retries');
    return null;
  }

  /**
   * Fetch two different random characters, prioritizing cache
   */
  async fetchTwoRandomCharacters(): Promise<[CachedCharacter | null, CachedCharacter | null]> {
    const validCachedChars = Array.from(this.cache.values()).filter(c => c.hasValidImage);
    
    // If we have enough cached characters, use cache only
    if (validCachedChars.length >= this.MIN_CACHE_SIZE) {
      console.log('[JikanService] Using cached character data.');
      return this.selectTwoFromCache(validCachedChars);
    }

    // If cache is small, try to fetch one new character and use cache for the other
    console.log(`[JikanService] Cache size ${validCachedChars.length} below threshold. Fetching new characters.`);
    
    const char1 = await this.fetchRandomCharacter();
    if (!char1) {
      // If fetch failed, try to use cache only if available
      if (validCachedChars.length >= 2) {
        console.log('[JikanService] Fetch failed, using cached characters.');
        return this.selectTwoFromCache(validCachedChars);
      }
      return [null, null];
    }

    // Try to get second character from cache (different from first)
    const char2 = this.getRandomCachedCharacter(char1.characterId);
    if (char2) {
      return [char1, char2];
    }

    // If cache doesn't have enough, fetch second character
    const char2Fetched = await this.fetchRandomCharacter();
    if (char2Fetched && char2Fetched.characterId !== char1.characterId) {
      return [char1, char2Fetched];
    }

    // Last resort: use cache even if small
    if (validCachedChars.length >= 2) {
      return this.selectTwoFromCache(validCachedChars);
    }

    return [char1, null];
  }

  /**
   * Select two different characters from cache
   */
  private selectTwoFromCache(cachedChars: CachedCharacter[]): [CachedCharacter | null, CachedCharacter | null] {
    if (cachedChars.length < 2) {
      return [cachedChars[0] || null, null];
    }

    // Shuffle and pick two different
    const shuffled = [...cachedChars].sort(() => Math.random() - 0.5);
    return [shuffled[0], shuffled[1]];
  }


  /**
   * Get a random character from cache (excluding specified ID)
   */
  getRandomCachedCharacter(excludeId?: number): CachedCharacter | null {
    const cachedChars = Array.from(this.cache.values()).filter(
      char => char.hasValidImage && char.characterId !== excludeId
    );

    if (cachedChars.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * cachedChars.length);
    return cachedChars[randomIndex];
  }

  /**
   * Extract anime/source from the about field
   */
  private extractAnimeFromAbout(about: string | null): string | null {
    if (!about) return null;

    // Try to find anime name in the about text
    // Common patterns: "from [anime]", "in [anime]", "[anime] character"
    const patterns = [
      /from\s+(.+?)(?:\.|,|$)/i,
      /in\s+(.+?)(?:\.|,|$)/i,
      /(.+?)\s+character/i,
    ];

    for (const pattern of patterns) {
      const match = about.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Clean up expired cache entries
   */
  cleanExpiredCache(): void {
    const now = Date.now();
    let removed = 0;
    for (const [id, char] of this.cache.entries()) {
      if (now - char.cachedAt > this.CACHE_DURATION) {
        this.cache.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      this.saveCacheToDisk();
      console.log(`[JikanService] Cleaned up ${removed} expired cache entries.`);
    }
  }

  /**
   * Get cache size (only valid characters)
   */
  getCacheSize(): number {
    return Array.from(this.cache.values()).filter(c => c.hasValidImage).length;
  }

  /**
   * Mark character as having invalid image
   */
  markCharacterInvalid(characterId: number): void {
    const char = this.cache.get(characterId);
    if (char) {
      char.hasValidImage = false;
      this.saveCacheToDisk();
    }
  }

  /**
   * Enqueue a request to be processed with rate limiting
   */
  private async enqueueRequest<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Start the queue processor to handle rate limiting
   */
  private startQueueProcessor(): void {
    const processQueue = async () => {
      if (this.isProcessingQueue || this.requestQueue.length === 0) {
        return;
      }

      this.isProcessingQueue = true;

      while (this.requestQueue.length > 0) {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.REQUEST_INTERVAL) {
          await this.delay(this.REQUEST_INTERVAL - timeSinceLastRequest);
        }

        const request = this.requestQueue.shift();
        if (request) {
          this.lastRequestTime = Date.now();
          await request();
        }
      }

      this.isProcessingQueue = false;
    };

    // Process queue periodically
    setInterval(processQueue, 100);
  }

  /**
   * Ensure data directory exists
   */
  private ensureDataDirectory(): void {
    const dataDir = path.dirname(this.CACHE_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * Save cache to disk
   */
  private saveCacheToDisk(): void {
    try {
      const cacheData: CacheData = {
        characters: Array.from(this.cache.values()),
        version: 1,
      };
      fs.writeFileSync(this.CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf-8');
    } catch (error) {
      console.error('[JikanService] Failed to save cache to disk:', error);
    }
  }

  /**
   * Load cache from disk
   */
  private loadCacheFromDisk(): void {
    try {
      if (fs.existsSync(this.CACHE_FILE)) {
        const data = fs.readFileSync(this.CACHE_FILE, 'utf-8');
        const cacheData: CacheData = JSON.parse(data);
        
        // Clean expired entries
        const now = Date.now();
        for (const char of cacheData.characters) {
          if (now - char.cachedAt < this.CACHE_DURATION) {
            this.cache.set(char.characterId, char);
          }
        }
        
        console.log(`[JikanService] Loaded ${this.cache.size} characters from cache.`);
      }
    } catch (error) {
      console.error('[JikanService] Failed to load cache from disk:', error);
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Bootstrap cache with initial characters if empty
   * Call this during bot startup to populate cache
   */
  async bootstrapCache(targetSize: number = 50): Promise<void> {
    const currentSize = this.getCacheSize();
    if (currentSize >= targetSize) {
      console.log(`[JikanService] Cache already has ${currentSize} characters. Skipping bootstrap.`);
      return;
    }

    console.log(`[JikanService] Bootstrapping cache from ${currentSize} to ${targetSize} characters...`);
    
    const needed = targetSize - currentSize;
    let fetched = 0;
    
    for (let i = 0; i < needed; i++) {
      const char = await this.fetchRandomCharacter();
      if (char && char.hasValidImage) {
        fetched++;
      }
      // Small delay between bootstrap requests to be gentle
      await this.delay(500);
    }
    
    console.log(`[JikanService] Bootstrap complete. Fetched ${fetched} new characters.`);
  }
}
