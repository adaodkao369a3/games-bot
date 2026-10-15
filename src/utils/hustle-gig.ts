/**
 * Shared tracking helpers for .hustle and .gig (both commands read/write hustle_gig_tracking).
 * Dates are handled as 'YYYY-MM-DD' text in "central time" (UTC-6 approximation, same as the old code),
 * which avoids Date/timezone drift on DATE columns.
 */
import { getClient } from '../database/client.js';

// ---- Tunables ---------------------------------------------------------------------------------
export const GIG_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
export const GIG_REWARD = 400; // normal reward
export const GIG_REWARD_REDUCED = 200; // reward after daily limit
export const GIG_DAILY_FREE_USES = 3; // first 3 gigs per day get full reward

export const HUSTLE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
export const HUSTLE_REWARD = 200; // base reward

export interface HustleGigTracking {
  last_gig_used: Date | null;
  last_hustle_used: Date | null;
  gig_daily_count: number;
  gig_daily_date: string | null; // YYYY-MM-DD
}

export function centralDateString(now: number = Date.now()): string {
  return new Date(now - 6 * 3600000).toISOString().slice(0, 10);
}

/** Loads the tracking row, creating it if missing (safe under concurrent first use). */
export async function loadTracking(userId: string): Promise<HustleGigTracking> {
  const client = await getClient();
  try {
    await client.query(
      'INSERT INTO hustle_gig_tracking (user_id, gig_daily_date) VALUES ($1, $2::date) ON CONFLICT (user_id) DO NOTHING',
      [userId, centralDateString()]
    );
    const r = await client.query(
      `SELECT last_gig_used, last_hustle_used, gig_daily_count, gig_daily_date::text AS gig_daily_date
       FROM hustle_gig_tracking WHERE user_id = $1`,
      [userId]
    );
    return r.rows[0] as HustleGigTracking;
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
  before: HustleGigTracking,
  after: HustleGigTracking,
  guard: Array<keyof HustleGigTracking>
): Promise<boolean> {
  const cols: Array<keyof HustleGigTracking> = [
    'last_gig_used', 'last_hustle_used', 'gig_daily_count', 'gig_daily_date',
  ];
  const dateCols = new Set(['gig_daily_date']);
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
    const r = await client.query(`UPDATE hustle_gig_tracking SET ${sets.join(', ')} WHERE ${where.join(' AND ')}`, values);
    return (r.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}
