/**
 * Throwaway integration test for the Talent Agency DB layer.
 * Run: DATABASE_URL=postgres://user:pass@localhost/db npx tsx tests/agency-concurrency.ts
 * Uses user ids starting with "t_" and cleans them up afterwards.
 */
import assert from 'node:assert/strict';
import { connect, disconnect, getClient } from '../src/database/client.js';
import { awardCoins, getCoinBalanceInfo } from '../src/services/coins.js';
import * as A from '../src/database/agency-client.js';
import { weightedPick } from '../src/agency/agency-logic.js';

const bal = async (u: string) => (await getCoinBalanceInfo(u))?.balance ?? 0;
async function sql(q: string, p: any[] = []) {
  const c = await getClient();
  try { return await c.query(q, p); } finally { c.release(); }
}
async function giveCoins(u: string, n: number) { await awardCoins(u, n, 'test', { gameInstanceId: `t_give_${u}_${Math.random()}` }); }
async function discover(u: string, slug: string) { await sql('INSERT INTO pa_discovered (user_id, character_slug) VALUES ($1,$2) ON CONFLICT DO NOTHING', [u, slug]); }
const okCount = (rs: any[]) => rs.filter((r) => r.ok).length;
let n = 0; const pass = (m: string) => console.log(`  ok ${++n} - ${m}`);

async function cleanup() {
  await sql(`DELETE FROM pa_roster WHERE user_id LIKE 't\\_%'`);
  await sql(`DELETE FROM pa_discovered WHERE user_id LIKE 't\\_%'`);
  await sql(`DELETE FROM pa_players WHERE user_id LIKE 't\\_%'`);
  await sql(`DELETE FROM coin_transactions WHERE user_id LIKE 't\\_%'`);
  await sql(`DELETE FROM users WHERE user_id LIKE 't\\_%'`);
}

