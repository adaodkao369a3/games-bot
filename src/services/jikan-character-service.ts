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

interface JikanPaginatedResponse {
  data: JikanCharacter[];
  pagination: {
    has_next_page: boolean;
    last_visible_page: number;
  };
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

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Service for fetching and caching anime characters from Jikan API
 * Implements persistent cache, rate limiting, circuit breaker, and background population
 */
export class JikanCharacterService {
  private static instance: JikanCharacterService;
  private cache: Map<number, CachedCharacter> = new Map();
  private readonly API_BASE = 'https://api.jikan.moe/v4';
  private readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly CACHE_FILE = path.join(process.cwd(), 'data', 'jikan-cache.json');
  private readonly MIN_CACHE_SIZE = 10; // Minimum characters for cache-only mode
  private readonly TARGET_CACHE_SIZE = 20; // Target for background population
  private readonly MAX_RETRIES = 2;
  private readonly BASE_RETRY_DELAY = 2000;
  
  // Rate limiting
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;
  private readonly REQUEST_INTERVAL = 500; // 500ms between requests (2 req/sec)
  private lastRequestTime = 0;

  // Circuit breaker
  private circuitState: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private readonly FAILURE_THRESHOLD = 3;
  private circuitOpenUntil = 0;
  private readonly CIRCUIT_COOLDOWN = 60 * 1000; // 60 seconds

  // Background population
  private isPopulating = false;
  private populationPromise: Promise<void> | null = null;

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
   * Initialize background population (non-blocking)
   */
  initializeBackgroundPopulation(): void {
    // Don't wait for this, let it run in background
    this.populateCacheIfNeeded().catch(error => {
      console.log('[JikanService] Background population failed:', error);
    });
  }

  /**
   * Populate cache in background if needed
   */
  private async populateCacheIfNeeded(): Promise<void> {
    if (this.isPopulating) {
      return; // Already populating
    }

    const currentSize = this.getCacheSize();
    if (currentSize >= this.MIN_CACHE_SIZE) {
      console.log(`[JikanService] Cache has ${currentSize} characters; skipping API fetch.`);
      return;
    }

    this.isPopulating = true;
    console.log('[JikanService] Background cache population started.');

    try {
      const added = await this.fetchCharactersFromJikan(this.TARGET_CACHE_SIZE - currentSize);
      console.log(`[JikanService] Added ${added} characters to cache.`);
    } catch (error) {
      console.log('[JikanService] Background population failed:', error);
    } finally {
      this.isPopulating = false;
    }
  }

  /**
   * Fetch characters from Jikan using paginated endpoint
   */
  private async fetchCharactersFromJikan(targetCount: number): Promise<number> {
    if (this.isCircuitOpen()) {
      console.log('[JikanService] Circuit breaker is open; skipping fetch.');
      return 0;
    }

    let added = 0;
    let page = 1;
  
    while (added < targetCount && page <= 5) { // Limit to 5 pages max
      const response = await this.enqueueRequest(async () => {
        return this.fetchPaginatedCharacters(page);
      });

      if (!response) {
        this.recordFailure();
        break;
      }

      this.recordSuccess();

      for (const character of response) {
        if (this.validateAndCacheCharacter(character)) {
          added++;
        }
        if (added >= targetCount) break;
      }

      page++;
    }

    if (added > 0) {
      this.saveCacheToDisk();
    }

    return added;
  }

