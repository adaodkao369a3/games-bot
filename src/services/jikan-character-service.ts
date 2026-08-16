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
}

/**
 * Service for fetching and caching anime characters from Jikan API
 */
export class JikanCharacterService {
  private static instance: JikanCharacterService;
  private cache: Map<number, CachedCharacter> = new Map();
  private readonly API_BASE = 'https://api.jikan.moe/v4';
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;

  private constructor() {
    // Load cache from disk if available (future enhancement)
    this.loadCacheFromDisk();
  }

  static getInstance(): JikanCharacterService {
    if (!JikanCharacterService.instance) {
      JikanCharacterService.instance = new JikanCharacterService();
    }
    return JikanCharacterService.instance;
  }

  /**
   * Fetch a random anime character from Jikan API
   */
  async fetchRandomCharacter(): Promise<CachedCharacter | null> {
    try {
      const response = await fetch(`${this.API_BASE}/random/characters`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`[JikanService] API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json() as JikanResponse;
      const character = data.data;

      // Extract anime/source from the about field
      const anime = this.extractAnimeFromAbout(character.about);

      const cachedChar: CachedCharacter = {
        characterId: character.mal_id,
        name: character.name,
        imageUrl: character.images.jpg.image_url,
        anime: anime,
        cachedAt: Date.now(),
      };

      // Cache the character
      this.cache.set(character.mal_id, cachedChar);
      this.saveCacheToDisk();

      console.log(`[JikanService] Fetched character: ${character.name} (ID: ${character.mal_id})`);
      return cachedChar;

    } catch (error) {
      console.error('[JikanService] Error fetching random character:', error);
      return null;
    }
  }

  /**
   * Fetch two different random characters
   */
  async fetchTwoRandomCharacters(): Promise<[CachedCharacter | null, CachedCharacter | null]> {
    let char1 = await this.fetchRandomCharacterWithRetry();
    let char2: CachedCharacter | null = null;

    // Ensure we get two different characters
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      char2 = await this.fetchRandomCharacterWithRetry();
      
      if (char2 && char1 && char2.characterId !== char1.characterId) {
        break;
      }
      
      attempts++;
    }

    // If we couldn't get two different characters, try to use cached characters
    if (!char2 || (char1 && char2.characterId === char1.characterId)) {
      char2 = this.getRandomCachedCharacter(char1?.characterId);
    }

    return [char1, char2];
  }

  /**
   * Fetch random character with retry logic
   */
  private async fetchRandomCharacterWithRetry(): Promise<CachedCharacter | null> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      const character = await this.fetchRandomCharacter();
      if (character) {
        return character;
      }
      
      if (attempt < this.MAX_RETRIES) {
        await this.delay(this.RETRY_DELAY * attempt);
      }
    }
    
    console.error('[JikanService] Failed to fetch character after retries');
    return null;
  }

  /**
   * Get a random character from cache (excluding specified ID)
   */
  getRandomCachedCharacter(excludeId?: number): CachedCharacter | null {
    const cachedChars = Array.from(this.cache.values()).filter(
      char => char.imageUrl && char.characterId !== excludeId
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
    for (const [id, char] of this.cache.entries()) {
      if (now - char.cachedAt > this.CACHE_DURATION) {
        this.cache.delete(id);
      }
    }
    this.saveCacheToDisk();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Save cache to disk (simple JSON file)
   */
  private saveCacheToDisk(): void {
    // Future enhancement: persist to disk
    // For now, cache is in-memory only
  }

  /**
   * Load cache from disk
   */
  private loadCacheFromDisk(): void {
    // Future enhancement: load from disk
    // For now, cache starts empty
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
