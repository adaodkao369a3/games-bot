/**
 * Talent Agency: pure game logic. No I/O, no Discord, no DB. Easy to unit test.
 */

export const BLOCK_MINUTES = 30;
export const BLOCK_MS = BLOCK_MINUTES * 60 * 1000;
export const MAX_BLOCKS = 4; // 2 hours of work per trip
export const MAX_WORKING = 4; // characters out at once
export const MAX_ROSTER = 20; // size of the pool
export const MAX_LEVEL = 10;
export const MAX_STAMINA = 100;
export const STAMINA_REGEN_PER_BLOCK = 10; // per 30 min while resting
export const SCOUT_COOLDOWN_MS = 30 * 60 * 1000;

export interface TierDef {
  tier_key: string;
  label: string;
  sort_order: number;
  scout_weight: number;
  recruit_price: number;
  base_payout: number;
  care_price: number;
}

export interface CharacterDef {
  slug: string;
  name: string;
  tier_key: string;
  kind: string;
  blurb: string;
  image_file: string;
  recruit_price: number;
  base_payout: number;
  stamina_cost: number;
  enabled?: boolean;
}

export interface StaminaRow {
  stamina: number;
  stamina_updated_at: Date;
  status: 'resting' | 'working' | string;
}

/** Lazy stamina: stored value + 10 per whole 30 min while resting (capped at 100). Frozen while working. */
export function currentStamina(row: StaminaRow, now: Date = new Date()): number {
  if (row.status === 'working') return row.stamina;
  const elapsed = now.getTime() - new Date(row.stamina_updated_at).getTime();
  const blocks = Math.max(0, Math.floor(elapsed / BLOCK_MS));
  return Math.min(MAX_STAMINA, row.stamina + blocks * STAMINA_REGEN_PER_BLOCK);
}

/** 1 + 0.08 x (level - 1). Level 10 = 1.72x. */
export function levelMultiplier(level: number): number {
  return (100 + 8 * (level - 1)) / 100;
}

/** Coins per 30-min block at a level (integer, rounded). */
export function payoutPerBlock(character: Pick<CharacterDef, 'base_payout'>, level: number): number {
  return Math.round((character.base_payout * (100 + 8 * (level - 1))) / 100);
}

/** Cost to go from `level` to `level + 1`: 10% of recruit price x level. Null at max level. */
export function trainCost(character: Pick<CharacterDef, 'recruit_price'>, level: number): number | null {
  if (level >= MAX_LEVEL) return null;
  return Math.ceil((character.recruit_price * level) / 10);
}

/** Care price scales with missing stamina, rounded up, minimum 1 if anything is missing. */
export function careCost(tier: Pick<TierDef, 'care_price'>, stamina: number): number {
  const missing = MAX_STAMINA - Math.max(0, Math.min(MAX_STAMINA, stamina));
  if (missing <= 0) return 0;
  return Math.max(1, Math.ceil((tier.care_price * missing) / 100));
}

export interface WorkResult {
  blocks: number;
  coins: number;
  staminaSpent: number;
}

/**
 * Whole 30-min blocks worked (cap 4), also limited by stamina:
 * a block can't start with less than the character's stamina cost left.
 */
export function workEarnings(
  character: Pick<CharacterDef, 'base_payout' | 'stamina_cost'>,
  level: number,
  staminaAtStart: number,
  startedAt: Date,
  now: Date = new Date()
): WorkResult {
  const elapsed = Math.max(0, now.getTime() - new Date(startedAt).getTime());
  const timeBlocks = Math.min(MAX_BLOCKS, Math.floor(elapsed / BLOCK_MS));
  const staminaBlocks = Math.floor(Math.max(0, staminaAtStart) / character.stamina_cost);
  const blocks = Math.max(0, Math.min(timeBlocks, staminaBlocks));
  return {
    blocks,
    coins: blocks * payoutPerBlock(character, level),
    staminaSpent: blocks * character.stamina_cost,
  };
}

/**
 * Pick a character by tier odds. Only tiers that still have candidates take part,
 * so odds are renormalized across the rest. Uniform within a tier. Null if no candidates.
 * `rng` returns [0,1) (injectable for tests).
 */
export function weightedPick<T extends Pick<CharacterDef, 'tier_key'>>(
  characters: T[],
  tiers: Pick<TierDef, 'tier_key' | 'scout_weight'>[],
  rng: () => number = Math.random
): T | null {
  if (characters.length === 0) return null;
  const byTier = new Map<string, T[]>();
  for (const c of characters) {
    const list = byTier.get(c.tier_key) ?? [];
    list.push(c);
    byTier.set(c.tier_key, list);
  }
  const eligible = tiers.filter((t) => byTier.has(t.tier_key) && t.scout_weight > 0);
  if (eligible.length === 0) {
    // Candidates exist but no tier has positive weight: fall back to uniform.
    return characters[Math.min(characters.length - 1, Math.floor(rng() * characters.length))];
  }
  const total = eligible.reduce((sum, t) => sum + t.scout_weight, 0);
  let roll = rng() * total;
  let chosen = eligible[eligible.length - 1];
  for (const t of eligible) {
    if (roll < t.scout_weight) {
      chosen = t;
      break;
    }
    roll -= t.scout_weight;
  }
  const pool = byTier.get(chosen.tier_key)!;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/** 10-segment stamina bar, e.g. `▰▰▰▰▰▰▰▱▱▱ 70/100`. */
export function staminaBar(stamina: number): string {
  const s = Math.max(0, Math.min(MAX_STAMINA, Math.round(stamina)));
  const filled = Math.round(s / 10);
  return `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)} ${s}/${MAX_STAMINA}`;
}

/** "1h 5m", "12m", "45s". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m${h === 0 && m < 5 && s > 0 ? ` ${s}s` : ''}`;
  return `${s}s`;
}
