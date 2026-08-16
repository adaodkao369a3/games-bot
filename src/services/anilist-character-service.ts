import * as fs from 'fs';
import * as path from 'path';

interface AniListCharacter {
  id: number;
  name: {
    first: string | null;
    last: string | null;
    full: string | null;
    native: string | null;
  };
  image: {
    large: string | null;
    medium: string | null;
  };
  media: {
    nodes: Array<{
      id: number;
      title: {
        english: string | null;
        romaji: string | null;
        native: string | null;
      };
    }>;
  } | null;
}

interface AniListResponse {
  data?: {
    Page: {
      characters: AniListCharacter[];
      pageInfo: {
        hasNextPage: boolean;
      };
    };
  };
  errors?: Array<{
    message: string;
    extensions?: {
      status?: number;
      code?: string;
    };
  }>;
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
 * Service for fetching and caching anime characters from AniList GraphQL API
 * Implements persistent cache, rate limiting, circuit breaker, and background population
 */
export class AniListCharacterService {
  private static instance: AniListCharacterService;
  private cache: Map<number, IndexedCachedCharacter> = new Map();
  private readonly API_BASE = 'https://graphql.anilist.co';
  private readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly CACHE_FILE = path.join(process.cwd(), 'data', 'anilist-cache.json');
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

  private constructor() {
    this.ensureDataDirectory();
    this.loadCacheFromDisk();
    this.startQueueProcessor();
  }

  static getInstance(): AniListCharacterService {
    if (!AniListCharacterService.instance) {
      AniListCharacterService.instance = new AniListCharacterService();
    }
    return AniListCharacterService.instance;
  }

  /**
   * Initialize background population (non-blocking)
   */
  initializeBackgroundPopulation(): void {
    this.populateCacheIfNeeded().catch(error => {
      console.log('[AniListService] Background population failed:', error);
    });
  }

  /**
   * Populate cache in background if needed
   */
  private async populateCacheIfNeeded(): Promise<void> {
    if (this.isPopulating) {
      return;
    }

    const currentSize = this.getCacheSize();
    if (currentSize >= this.MIN_CACHE_SIZE) {
      console.log(`[AniListService] Cache has ${currentSize} characters; skipping API fetch.`);
      return;
    }

    this.isPopulating = true;
    console.log('[AniListService] Background cache population started.');

    try {
      const added = await this.fetchCharactersFromAniList(this.TARGET_CACHE_SIZE - currentSize);
      console.log(`[AniListService] Added ${added} characters to cache.`);
    } catch (error) {
      console.log('[AniListService] Background population failed:', error);
    } finally {
      this.isPopulating = false;
    }
  }