  /**
   * Fetch a paginated page of characters from Jikan
   */
  private async fetchPaginatedCharacters(page: number): Promise<JikanCharacter[] | null> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.API_BASE}/characters?page=${page}&limit=25&order_by=favorites&sort=desc`, {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json() as JikanPaginatedResponse;
          return data.data;
        }

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : this.BASE_RETRY_DELAY * attempt;
          console.log(`[JikanService] Jikan rate limited; circuit opened for ${waitTime}ms.`);
          this.openCircuit(waitTime);
          return null;
        }

        // Handle gateway errors
        if (response.status === 504 || response.status >= 500) {
          console.log(`[JikanService] Temporary gateway error. Retry ${attempt}/${this.MAX_RETRIES}.`);
          if (attempt < this.MAX_RETRIES) {
            const jitter = Math.random() * 500;
            await this.delay(this.BASE_RETRY_DELAY * Math.pow(2, attempt - 1) + jitter);
          }
          continue;
        }

        // Other errors
        console.log(`[JikanService] API error: ${response.status} ${response.statusText}`);
        return null;

      } catch (error) {
        console.log(`[JikanService] Network error on attempt ${attempt}/${this.MAX_RETRIES}.`);
        if (attempt < this.MAX_RETRIES) {
          const jitter = Math.random() * 500;
          await this.delay(this.BASE_RETRY_DELAY * Math.pow(2, attempt - 1) + jitter);
        }
      }
    }

    return null;
  }

  /**
   * Validate and cache a character
   */
  private validateAndCacheCharacter(character: JikanCharacter): boolean {
    // Validate required fields
    if (!character.mal_id || !character.name || !character.name.trim()) {
      return false;
    }

    // Check for valid image
    const imageUrl = character.images.jpg.image_url;
    if (!imageUrl) {
      return false;
    }

    // Skip if already cached
    if (this.cache.has(character.mal_id)) {
      return false;
    }

    const anime = this.extractAnimeFromAbout(character.about);

    const cachedChar: CachedCharacter = {
      characterId: character.mal_id,
      name: character.name,
      imageUrl: imageUrl,
      anime: anime,
      cachedAt: Date.now(),
      hasValidImage: true,
    };

    this.cache.set(character.mal_id, cachedChar);
    return true;
  }

  /**
   * Fetch two different random characters - cache only
   * This should NOT make Jikan requests during normal operation
   */
  async fetchTwoRandomCharacters(): Promise<[CachedCharacter | null, CachedCharacter | null]> {
    const validCachedChars = Array.from(this.cache.values()).filter(c => c.hasValidImage);
    
    // If we have at least 2 cached characters, use cache only
    if (validCachedChars.length >= 2) {
      console.log('[JikanService] Using cached characters.');
      return this.selectTwoFromCache(validCachedChars);
    }

    // If cache is too small, trigger background population and return what we have
    console.log(`[JikanService] Cache has only ${validCachedChars.length} characters. Triggering background population.`);
    this.initializeBackgroundPopulation();

    // If we have at least 2, use them anyway
    if (validCachedChars.length >= 2) {
      return this.selectTwoFromCache(validCachedChars);
    }

    // Not enough characters
    return [null, null];
  }

  /**
   * Select two different characters from cache
   */
  private selectTwoFromCache(cachedChars: CachedCharacter[]): [CachedCharacter | null, CachedCharacter | null] {
    if (cachedChars.length < 2) {
      return [cachedChars[0] || null, null];
    }

    // Fisher-Yates shuffle for better randomness
    const shuffled = [...cachedChars];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
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
   * Circuit breaker methods
   */
  private isCircuitOpen(): boolean {
    if (this.circuitState === CircuitState.OPEN) {
      if (Date.now() >= this.circuitOpenUntil) {
        this.circuitState = CircuitState.HALF_OPEN;
        console.log('[JikanService] Circuit breaker transitioning to half-open.');
        return false;
      }
      return true;
    }
    return false;
  }

  private openCircuit(duration?: number): void {
    this.circuitState = CircuitState.OPEN;
    this.circuitOpenUntil = Date.now() + (duration || this.CIRCUIT_COOLDOWN);
    console.log(`[JikanService] Circuit breaker opened for ${duration || this.CIRCUIT_COOLDOWN}ms.`);
  }

  private recordSuccess(): void {
    this.failureCount = 0;
    if (this.circuitState === CircuitState.HALF_OPEN) {
      this.circuitState = CircuitState.CLOSED;
      console.log('[JikanService] Circuit breaker closed after successful request.');
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.FAILURE_THRESHOLD) {
      this.openCircuit();
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
}
