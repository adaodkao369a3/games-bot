import fetch from 'node-fetch';

/**
 * Cache for GIF durations to avoid repeated downloads
 */
const durationCache = new Map<string, number>();

/**
 * Configuration for GIF duration detection
 */
const CONFIG = {
  DEFAULT_DURATION_MS: 3000, // Fallback duration when detection fails
  MIN_DURATION_MS: 1000, // Minimum allowed duration
  MAX_DURATION_MS: 30000, // Maximum allowed duration
  REQUEST_TIMEOUT_MS: 10000, // Timeout for fetching GIFs
  CACHE_SIZE_LIMIT: 100, // Maximum number of cached durations
};

/**
 * Fetch a URL following redirects safely
 */
async function fetchWithRedirects(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Attempt to detect GIF duration by parsing GIF structure
 * This is a simplified approach - for full GIF parsing, consider using gifuct-js
 */
async function detectGifDuration(buffer: Buffer): Promise<number | null> {
  try {
    // Check if it's a valid GIF (GIF89a or GIF87a header)
    const header = buffer.slice(0, 6).toString('ascii');
    if (!header.startsWith('GIF')) {
      return null;
    }

    // Simple heuristic: estimate based on file size
    // This is not accurate but serves as a fallback
    const fileSizeKB = buffer.length / 1024;

    // Heuristic: larger GIFs tend to be longer
    // This is a rough approximation
    if (fileSizeKB < 50) return 2000;
    if (fileSizeKB < 100) return 3000;
    if (fileSizeKB < 200) return 4000;
    if (fileSizeKB < 500) return 5000;
    return 6000;
  } catch (error) {
    console.error('[GIF_DURATION] Error parsing GIF:', error);
    return null;
  }
}

/**
 * Get the duration of a GIF in milliseconds
 * @param url The GIF URL
 * @returns Duration in milliseconds, or default if detection fails
 */
export async function getGifDuration(url: string): Promise<number> {
  // Check cache first
  if (durationCache.has(url)) {
    return durationCache.get(url)!;
  }

  try {
    // Fetch the GIF
    const response = await fetchWithRedirects(url);

    if (!response.ok) {
      console.warn(`[GIF_DURATION] Failed to fetch GIF: ${response.status} ${response.statusText}`);
      return CONFIG.DEFAULT_DURATION_MS;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('gif')) {
      console.warn(`[GIF_DURATION] Not a GIF: ${contentType}`);
      return CONFIG.DEFAULT_DURATION_MS;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Attempt to detect duration
    const detectedDuration = await detectGifDuration(buffer);

    if (detectedDuration !== null) {
      // Clamp to sensible limits
      const clampedDuration = Math.max(
        CONFIG.MIN_DURATION_MS,
        Math.min(CONFIG.MAX_DURATION_MS, detectedDuration)
      );

      // Cache the result
      cacheDuration(url, clampedDuration);

      return clampedDuration;
    }

    // Fallback to default
    cacheDuration(url, CONFIG.DEFAULT_DURATION_MS);
    return CONFIG.DEFAULT_DURATION_MS;
  } catch (error) {
    console.error('[GIF_DURATION] Error detecting duration:', error);
    cacheDuration(url, CONFIG.DEFAULT_DURATION_MS);
    return CONFIG.DEFAULT_DURATION_MS;
  }
}

/**
 * Cache a GIF duration
 */
function cacheDuration(url: string, duration: number): void {
  // Enforce cache size limit
  if (durationCache.size >= CONFIG.CACHE_SIZE_LIMIT) {
    // Remove oldest entry (first in map)
    const firstKey = durationCache.keys().next().value;
    durationCache.delete(firstKey);
  }

  durationCache.set(url, duration);
}

/**
 * Clear the duration cache (useful for testing or memory management)
 */
export function clearGifDurationCache(): void {
  durationCache.clear();
}

/**
 * Get cache statistics
 */
export function getGifDurationCacheStats(): { size: number; keys: string[] } {
  return {
    size: durationCache.size,
    keys: Array.from(durationCache.keys()),
  };
}
