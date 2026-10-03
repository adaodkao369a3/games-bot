import assert from 'node:assert/strict';
import { connect, disconnect, getClient } from '../src/database/client.js';
import { awardCoins, getCoinBalanceInfo } from '../src/services/coins.js';
import { handleGoonCommand } from '../src/commands/goon.js';
import { handleEdgeCommand } from '../src/commands/edge.js';

async function sql(q: string, p: any[] = []) { const c = await getClient(); try { return await c.query(q, p); } finally { c.release(); } }
const bal = async (u: string) => (await getCoinBalanceInfo(u))?.balance ?? 0;
function msg(userId: string) {
  const sent: any[] = [];
  return { sent, author: { id: userId, username: userId, displayAvatarURL: () => 'https://x/y.png' },
    reply: async (x: any) => { sent.push(typeof x === 'string' ? x : (x.embeds[0].toJSON().description ?? '')); } } as any;
}
const ago = (min: number) => new Date(Date.now() - min * 60000);
let n = 0; const pass = (m: string) => console.log(`  ok ${++n} - ${m}`);

async function main() {
  await connect();
  await sql(`DELETE FROM goon_edge_tracking WHERE user_id LIKE 't\\_g\\_%'`); await sql(`DELETE FROM coin_transactions WHERE user_id LIKE 't\\_g\\_%'`); await sql(`DELETE FROM users WHERE user_id LIKE 't\\_g\\_%'`);

  // ---- 11 goon calls ------------------------------------------------------------------------
  const G = 't_g_goon'; await awardCoins(G, 1000, 'test', { gameInstanceId: 't_g_seed1' });
  const deltas: number[] = [];
  for (let i = 1; i <= 11; i++) {
    await sql(`UPDATE goon_edge_tracking SET last_goon_used = $2, edge_blocked_until = NULL WHERE user_id = $1`, [G, ago(120)]);
    const before = await bal(G); const m = msg(G); await handleGoonCommand(m); deltas.push((await bal(G)) - before);
    assert.equal(m.sent.length, 1);
  }
  assert.deepEqual(deltas, [400,400,400,400,400,400,400,400,400,400,-200]);
  const row = (await sql(`SELECT goon_daily_count, goon_count FROM goon_edge_tracking WHERE user_id=$1`, [G])).rows[0];
  assert.equal(row.goon_daily_count, 11);
  pass(`11 goons: deltas ${deltas.join(',')} (10 x +400, 11th net -200)`);
  { await sql(`UPDATE goon_edge_tracking SET last_goon_used=$2, edge_blocked_until=NULL WHERE user_id=$1`, [G, ago(120)]);
    const m = msg(G); await handleGoonCommand(m); console.log('     11th+ message:\n     ' + m.sent[0].replace(/\n\n/g, '\n     ')); }

  // broke user over the limit never crashes, loses at most what they have
  const B = 't_g_broke'; await awardCoins(B, 1, 'test', { gameInstanceId: 't_g_seed2' });
  await sql(`INSERT INTO goon_edge_tracking (user_id, edge_daily_date, goon_daily_count, goon_daily_date) VALUES ($1, CURRENT_DATE, 10, (now() - interval '6 hours')::date)`, [B]);
  { await sql(`UPDATE goon_edge_tracking SET edge_daily_date = (now() - interval '6 hours')::date WHERE user_id=$1`, [B]);
    const before = await bal(B); const m = msg(B); await handleGoonCommand(m); const after = await bal(B);
    assert.ok(after >= 0 && after <= before); pass(`broke user over limit: ${before} -> ${after}, no crash`); }

  // racing duplicate goons: only one passes
  const R = 't_g_race'; await awardCoins(R, 5, 'test', { gameInstanceId: 't_g_seed6' });
  { const ms = [msg(R), msg(R), msg(R), msg(R), msg(R)]; await Promise.all(ms.map((m) => handleGoonCommand(m)));
    assert.equal(await bal(R), 405); pass('5 simultaneous .goon: paid once (400)'); }

  // ---- 10 edges in a row ---------------------------------------------------------------------
  const E = 't_g_edge'; await awardCoins(E, 10, 'test', { gameInstanceId: 't_g_seed3' });
  const e: number[] = [];
  for (let i = 1; i <= 10; i++) {
    await sql(`UPDATE goon_edge_tracking SET last_edge_used=$2, last_edge_streak_at=CASE WHEN edge_streak>0 THEN $3::timestamptz ELSE NULL END WHERE user_id=$1`, [E, ago(10), ago(10)]).catch(() => {});
    const before = await bal(E); await handleEdgeCommand(msg(E)); e.push((await bal(E)) - before);
  }
  // 200,220,240,260,280,300,300,300,300,300 and +2000 existing daily bonus on the 10th
  assert.deepEqual(e, [200,220,240,260,280,300,300,300,300,2300]);
  const t = (await sql(`SELECT edge_streak, goon_powerup_until FROM goon_edge_tracking WHERE user_id=$1`, [E])).rows[0];
  assert.equal(t.edge_streak, 10); assert.ok(t.goon_powerup_until && t.goon_powerup_until > new Date());
  pass(`10 edges: ${e.join(',')}; power-up granted`);
  { // power-up halves goon cooldown (8 min ago is OK with power-up, blocked without)
    await sql(`UPDATE goon_edge_tracking SET last_goon_used=$2, edge_blocked_until=NULL WHERE user_id=$1`, [E, ago(8)]);
    const m = msg(E); const b = await bal(E); await handleGoonCommand(m); assert.equal((await bal(E)) - b, 400); pass('goon allowed after 8 min with power-up (15 min normally)');
    const s = (await sql(`SELECT edge_streak FROM goon_edge_tracking WHERE user_id=$1`, [E])).rows[0].edge_streak; assert.equal(s, 0); pass('goon resets the edge streak');
    await sql(`UPDATE goon_edge_tracking SET last_goon_used=$2, edge_blocked_until=NULL, goon_powerup_until=NULL WHERE user_id=$1`, [E, ago(8)]);
    const m2 = msg(E); await handleGoonCommand(m2); assert.match(m2.sent[0], /wait/); pass('without power-up, 8 min is still on cooldown'); }
  { // streak breaks after a >30 min gap
    const S = 't_g_gap'; await awardCoins(S, 10, 'test', { gameInstanceId: 't_g_seed4' });
    await handleEdgeCommand(msg(S)); await sql(`UPDATE goon_edge_tracking SET last_edge_used=$2, last_edge_streak_at=$2 WHERE user_id=$1`, [S, ago(10)]);
    let b = await bal(S); await handleEdgeCommand(msg(S)); assert.equal((await bal(S)) - b, 220);
    await sql(`UPDATE goon_edge_tracking SET last_edge_used=$2, last_edge_streak_at=$2 WHERE user_id=$1`, [S, ago(31)]);
    b = await bal(S); await handleEdgeCommand(msg(S)); assert.equal((await bal(S)) - b, 200); pass('streak resets after a 31-minute gap'); }
  { const m = msg(E); await sql(`UPDATE goon_edge_tracking SET last_edge_used=$2, edge_blocked_until=NULL WHERE user_id=$1`, [E, ago(10)]); await handleEdgeCommand(m); console.log('     edge message:\n     ' + m.sent[0].replace(/\n\n/g, '\n     ')); }
  const RE = 't_g_race_e'; await awardCoins(RE, 5, 'test', { gameInstanceId: 't_g_seed5' }); { const ms = [msg(RE), msg(RE), msg(RE), msg(RE)]; await Promise.all(ms.map((m) => handleEdgeCommand(m))); assert.equal(await bal(RE), 205); pass('4 simultaneous .edge: paid once'); }

  await sql(`DELETE FROM goon_edge_tracking WHERE user_id LIKE 't\\_g\\_%'`); await sql(`DELETE FROM coin_transactions WHERE user_id LIKE 't\\_g\\_%'`); await sql(`DELETE FROM users WHERE user_id LIKE 't\\_g\\_%'`);
  console.log(`\nALL ${n} GOON/EDGE CHECKS PASSED`);
}
main().then(() => disconnect()).catch(async (e) => { console.error('FAIL', e); await disconnect(); process.exit(1); });
