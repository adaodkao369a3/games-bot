/**
 * Talent Agency database layer.
 *
 * Concurrency model
 * - Every mutating function runs in ONE transaction on one pool client and first locks the
 *   player's `pa_players` row (SELECT ... FOR UPDATE). All actions of one user are therefore
 *   serialized, so double clicks / spam can't double spend or double pay.
 * - Coin movements go through the coin service, which uses its OWN transaction (it can't join ours).
 *   Each coin movement has a deterministic `gameInstanceId`; the UNIQUE column rejects duplicates.
 *   Order: lock + validate -> spend coins (or flip state first for payouts) -> write state -> commit.
 *   If anything after the spend fails (or the commit fails) a compensation refunds the coins.
 * - Because each agency transaction needs a SECOND pool connection for the coin call, we cap
 *   concurrent agency transactions so they can never exhaust the pool (max 10) and deadlock.
 */
import type { PoolClient } from 'pg';
import { getClient } from './client.js';
import { awardCoins, removeCoins, getCoinBalanceInfo } from '../services/coins.js';
import {
  CharacterDef,
  TierDef,
  BLOCK_MS,
  MAX_LEVEL,
  MAX_ROSTER,
  MAX_WORKING,
  SCOUT_COOLDOWN_MS,
  careCost,
  currentStamina,
  trainCost,
  workEarnings,
} from '../agency/agency-logic.js';

const COIN_SOURCE = 'agency';
const MAX_CONCURRENT_TX = 4;

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export interface RosterEntry {
  id: number;
  user_id: string;
  character_slug: string;
  level: number;
  stamina: number;
  stamina_updated_at: Date;
  status: 'resting' | 'working';
  work_started_at: Date | null;
  character: CharacterDef;
  tier: TierDef;
}

export interface PlayerRow {
  user_id: string;
  last_scout_at: Date | null;
}

export interface Refusal {
  ok: false;
  code: string;
  reason: string;
  remainingMs?: number;
  /** Extra data some refusals carry (e.g. what is still working). */
  stillWorking?: CollectLine[];
}

export type Ok<T> = { ok: true } & T;
export type Result<T> = Ok<T> | Refusal;

/** Type guard for refusals (the project runs with strict: false, so `!r.ok` alone doesn't narrow). */
export function failed<T>(r: Result<T>): r is Refusal {
  return r.ok === false;
}

export interface CollectLine {
  rosterId: number;
  name: string;
  tierLabel: string;
  level: number;
  blocks: number;
  coins: number;
  staminaSpent: number;
  staminaAfter: number;
  /** For "still working" lines: ms until the first block pays. */
  msUntilFirstBlock?: number;
}

// ---------------------------------------------------------------------------------------------
// Row mapping (pg returns BIGINT as string)
// ---------------------------------------------------------------------------------------------

function mapTier(r: any): TierDef {
  return {
    tier_key: r.tier_key,
    label: r.label,
    sort_order: Number(r.sort_order),
    scout_weight: Number(r.scout_weight),
    recruit_price: Number(r.recruit_price),
    base_payout: Number(r.base_payout),
    care_price: Number(r.care_price),
  };
}

function mapCharacter(r: any): CharacterDef {
  return {
    slug: r.slug,
    name: r.name,
    tier_key: r.tier_key,
    kind: r.kind,
    blurb: r.blurb,
    image_file: r.image_file,
    recruit_price: Number(r.recruit_price),
    base_payout: Number(r.base_payout),
    stamina_cost: Number(r.stamina_cost),
    enabled: r.enabled,
  };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

// ---------------------------------------------------------------------------------------------
// Concurrency helpers
// ---------------------------------------------------------------------------------------------

let activeTx = 0;
const txWaiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeTx < MAX_CONCURRENT_TX) {
    activeTx++;
    return;
  }
  await new Promise<void>((resolve) => txWaiters.push(resolve)); // slot is handed over, count unchanged
}

function releaseSlot(): void {
  const next = txWaiters.shift();
  if (next) next();
  else activeTx--;
}