async function main() {
  await connect();
  await cleanup();

  // 1. five concurrent recruits -> one succeeds, charged once
  {
    const u = 't_recruit';
    await giveCoins(u, 50000); await discover(u, 'vendo-kun');
    const rs = await Promise.all(Array.from({ length: 5 }, () => A.recruitTransaction(u, 'vendo-kun')));
    assert.equal(okCount(rs), 1, 'exactly one recruit succeeds');
    assert.equal(await bal(u), 45000, 'charged exactly once');
    assert.equal((await A.getRoster(u)).length, 1);
    assert.ok(rs.filter((r) => !r.ok).every((r: any) => r.code === 'already_owned'));
    pass('5 concurrent recruits: 1 success, charged once');
  }

  // 2. five concurrent scouts -> one succeeds
  {
    const u = 't_scout';
    const pick = (c: any[], t: any[]) => weightedPick(c, t);
    const rs = await Promise.all(Array.from({ length: 5 }, () => A.scoutTransaction(u, pick)));
    assert.equal(okCount(rs), 1);
    assert.ok(rs.filter((r) => !r.ok).every((r: any) => r.code === 'cooldown' && r.remainingMs > 0));
    assert.equal((await A.getDiscovered(u)).length, 1);
    pass('5 concurrent scouts: 1 success, rest on cooldown');
  }

  // 3. scout never repeats and renormalizes until empty
  {
    const u = 't_scout_all';
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      await sql(`UPDATE pa_players SET last_scout_at = now() - interval '1 hour' WHERE user_id=$1`, [u]);
      const r: any = await A.scoutTransaction(u, (c, t) => weightedPick(c, t));
      assert.ok(r.ok, JSON.stringify(r)); assert.ok(!seen.has(r.character.slug)); seen.add(r.character.slug);
    }
    await sql(`UPDATE pa_players SET last_scout_at = now() - interval '1 hour' WHERE user_id=$1`, [u]);
    const done: any = await A.scoutTransaction(u, (c, t) => weightedPick(c, t));
    assert.equal(done.ok, false); assert.equal(done.code, 'all_discovered');
    pass('20 scouts find 20 unique characters, 21st refused');
  }

  // 4. five concurrent collects -> paid once
  {
    const u = 't_collect';
    await giveCoins(u, 100000); await discover(u, 'vendo-kun');
    await A.recruitTransaction(u, 'vendo-kun');
    const e = (await A.getRoster(u))[0];
    const w: any = await A.sendToWork(u, e.id); assert.ok(w.ok);
    await sql(`UPDATE pa_roster SET work_started_at = now() - interval '3 hours' WHERE id=$1`, [e.id]);
    const before = await bal(u);
    const rs: any[] = await Promise.all(Array.from({ length: 5 }, () => A.collectTransaction(u)));
    assert.equal(okCount(rs), 1, JSON.stringify(rs.map((r) => r.code ?? 'ok')));
    assert.equal(await bal(u) - before, 600, 'paid 4 blocks x 150 once');
    const after = (await A.getRoster(u))[0];
    assert.equal(after.status, 'resting'); assert.equal(after.stamina, 60); assert.equal(after.work_started_at, null);
    pass('5 concurrent collects: 1 success, paid 600 once, stamina 100->60');
  }

  // 5. working limit of 4, partial collect (not-ready stay out)
  {
    const u = 't_limits';
    await giveCoins(u, 1_000_000);
    const slugs = ['vendo-kun', 'big-tony-two-chains', 'pocket-watch-pete', 'fast-eddie', 'smooth-gus'];
    for (const s of slugs) { await discover(u, s); const r: any = await A.recruitTransaction(u, s); assert.ok(r.ok, JSON.stringify(r)); }
    const roster = await A.getRoster(u);
    const results: any[] = [];
    for (const e of roster) results.push(await A.sendToWork(u, e.id));
    assert.equal(okCount(results), 4); assert.equal(results[4].code, 'too_many_working');
    // concurrent send of an extra one still can't exceed 4
    const first = roster[0];
    await sql(`UPDATE pa_roster SET work_started_at = now() - interval '1 hour' WHERE id=$1`, [first.id]); // only this one is ready
    const c: any = await A.collectTransaction(u);
    assert.ok(c.ok); assert.equal(c.lines.length, 1); assert.equal(c.stillWorking.length, 3);
    assert.equal(c.total, 2 * 150); // 2 blocks of 150 (Intern)
    const again: any = await A.collectTransaction(u);
    assert.equal(again.ok, false); assert.equal(again.code, 'nothing_ready');
    pass('max 4 working; partial collect leaves unfinished talents out');
  }

  // 6. care + train concurrency
  {
    const u = 't_care';
    await giveCoins(u, 100000); await discover(u, 'vendo-kun');
    await A.recruitTransaction(u, 'vendo-kun');
    const e = (await A.getRoster(u))[0];
    await sql(`UPDATE pa_roster SET stamina = 50, stamina_updated_at = now() WHERE id=$1`, [e.id]);
    const b0 = await bal(u);
    const cs: any[] = await Promise.all(Array.from({ length: 5 }, () => A.careTransaction(u, e.id)));
    assert.equal(okCount(cs), 1); assert.equal(b0 - (await bal(u)), 200); // 400 x 50/100
    assert.equal((await A.getRosterEntry(u, e.id))!.stamina, 100);
    const b1 = await bal(u);
    const ts: any[] = await Promise.all(Array.from({ length: 5 }, () => A.trainTransaction(u, e.id, { expectedLevel: 1 })));
    assert.equal(okCount(ts), 1); assert.equal(b1 - (await bal(u)), 500);
    assert.equal((await A.getRosterEntry(u, e.id))!.level, 2);
    // unaffordable
    const poor = 't_poor'; await discover(poor, 'vendo-kun');
    const pr: any = await A.recruitTransaction(poor, 'vendo-kun');
    assert.equal(pr.ok, false); assert.equal(pr.code, 'not_enough_coins');
    assert.equal((await A.getRoster(poor)).length, 0);
    pass('care/train: one charge under spam; poor user refused cleanly');
  }

  // 7. failure after spend -> refunded, and retry works (instance id released)
  {
    const u = 't_fail';
    await giveCoins(u, 20000); await discover(u, 'vendo-kun');
    await sql(`CREATE OR REPLACE FUNCTION pa_test_boom() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'boom'; END; $$ LANGUAGE plpgsql`);
    await sql(`CREATE TRIGGER pa_test_boom_t BEFORE INSERT ON pa_roster FOR EACH ROW WHEN (NEW.user_id = 't_fail') EXECUTE FUNCTION pa_test_boom()`);
    let threw = false;
    try { await A.recruitTransaction(u, 'vendo-kun'); } catch { threw = true; }
    await sql(`DROP TRIGGER pa_test_boom_t ON pa_roster`); await sql(`DROP FUNCTION pa_test_boom()`);
    assert.ok(threw); assert.equal(await bal(u), 20000, 'refunded');
    const retry: any = await A.recruitTransaction(u, 'vendo-kun');
    assert.ok(retry.ok, JSON.stringify(retry)); assert.equal(await bal(u), 15000);
    pass('write failure after spend: coins refunded, retry succeeds');
  }

  // 8. pool starvation: 30 different users at once
  {
    const users = Array.from({ length: 30 }, (_, i) => `t_many_${i}`);
    for (const u of users) { await giveCoins(u, 10000); await discover(u, 'vendo-kun'); }
    const t0 = Date.now();
    const rs: any[] = await Promise.all(users.map((u) => A.recruitTransaction(u, 'vendo-kun')));
    assert.equal(okCount(rs), 30);
    pass(`30 users recruiting at once finished in ${Date.now() - t0}ms (no pool deadlock)`);
  }

  // 9. name search
  {
    const a = await A.findCharacterByName('hex'); assert.equal(a[0].slug, 'dr-hexa-voltaire');
    const b = await A.findCharacterByName('KAZUKI'); assert.equal(b[0].slug, 'madame-kazuki');
    const c = await A.findCharacterByName('donna-gilded'); assert.equal(c[0].slug, 'donna-gilded');
    assert.equal((await A.findCharacterByName('zzz')).length, 0);
    pass('name search: partial, case-insensitive, slug');
  }

  await cleanup();
  console.log(`\nALL ${n} CHECKS PASSED`);
}

main().then(() => disconnect()).catch(async (e) => { console.error('FAIL', e); await cleanup().catch(() => {}); await disconnect(); process.exit(1); });
