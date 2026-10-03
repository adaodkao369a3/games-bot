/**
 * Shared tracking helpers for .goon and .edge (both commands read/write goon_edge_tracking).
 * Dates are handled as 'YYYY-MM-DD' text in "central time" (UTC-6 approximation, same as the old code),
 * which avoids Date/timezone drift on DATE columns.
 */
import { getClient } from '../database/client.js';

// ---- Tunables ---------------------------------------------------------------------------------
export const GOON_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes (halved while the power-up is active)
export const GOON_REWARD = 400; // was 900
export const GOON_STREAK_LIMIT = 3; // 3 goons -> edge block (existing behaviour, unchanged)
export const EDGE_BLOCK_DURATION_MS = 60 * 60 * 1000; // 1 hour (existing behaviour, unchanged)
export const GOON_DAILY_FREE_USES = 10; // uses above this per day cost GOON_EXTRA_USE_PENALTY
export const GOON_EXTRA_USE_PENALTY = 600;

export const EDGE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes (existing)
export const EDGE_REWARD = 200; // was 500
export const EDGE_DAILY_BONUS = 2000; // existing: bonus when the daily edge count hits 10
export const EDGE_DAILY_TARGET = 10;
export const EDGE_STREAK_STEP_PCT = 10; // each consecutive edge adds +10% ...
export const EDGE_STREAK_MAX_PCT = 50; // ... capped at +50%
// DEFAULT (owner didn't specify): a streak breaks if more than 30 minutes pass between edges, or the user uses .goon.
export const EDGE_STREAK_GAP_MS = 30 * 60 * 1000;
export const EDGE_POWERUP_STREAK = 10; // 10 edges in a row ...
export const GOON_POWERUP_DURATION_MS = 60 * 60 * 1000; // ... grants 1 hour of half goon cooldown

export interface GoonEdgeTracking {
  last_goon_used: Date | null;
  last_edge_used: Date | null;
  edge_daily_count: number;
  edge_daily_date: string | null; // YYYY-MM-DD
  goon_count: number;
  edge_blocked_until: Date | null;
  edge_streak: number;
  last_edge_streak_at: Date | null;
  goon_powerup_until: Date | null;
  goon_daily_count: number;
  goon_daily_date: string | null; // YYYY-MM-DD
}

export function centralDateString(now: number = Date.now()): string {
  return new Date(now - 6 * 3600000).toISOString().slice(0, 10);
}

/** Loads the tracking row, creating it if missing (safe under concurrent first use). */
export async function loadTracking(userId: string): Promise<GoonEdgeTracking> {
  const client = await getClient();
  try {
    await client.query(
      'INSERT INTO goon_edge_tracking (user_id, edge_daily_date) VALUES ($1, $2::date) ON CONFLICT (user_id) DO NOTHING',
      [userId, centralDateString()]
    );
    const r = await client.query(
      `SELECT last_goon_used, last_edge_used, edge_daily_count, edge_daily_date::text AS edge_daily_date,
              goon_count, edge_blocked_until, edge_streak, last_edge_streak_at, goon_powerup_until,
              goon_daily_count, goon_daily_date::text AS goon_daily_date
       FROM goon_edge_tracking WHERE user_id = $1`,
      [userId]
    );
    return r.rows[0] as GoonEdgeTracking;
  } finally {
    client.release();
  }
}

/**
 * Atomically replace the tracking state, but only if nobody else used the same command since we read it.
 * `guard` lists the columns that must still equal what we read (compare-and-swap), so spamming a command
 * can't claim the same cooldown twice. Returns false if someone beat us to it.
 */
export async function claimTracking(
  userId: string,
  before: GoonEdgeTracking,
  after: GoonEdgeTracking,
  guard: Array<keyof GoonEdgeTracking>
): Promise<boolean> {
  const cols: Array<keyof GoonEdgeTracking> = [
    'last_goon_used', 'last_edge_used', 'edge_daily_count', 'edge_daily_date', 'goon_count', 'edge_blocked_until',
    'edge_streak', 'last_edge_streak_at', 'goon_powerup_until', 'goon_daily_count', 'goon_daily_date',
  ];
  const dateCols = new Set(['edge_daily_date', 'goon_daily_date']);
  const values: any[] = [];
  const sets = cols.map((c) => {
    values.push(after[c]);
    return `${c} = $${values.length}${dateCols.has(c) ? '::date' : ''}`;
  });
  values.push(userId);
  const where = [`user_id = $${values.length}`];
  for (const g of guard) {
    values.push(before[g]);
    where.push(`${g} IS NOT DISTINCT FROM $${values.length}${dateCols.has(g) ? '::date' : ''}`);
  }
  const client = await getClient();
  try {
    const r = await client.query(`UPDATE goon_edge_tracking SET ${sets.join(', ')} WHERE ${where.join(' AND ')}`, values);
    return (r.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/** Bonus percent for the Nth consecutive edge (1st = +0%, 2nd = +10% ... capped). */
export function edgeStreakBonusPct(streak: number): number {
  return Math.min(EDGE_STREAK_MAX_PCT, Math.max(0, streak - 1) * EDGE_STREAK_STEP_PCT);
}