/** Throw inside a transaction to roll it back and return `result` to the caller. */
class TxAbort {
  constructor(public result: Refusal) {}
}

interface TxContext {
  tx: PoolClient;
  /** Register an undo step (e.g. a coin refund). Runs, newest first, if the tx rolls back or fails. */
  compensate: (fn: () => Promise<void>) => void;
}

async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await getClient();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

async function runTx<T>(userId: string, fn: (ctx: TxContext) => Promise<T>): Promise<T | Refusal> {
  await acquireSlot();
  const compensations: Array<() => Promise<void>> = [];
  const runCompensations = async () => {
    while (compensations.length > 0) {
      const undo = compensations.pop()!;
      try {
        await undo();
      } catch (err) {
        console.error('[AGENCY] Compensation failed:', err);
      }
    }
  };

  let client: PoolClient | undefined;
  try {
    client = await getClient();
    await client.query('BEGIN');
    await client.query('INSERT INTO pa_players (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    await client.query('SELECT user_id FROM pa_players WHERE user_id = $1 FOR UPDATE', [userId]);

    let result: T;
    try {
      result = await fn({ tx: client, compensate: (f) => compensations.push(f) });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      await runCompensations();
      if (err instanceof TxAbort) return err.result;
      throw err;
    }

    try {
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      await runCompensations();
      throw err;
    }
    return result;
  } finally {
    client?.release();
    releaseSlot();
  }
}

function refuse(code: string, reason: string, extra: Partial<Refusal> = {}): TxAbort {
  return new TxAbort({ ok: false, code, reason, ...extra });
}

// ---------------------------------------------------------------------------------------------
// Coin helpers (the coin service runs its own transaction)
// ---------------------------------------------------------------------------------------------

async function instanceIdExists(id: string): Promise<boolean> {
  return withClient(async (c) => {
    const r = await c.query('SELECT 1 FROM coin_transactions WHERE game_instance_id = $1', [id]);
    return r.rows.length > 0;
  });
}

/** Free a spent instance id for reuse after a refund (the ledger row stays; only its idempotency key is renamed). */
async function releaseInstanceId(id: string): Promise<void> {
  await withClient(async (c) => {
    await c.query(
      `UPDATE coin_transactions SET game_instance_id = game_instance_id || '_reverted_' || $2 WHERE game_instance_id = $1`,
      [id, String(Date.now())]
    );
  });
}

type SpendOutcome =
  | { kind: 'paid'; newBalance: number }
  | { kind: 'already_paid' } // an earlier attempt spent these coins but never finished (crash); don't charge twice
  | { kind: 'insufficient'; balance: number }
  | { kind: 'error' };

async function spend(userId: string, amount: number, id: string, reason: string): Promise<SpendOutcome> {
  const newBalance = await removeCoins(userId, amount, COIN_SOURCE, { reason, gameInstanceId: id });
  if (newBalance !== null) return { kind: 'paid', newBalance };
  if (await instanceIdExists(id)) return { kind: 'already_paid' };
  const info = await getCoinBalanceInfo(userId);
  const balance = info?.balance ?? 0;
  if (balance < amount) return { kind: 'insufficient', balance };
  return { kind: 'error' };
}

async function refund(userId: string, amount: number, spendId: string, reason: string): Promise<void> {
  const back = await awardCoins(userId, amount, COIN_SOURCE, {
    reason: `refund: ${reason}`,
    gameInstanceId: `${spendId}_refund_${Date.now()}`,
  });
  if (back === null) {
    console.error(`[AGENCY] CRITICAL: refund of ${amount} to ${userId} failed (spend id ${spendId})`);
    return;
  }
  await releaseInstanceId(spendId);
}

function insufficientRefusal(amount: number, balance: number, what: string): TxAbort {
  return refuse('not_enough_coins', `Not enough coins for ${what}. Need ${fmt(amount)}, you have ${fmt(balance)}.`);
}

// ---------------------------------------------------------------------------------------------
// Catalog + reads
// ---------------------------------------------------------------------------------------------

export async function getTiers(): Promise<TierDef[]> {
  return withClient(async (c) => {
    const r = await c.query('SELECT * FROM pa_tiers ORDER BY sort_order');
    return r.rows.map(mapTier);
  });
}

export async function getCharacters(): Promise<CharacterDef[]> {
  return withClient(async (c) => {
    const r = await c.query(
      `SELECT c.* FROM pa_characters c JOIN pa_tiers t ON t.tier_key = c.tier_key
       WHERE c.enabled = TRUE ORDER BY t.sort_order, c.name`
    );
    return r.rows.map(mapCharacter);
  });
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** 0 exact, 1 prefix, 2 word prefix, 3 contains, -1 no match. Works on slug or name. */
function matchScore(query: string, name: string, slug: string): number {
  const q = normalize(query);
  if (!q) return -1;
  let best = -1;
  for (const candidate of [normalize(name), normalize(slug)]) {
    let s = -1;
    if (candidate === q) s = 0;
    else if (candidate.startsWith(q)) s = 1;
    else if (candidate.split(' ').some((w) => w.startsWith(q))) s = 2;
    else if (candidate.includes(q)) s = 3;
    if (s >= 0 && (best < 0 || s < best)) best = s;
  }
  return best;
}

/** True when the query equals the name or slug (ignoring case and punctuation). */
export function isExactNameMatch(query: string, name: string, slug: string): boolean {
  return matchScore(query, name, slug) === 0;
}

/** Partial match among characters this user has already discovered. Best matches first. */
export async function findDiscoveredByName(userId: string, query: string): Promise<CharacterDef[]> {
  const discovered = await getDiscovered(userId);
  return discovered
    .map((c) => ({ c, s: matchScore(query, c.name, c.slug) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.c);
}

/** Case-insensitive, partial match on name or slug. Best matches first. */
export async function findCharacterByName(query: string): Promise<CharacterDef[]> {
  const all = await getCharacters();
  return all
    .map((c) => ({ c, s: matchScore(query, c.name, c.slug) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.c);
}

export async function getPlayer(userId: string): Promise<PlayerRow> {
  return withClient(async (c) => {
    await c.query('INSERT INTO pa_players (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    const r = await c.query('SELECT user_id, last_scout_at FROM pa_players WHERE user_id = $1', [userId]);
    return r.rows[0];
  });
}

export async function getDiscovered(userId: string): Promise<CharacterDef[]> {
  return withClient(async (c) => {
    const r = await c.query(
      `SELECT c.* FROM pa_discovered d
       JOIN pa_characters c ON c.slug = d.character_slug
       JOIN pa_tiers t ON t.tier_key = c.tier_key
       WHERE d.user_id = $1 ORDER BY t.sort_order, c.name`,
      [userId]
    );
    return r.rows.map(mapCharacter);
  });
}

async function loadCatalogMaps(c: PoolClient): Promise<{ chars: Map<string, CharacterDef>; tiers: Map<string, TierDef> }> {
  const [cr, tr] = await Promise.all([c.query('SELECT * FROM pa_characters'), c.query('SELECT * FROM pa_tiers')]);
  return {
    chars: new Map(cr.rows.map((r: any) => [r.slug, mapCharacter(r)])),
    tiers: new Map(tr.rows.map((r: any) => [r.tier_key, mapTier(r)])),
  };
}

function mapRoster(
  r: any,
  chars: Map<string, CharacterDef>,
  tiers: Map<string, TierDef>
): RosterEntry | null {
  const character = chars.get(r.character_slug);
  if (!character) return null;
  const tier = tiers.get(character.tier_key);
  if (!tier) return null;
  return {
    id: Number(r.id),
    user_id: r.user_id,
    character_slug: r.character_slug,
    level: Number(r.level),
    stamina: Number(r.stamina),
    stamina_updated_at: r.stamina_updated_at,
    status: r.status,
    work_started_at: r.work_started_at,
    character,
    tier,
  };
}

async function loadRoster(c: PoolClient, sql: string, params: any[]): Promise<RosterEntry[]> {
  const { chars, tiers } = await loadCatalogMaps(c);
  const r = await c.query(sql, params);
  return r.rows.map((row: any) => mapRoster(row, chars, tiers)).filter((x: RosterEntry | null): x is RosterEntry => x !== null);
}

/** Roster ordered by tier (low to high) then name. */
export async function getRoster(userId: string): Promise<RosterEntry[]> {
  return withClient(async (c) => {
    const list = await loadRoster(
      c,
      `SELECT r.* FROM pa_roster r WHERE r.user_id = $1`,
      [userId]
    );
    return list.sort((a, b) => a.tier.sort_order - b.tier.sort_order || a.character.name.localeCompare(b.character.name));
  });
}

export async function getRosterEntry(userId: string, rosterId: number): Promise<RosterEntry | null> {
  return withClient(async (c) => {
    const list = await loadRoster(c, `SELECT r.* FROM pa_roster r WHERE r.id = $1 AND r.user_id = $2`, [rosterId, userId]);
    return list[0] ?? null;
  });
}

/** Partial name match among the characters this user owns. Best matches first. */
export async function findRosterByName(userId: string, query: string): Promise<RosterEntry[]> {
  const roster = await getRoster(userId);
  return roster
    .map((e) => ({ e, s: matchScore(query, e.character.name, e.character.slug) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.e);
}

// ---------------------------------------------------------------------------------------------
// Scout
// ---------------------------------------------------------------------------------------------

export type ScoutPick = (candidates: CharacterDef[], tiers: TierDef[]) => CharacterDef | null;

export async function scoutTransaction(
  userId: string,
  pickFn: ScoutPick,
  now: Date = new Date()
): Promise<Result<{ character: CharacterDef; tier: TierDef; remainingUndiscovered: number }>> {
  return runTx(userId, async ({ tx }) => {
    const p = await tx.query('SELECT last_scout_at FROM pa_players WHERE user_id = $1', [userId]);
    const last: Date | null = p.rows[0]?.last_scout_at ?? null;
    if (last) {
      const wait = SCOUT_COOLDOWN_MS - (now.getTime() - new Date(last).getTime());
      if (wait > 0) throw refuse('cooldown', 'Scouts are still out looking.', { remainingMs: wait });
    }

    const tiers = (await tx.query('SELECT * FROM pa_tiers ORDER BY sort_order')).rows.map(mapTier);
    const candidates = (
      await tx.query(
        `SELECT c.* FROM pa_characters c
         WHERE c.enabled = TRUE
           AND NOT EXISTS (SELECT 1 FROM pa_discovered d WHERE d.user_id = $1 AND d.character_slug = c.slug)`,
        [userId]
      )
    ).rows.map(mapCharacter);

    if (candidates.length === 0) {
      throw refuse('all_discovered', 'You have already discovered everyone. The scouts have nothing left to find.');
    }

    const picked = pickFn(candidates, tiers);
    if (!picked) throw refuse('no_pick', 'The scouts came back empty-handed. Try again.');

    await tx.query('INSERT INTO pa_discovered (user_id, character_slug) VALUES ($1, $2)', [userId, picked.slug]);
    await tx.query('UPDATE pa_players SET last_scout_at = $2 WHERE user_id = $1', [userId, now]);

    const tier = tiers.find((t) => t.tier_key === picked.tier_key)!;
    return { ok: true as const, character: picked, tier, remainingUndiscovered: candidates.length - 1 };
  });
}

// ---------------------------------------------------------------------------------------------
// Recruit
// ---------------------------------------------------------------------------------------------

export async function recruitTransaction(
  userId: string,
  slug: string,
  now: Date = new Date()
): Promise<Result<{ entry: RosterEntry; price: number; newBalance: number | null }>> {
  return runTx(userId, async ({ tx, compensate }) => {
    const cr = await tx.query('SELECT * FROM pa_characters WHERE slug = $1 AND enabled = TRUE', [slug]);
    if (cr.rows.length === 0) throw refuse('unknown_character', 'No such talent exists.');
    const character = mapCharacter(cr.rows[0]);

    const disc = await tx.query('SELECT 1 FROM pa_discovered WHERE user_id = $1 AND character_slug = $2', [userId, slug]);
    if (disc.rows.length === 0) throw refuse('not_discovered', `You haven't scouted ${character.name} yet.`);

    const owned = await tx.query('SELECT 1 FROM pa_roster WHERE user_id = $1 AND character_slug = $2', [userId, slug]);
    if (owned.rows.length > 0) throw refuse('already_owned', `${character.name} already works for you.`);

    const count = await tx.query('SELECT count(*)::int AS n FROM pa_roster WHERE user_id = $1', [userId]);
    if (count.rows[0].n >= MAX_ROSTER) throw refuse('roster_full', `Your roster is full (${MAX_ROSTER}).`);

    const price = character.recruit_price;
    const spendId = `pa_recruit_${userId}_${slug}`;
    const outcome = await spend(userId, price, spendId, `recruit ${slug}`);
    if (outcome.kind === 'insufficient') throw insufficientRefusal(price, outcome.balance, `recruiting ${character.name}`);
    if (outcome.kind === 'error') throw refuse('coin_error', 'The coin machine hiccuped. Nothing was charged. Try again.');
    if (outcome.kind === 'paid') {
      compensate(() => refund(userId, price, spendId, `recruit ${slug} failed`));
    }

    const ins = await tx.query(
      `INSERT INTO pa_roster (user_id, character_slug, level, stamina, stamina_updated_at, status)
       VALUES ($1, $2, 1, 100, $3, 'resting') RETURNING *`,
      [userId, slug, now]
    );
    const tier = mapTier((await tx.query('SELECT * FROM pa_tiers WHERE tier_key = $1', [character.tier_key])).rows[0]);
    const entry = mapRoster(ins.rows[0], new Map([[slug, character]]), new Map([[tier.tier_key, tier]]))!;
    return { ok: true as const, entry, price, newBalance: outcome.kind === 'paid' ? outcome.newBalance : null };
  });
}

// ---------------------------------------------------------------------------------------------
// Send to work
// ---------------------------------------------------------------------------------------------

export async function sendToWork(
  userId: string,
  rosterId: number,
  now: Date = new Date()
): Promise<Result<{ entry: RosterEntry; workingNow: number }>> {
  return runTx(userId, async ({ tx }) => {
    const list = await loadRoster(tx, 'SELECT r.* FROM pa_roster r WHERE r.id = $1 AND r.user_id = $2 FOR UPDATE', [rosterId, userId]);
    const entry = list[0];
    if (!entry) throw refuse('not_owned', "That talent isn't on your roster.");
    if (entry.status === 'working') throw refuse('already_working', `${entry.character.name} is already out working.`);

    const stamina = currentStamina(entry, now);
    if (stamina <= 0) throw refuse('no_stamina', `${entry.character.name} is out of stamina. Rest or Care first.`);

    const w = await tx.query(`SELECT count(*)::int AS n FROM pa_roster WHERE user_id = $1 AND status = 'working'`, [userId]);
    if (w.rows[0].n >= MAX_WORKING) throw refuse('too_many_working', `You already have ${MAX_WORKING} talents out working. Collect first.`);

    const up = await tx.query(
      `UPDATE pa_roster
       SET status = 'working', stamina = $2, stamina_updated_at = $3, work_started_at = $3
       WHERE id = $1 AND status = 'resting' RETURNING *`,
      [rosterId, stamina, now]
    );
    if (up.rows.length === 0) throw refuse('already_working', `${entry.character.name} is already out working.`);

    const updated: RosterEntry = {
      ...entry,
      status: 'working',
      stamina,
      stamina_updated_at: now,
      work_started_at: now,
    };
    return { ok: true as const, entry: updated, workingNow: w.rows[0].n + 1 };
  });
}

// ---------------------------------------------------------------------------------------------
// Collect
// ---------------------------------------------------------------------------------------------

/**
 * Pays every working talent that has completed at least one 30-minute block, then sends them back to rest.
 * Talents still inside their first block stay out working (collecting them would pay nothing and waste the trip).
 */
export async function collectTransaction(
  userId: string,
  now: Date = new Date()
): Promise<Result<{ lines: CollectLine[]; total: number; stillWorking: CollectLine[]; alreadyPaid: boolean; newBalance: number | null }>> {
  return runTx(userId, async ({ tx }) => {
    const working = await loadRoster(
      tx,
      `SELECT r.* FROM pa_roster r WHERE r.user_id = $1 AND r.status = 'working' ORDER BY r.work_started_at FOR UPDATE`,
      [userId]
    );
    if (working.length === 0) throw refuse('nobody_working', 'Nobody is out working right now.');

    const lines: CollectLine[] = [];
    const stillWorking: CollectLine[] = [];
    let maxStartMs = 0;

    for (const e of working) {
      const started = new Date(e.work_started_at!);
      const elapsed = now.getTime() - started.getTime();
      if (elapsed < BLOCK_MS) {
        stillWorking.push({
          rosterId: e.id,
          name: e.character.name,
          tierLabel: e.tier.label,
          level: e.level,
          blocks: 0,
          coins: 0,
          staminaSpent: 0,
          staminaAfter: e.stamina,
          msUntilFirstBlock: BLOCK_MS - elapsed,
        });
        continue;
      }

      // Atomic flip: only one caller can ever collect a given shift.
      const flip = await tx.query(
        `UPDATE pa_roster SET status = 'resting' WHERE id = $1 AND status = 'working'
         RETURNING stamina, level, work_started_at`,
        [e.id]
      );
      if (flip.rows.length === 0) continue;
      const row = flip.rows[0];
      const startedAt = new Date(row.work_started_at);
      const result = workEarnings(e.character, Number(row.level), Number(row.stamina), startedAt, now);
      const staminaAfter = Number(row.stamina) - result.staminaSpent;

      await tx.query(
        `UPDATE pa_roster SET stamina = $2, stamina_updated_at = $3, work_started_at = NULL WHERE id = $1`,
        [e.id, staminaAfter, now]
      );
      maxStartMs = Math.max(maxStartMs, startedAt.getTime());
      lines.push({
        rosterId: e.id,
        name: e.character.name,
        tierLabel: e.tier.label,
        level: Number(row.level),
        blocks: result.blocks,
        coins: result.coins,
        staminaSpent: result.staminaSpent,
        staminaAfter,
      });
    }

    if (lines.length === 0) {
      throw refuse('nothing_ready', 'Nobody has finished a full 30-minute block yet.', { stillWorking });
    }

    const total = lines.reduce((s, l) => s + l.coins, 0);
    let alreadyPaid = false;
    let newBalance: number | null = null;

    if (total > 0) {
      const payId = `pa_collect_${userId}_${maxStartMs}`;
      newBalance = await awardCoins(userId, total, COIN_SOURCE, { reason: 'collect earnings', gameInstanceId: payId });
      if (newBalance === null) {
        if (await instanceIdExists(payId)) {
          // An earlier attempt already paid this exact shift but didn't finish (crash). Finish the state flip, don't pay twice.
          alreadyPaid = true;
        } else {
          // Throwing rolls the row flips back, so everyone is still "working" and nothing is lost.
          throw refuse('payout_failed', 'The payout failed. Your talents are still out working, try again.');
        }
      }
      // If the commit below fails we've paid for a shift that stays "working"; the retry's duplicate id
      // takes the alreadyPaid path above, so the same shift can never be paid twice.
    }

    return { ok: true as const, lines, total, stillWorking, alreadyPaid, newBalance };
  });
}

// ---------------------------------------------------------------------------------------------
// Care
// ---------------------------------------------------------------------------------------------

export async function careTransaction(
  userId: string,
  rosterId: number,
  opts: { maxCost?: number } = {},
  now: Date = new Date()
): Promise<Result<{ entry: RosterEntry; cost: number; newBalance: number | null }>> {
  return runTx(userId, async ({ tx, compensate }) => {
    const list = await loadRoster(tx, 'SELECT r.* FROM pa_roster r WHERE r.id = $1 AND r.user_id = $2 FOR UPDATE', [rosterId, userId]);
    const entry = list[0];
    if (!entry) throw refuse('not_owned', "That talent isn't on your roster.");
    if (entry.status === 'working') throw refuse('is_working', `${entry.character.name} is out working. Collect first, then pamper.`);

    const stamina = currentStamina(entry, now);
    const cost = careCost(entry.tier, stamina);
    if (cost <= 0) throw refuse('already_full', `${entry.character.name} is already at full stamina.`);
    if (opts.maxCost !== undefined && cost > opts.maxCost) {
      throw refuse('price_changed', 'The price changed, so check the profile again.');
    }

    const spendId = `pa_care_${rosterId}_${now.getTime()}`;
    const outcome = await spend(userId, cost, spendId, `care ${entry.character.slug}`);
    if (outcome.kind === 'insufficient') throw insufficientRefusal(cost, outcome.balance, `caring for ${entry.character.name}`);
    if (outcome.kind !== 'paid') throw refuse('coin_error', 'The coin machine hiccuped. Nothing was charged. Try again.');
    compensate(() => refund(userId, cost, spendId, `care ${entry.character.slug} failed`));

    await tx.query(`UPDATE pa_roster SET stamina = 100, stamina_updated_at = $2 WHERE id = $1`, [rosterId, now]);
    const updated: RosterEntry = { ...entry, stamina: 100, stamina_updated_at: now };
    return { ok: true as const, entry: updated, cost, newBalance: outcome.newBalance };
  });
}

// ---------------------------------------------------------------------------------------------
// Train
// ---------------------------------------------------------------------------------------------

/**
 * Level n -> n+1. `expectedLevel` (from the confirm button) makes stale/duplicate confirmations harmless:
 * if the level already changed, nothing is charged.
 */
export async function trainTransaction(
  userId: string,
  rosterId: number,
  opts: { expectedLevel?: number } = {}
): Promise<Result<{ entry: RosterEntry; cost: number; toLevel: number; newBalance: number | null }>> {
  return runTx(userId, async ({ tx, compensate }) => {
    const list = await loadRoster(tx, 'SELECT r.* FROM pa_roster r WHERE r.id = $1 AND r.user_id = $2 FOR UPDATE', [rosterId, userId]);
    const entry = list[0];
    if (!entry) throw refuse('not_owned', "That talent isn't on your roster.");
    if (entry.status === 'working') throw refuse('is_working', `${entry.character.name} is out working. Finish the shift first.`);
    if (entry.level >= MAX_LEVEL) throw refuse('max_level', `${entry.character.name} is already max level (${MAX_LEVEL}).`);
    if (opts.expectedLevel !== undefined && opts.expectedLevel !== entry.level) {
      throw refuse('level_changed', `${entry.character.name} is already level ${entry.level}. Check the profile again.`);
    }

    const cost = trainCost(entry.character, entry.level)!;
    const toLevel = entry.level + 1;
    const spendId = `pa_train_${userId}_${entry.character.slug}_${toLevel}`;
    const outcome = await spend(userId, cost, spendId, `train ${entry.character.slug} to ${toLevel}`);
    if (outcome.kind === 'insufficient') throw insufficientRefusal(cost, outcome.balance, `training ${entry.character.name}`);
    if (outcome.kind === 'error') throw refuse('coin_error', 'The coin machine hiccuped. Nothing was charged. Try again.');
    if (outcome.kind === 'paid') {
      compensate(() => refund(userId, cost, spendId, `train ${entry.character.slug} failed`));
    }

    await tx.query(`UPDATE pa_roster SET level = $2 WHERE id = $1 AND level = $3`, [rosterId, toLevel, entry.level]);
    return { ok: true as const, entry: { ...entry, level: toLevel }, cost, toLevel, newBalance: outcome.kind === 'paid' ? outcome.newBalance : null };
  });
}
