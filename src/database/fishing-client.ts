import { getClient } from './client.js';

export interface FishingLoot {
  id: number;
  name: string;
  emoji: string;
  description: string | null;
  category: string;
  rarity: string;
  min_depth: number;
  max_depth: number | null;
  min_reward: number;
  max_reward: number;
  weight: number;
  reel_difficulty: string;
  enabled: boolean;
}

/**
 * Get all enabled fishing loot items
 */
export async function getFishingLoot(): Promise<FishingLoot[]> {
  const client = await getClient();
  try {
    const result = await client.query(
      'SELECT * FROM fishing_loot WHERE enabled = true'
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      description: row.description,
      category: row.category,
      rarity: row.rarity,
      min_depth: row.min_depth,
      max_depth: row.max_depth,
      min_reward: row.min_reward,
      max_reward: row.max_reward,
      weight: row.weight,
      reel_difficulty: row.reel_difficulty,
      enabled: row.enabled,
    }));
  } catch (error) {
    console.error('[Fishing Client] Error fetching loot:', error);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Get fishing loot items available at a specific depth
 */
export async function getLootAtDepth(depth: number): Promise<FishingLoot[]> {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT * FROM fishing_loot 
       WHERE enabled = true 
       AND min_depth <= $1 
       AND (max_depth IS NULL OR max_depth >= $1)`,
      [depth]
    );

    const loot = result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      description: row.description,
      category: row.category,
      rarity: row.rarity,
      min_depth: row.min_depth,
      max_depth: row.max_depth,
      min_reward: row.min_reward,
      max_reward: row.max_reward,
      weight: row.weight,
      reel_difficulty: row.reel_difficulty,
      enabled: row.enabled,
    }));

    // If no loot found, return default fallback loot
    if (loot.length === 0) {
      console.warn('[Fishing Client] No loot found at depth, using fallback');
      return getDefaultFallbackLoot(depth);
    }

    return loot;
  } catch (error) {
    console.error('[Fishing Client] Error fetching loot at depth:', error);
    // Return fallback loot on error
    return getDefaultFallbackLoot(depth);
  } finally {
    client.release();
  }
}

/**
 * Get fallback loot when database is empty or query fails
 */
function getDefaultFallbackLoot(depth: number): FishingLoot[] {
  // Simple fallback loot based on depth
  if (depth < 50) {
    return [
      {
        id: -1,
        name: 'Small Fish',
        emoji: '🐟',
        description: 'A tiny fish.',
        category: 'fish',
        rarity: 'common',
        min_depth: 0,
        max_depth: 100,
        min_reward: 50,
        max_reward: 150,
        weight: 10,
        reel_difficulty: 'easy',
        enabled: true,
      },
      {
        id: -2,
        name: 'Old Boot',
        emoji: '👢',
        description: 'Someone lost this.',
        category: 'trash',
        rarity: 'common',
        min_depth: 0,
        max_depth: 50,
        min_reward: 1,
        max_reward: 10,
        weight: 15,
        reel_difficulty: 'easy',
        enabled: true,
      },
    ];
  } else if (depth < 150) {
    return [
      {
        id: -3,
        name: 'Bass',
        emoji: '🐠',
        description: 'A decent catch.',
        category: 'fish',
        rarity: 'common',
        min_depth: 25,
        max_depth: 150,
        min_reward: 100,
        max_reward: 300,
        weight: 10,
        reel_difficulty: 'normal',
        enabled: true,
      },
      {
        id: -4,
        name: 'Gemstone',
        emoji: '💎',
        description: 'A shiny gem.',
        category: 'valuable',
        rarity: 'uncommon',
        min_depth: 100,
        max_depth: 300,
        min_reward: 800,
        max_reward: 2000,
        weight: 5,
        reel_difficulty: 'normal',
        enabled: true,
      },
    ];
  } else {
    return [
      {
        id: -5,
        name: 'Tuna',
        emoji: '🐟',
        description: 'A large fish.',
        category: 'fish',
        rarity: 'uncommon',
        min_depth: 75,
        max_depth: 250,
        min_reward: 400,
        max_reward: 800,
        weight: 8,
        reel_difficulty: 'normal',
        enabled: true,
      },
      {
        id: -6,
        name: 'Treasure Chest',
        emoji: '📦',
        description: 'A chest of goodies.',
        category: 'treasure',
        rarity: 'rare',
        min_depth: 250,
        max_depth: 500,
        min_reward: 5000,
        max_reward: 15000,
        weight: 3,
        reel_difficulty: 'hard',
        enabled: true,
      },
    ];
  }
}

/**
 * Select a random loot item based on weighted RNG
 */
export function selectWeightedLoot(loot: FishingLoot[]): FishingLoot | null {
  if (loot.length === 0) return null;

  const totalWeight = loot.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;

  for (const item of loot) {
    random -= item.weight;
    if (random <= 0) {
      return item;
    }
  }

  return loot[loot.length - 1];
}

/**
 * Calculate reward for a loot item (random between min and max)
 */
export function calculateReward(loot: FishingLoot): number {
  const range = loot.max_reward - loot.min_reward;
  const random = Math.random() * range;
  return Math.floor(loot.min_reward + random);
}

/**
 * Get reeling difficulty multiplier based on difficulty string
 */
export function getReelDifficultyMultiplier(difficulty: string): number {
  switch (difficulty) {
    case 'easy': return 0.8;
    case 'normal': return 1.0;
    case 'hard': return 1.3;
    case 'extreme': return 1.6;
    default: return 1.0;
  }
}