  /**
   * Fetch characters from AniList using GraphQL
   */
  private async fetchCharactersFromAniList(targetCount: number): Promise<number> {
    if (this.isCircuitOpen()) {
      console.log('[AniListService] Circuit breaker is open; skipping fetch.');
      return 0;
    }

    let added = 0;
    let page = 1;
  
    while (added < targetCount && page <= 5) {
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
   * Fetch a paginated page of characters from AniList
   */
  private async fetchPaginatedCharacters(page: number): Promise<AniListCharacter[] | null> {
    const query = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          characters(sort: FAVOURITES_DESC) {
            id
            name {
              first
              last
              full
              native
            }
            image {
              large
              medium
            }
            media(perPage: 1, sort: POPULARITY_DESC) {
              nodes {
                id
                title {
                  english
                  romaji
                  native
                }
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const variables = {
      page: page,
      perPage: 25
    };

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(this.API_BASE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            query: query,
            variables: variables
          }),
        });

        if (response.ok) {
          const data = await response.json() as AniListResponse;
          
          if (data.errors) {
            console.log('[AniListService] GraphQL errors:', data.errors.map(e => e.message).join(', '));
            return null;
          }

          if (data.data?.Page?.characters) {
            return data.data.Page.characters;
          }

          return null;
        }

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : this.BASE_RETRY_DELAY * attempt;
          console.log(`[AniListService] Rate limited; circuit opened for ${waitTime}ms.`);
          this.openCircuit(waitTime);
          return null;
        }

        // Handle gateway errors
        if (response.status === 504 || response.status >= 500) {
          console.log(`[AniListService] Temporary gateway error. Retry ${attempt}/${this.MAX_RETRIES}.`);
          if (attempt < this.MAX_RETRIES) {
            const jitter = Math.random() * 500;
            await this.delay(this.BASE_RETRY_DELAY * Math.pow(2, attempt - 1) + jitter);
          }
          continue;
        }

        // Other errors
        console.log(`[AniListService] API error: ${response.status} ${response.statusText}`);
        return null;

      } catch (error) {
        console.log(`[AniListService] Network error on attempt ${attempt}/${this.MAX_RETRIES}.`);
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
  private validateAndCacheCharacter(character: AniListCharacter): boolean {
    // Get character name
    const name = character.name.full || character.name.first || character.name.last || character.name.native;
    if (!character.id || !name || !name.trim()) {
      return false;
    }

    // Check for valid image
    const imageUrl = character.image.large || character.image.medium;
    if (!imageUrl) {
      return false;
    }

    // Skip if already cached
    if (this.cache.has(character.id)) {
      return false;
    }

    // Get anime/media name
    let anime: string | null = null;
    if (character.media && character.media.nodes.length > 0) {
      const media = character.media.nodes[0];
      anime = media.title.english || media.title.romaji || media.title.native;
    }

    const cachedChar: IndexedCachedCharacter = {
      characterId: character.id,
      name: name,
      imageUrl: imageUrl,
      anime: anime,
      cachedAt: Date.now(),
      hasValidImage: true,
    };

    this.cache.set(character.id, cachedChar);
    return true;
  }

  /**
   * Fetch two different random characters - cache only
   */
  async fetchTwoRandomCharacters(): Promise<[CachedCharacter | null, CachedCharacter | null]> {
    const validCachedChars = Array.from(this.cache.values()).filter(c => c.hasValidImage);
    
    if (validCachedChars.length >= 2) {
      console.log('[AniListService] Using cached characters.');
      return this.selectTwoFromCache(validCachedChars);
    }

    console.log(`[AniListService] Cache has only ${validCachedChars.length} characters. Triggering background population.`);
    this.initializeBackgroundPopulation();

    if (validCachedChars.length >= 2) {
      return this.selectTwoFromCache(validCachedChars);
    }

    return [null, null];
  }

  /**
   * Select two different characters from cache
   */
  private selectTwoFromCache(cachedChars: IndexedCachedCharacter[]): [CachedCharacter | null, CachedCharacter | null] {
    if (cachedChars.length < 2) {
      return [cachedChars[0] || null, null];
    }

    // Fisher-Yates shuffle
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
   * Extract anime/source from the about field (not used for AniList)
   */
  private extractAnimeFromAbout(about: string | null): string | null {
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
      console.log(`[AniListService] Cleaned up ${removed} expired cache entries.`);
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
        console.log('[AniListService] Circuit breaker transitioning to half-open.');
        return false;
      }
      return true;
    }
    return false;
  }

  private openCircuit(duration?: number): void {
    this.circuitState = CircuitState.OPEN;
    this.circuitOpenUntil = Date.now() + (duration || this.CIRCUIT_COOLDOWN);
    console.log(`[AniListService] Circuit breaker opened for ${duration || this.CIRCUIT_COOLDOWN}ms.`);
  }

  private recordSuccess(): void {
    this.failureCount = 0;
    if (this.circuitState === CircuitState.HALF_OPEN) {
      this.circuitState = CircuitState.CLOSED;
      console.log('[AniListService] Circuit breaker closed after successful request.');
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
      console.error('[AniListService] Failed to save cache to disk:', error);
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
        
        const now = Date.now();
        for (const char of cacheData.characters) {
          if (now - char.cachedAt < this.CACHE_DURATION) {
            this.cache.set(char.characterId, char);
          }
        }
        
        console.log(`[AniListService] Loaded ${this.cache.size} characters from cache.`);
      }
    } catch (error) {
      console.error('[AniListService] Failed to load cache from disk:', error);
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Type alias for internal use
interface IndexedCachedCharacter extends CachedCharacter {}
