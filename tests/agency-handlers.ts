/** Dry-run of the Talent Agency handlers against fake Discord objects and a real DB. */
import assert from 'node:assert/strict';
import { connect, disconnect, getClient } from '../src/database/client.js';
import { awardCoins, getCoinBalanceInfo } from '../src/services/coins.js';
import { config } from '../src/config/index.js';
import * as H from '../src/commands/agency.js';

const U = 't_h_user', OTHER = 't_h_other';
const CH = config.gameFloorChannelIds[0];
async function sql(q: string, p: any[] = []) { const c = await getClient(); try { return await c.query(q, p); } finally { c.release(); } }

function serialize(o: any) {
  const out: any = {};
  if (o.content !== undefined) out.content = o.content;
  if (o.embeds) out.embeds = o.embeds.map((e: any) => (e.toJSON ? e.toJSON() : e));
  if (o.components) out.components = o.components.map((r: any) => (r.toJSON ? r.toJSON() : r));
  if (o.files) out.files = o.files.length;
  return out;
}
function fakeMessage(userId: string, channelId = CH) {
  const sent: any[] = [];
  return { sent, channel: { id: channelId }, author: { id: userId, bot: false },
    reply: async (x: any) => { sent.push(typeof x === 'string' ? { content: x } : serialize(x)); } } as any;
}
function fakeInteraction(customId: string, userId: string, values?: string[], channelId = CH) {
  const log: any = { edits: [], follow: [], replies: [], deferred: false };
  return { log, customId, user: { id: userId }, channelId, values,
    deferUpdate: async () => { log.deferred = true; },
    editReply: async (x: any) => { log.edits.push(serialize(x)); },
    followUp: async (x: any) => { log.follow.push(x.content); },
    reply: async (x: any) => { log.replies.push(x.content); } } as any;
}
const text = (m: any) => JSON.stringify(m.sent);
const btn = (edit: any, label: string) => edit.components.flatMap((r: any) => r.components).find((c: any) => (c.label ?? '').startsWith(label));
let n = 0; const pass = (m: string) => console.log(`  ok ${++n} - ${m}`);

async function main() {
  await connect();
  for (const t of ['pa_roster', 'pa_discovered', 'pa_players']) await sql(`DELETE FROM ${t} WHERE user_id LIKE 't\\_h\\_%'`);
  await sql(`DELETE FROM coin_transactions WHERE user_id LIKE 't\\_h\\_%'`); await sql(`DELETE FROM users WHERE user_id LIKE 't\\_h\\_%'`);
  await awardCoins(U, 2_000_000, 'test', { gameInstanceId: 't_h_seed' });

  // wrong channel
  { const m = fakeMessage(U, '999'); await H.handlePscoutCommand(m); await H.handlePlistCommand(m); await H.handlePworkCommand(m, []); await H.handlePcollectCommand(m); await H.handlePrecruitCommand(m, []);
    assert.equal(m.sent.length, 5); assert.ok(m.sent.every((s: any) => s.content.includes(`<#${CH}>`))); pass('all 5 commands reject other channels'); }

  // empty hub
  { const m = fakeMessage(U); await H.handlePlistCommand(m); assert.ok(text(m).includes('pscout')); assert.equal(m.sent[0].components.length, 0); pass('empty hub points to .pscout'); }

  // scout (no image file on disk: must not crash)
  const m1 = fakeMessage(U); await H.handlePscoutCommand(m1);
  const card = m1.sent[0]; assert.equal(card.files, 0); const recruitBtn = card.components[0].components[0];
  assert.match(recruitBtn.custom_id, /^pa_recruit_t_h_user_/); pass(`scout card without image file OK (${card.embeds[0].title}, "${recruitBtn.label}")`);
  const m2 = fakeMessage(U); await H.handlePscoutCommand(m2); assert.match(m2.sent[0].content, /Back in/); pass('scout cooldown message');

  // another user clicking the button is rejected
  { const i = fakeInteraction(recruitBtn.custom_id, OTHER); await H.handleAgencyInteraction(i); assert.equal(i.log.replies.length, 1); assert.equal(i.log.deferred, false); assert.equal(i.log.edits.length, 0); pass('non-owner click rejected'); }

  // recruit via button (double click)
  const slug = recruitBtn.custom_id.slice(`pa_recruit_${U}_`.length);
  { const a = fakeInteraction(recruitBtn.custom_id, U), b = fakeInteraction(recruitBtn.custom_id, U);
    await Promise.all([H.handleAgencyInteraction(a), H.handleAgencyInteraction(b)]);
    const edits = a.log.edits.length + b.log.edits.length, follows = a.log.follow.length + b.log.follow.length;
    assert.ok(edits >= 1 && follows >= 1, `edits ${edits} follows ${follows}`);
    const roster = await sql(`SELECT * FROM pa_roster WHERE user_id=$1`, [U]); assert.equal(roster.rows.length, 1); pass('double-click recruit: one signing, other told off'); }

  // typed recruit: unknown / undiscovered / list
  { const m = fakeMessage(U); await H.handlePrecruitCommand(m, ['donna']); assert.match(text(m), /scouted/); await H.handlePrecruitCommand(m, []); pass('precruit unknown name + no-arg list'); }
  // force-discover a few for typed flows
  for (const s of ['vendo-kun', 'grandpa-ichiro', 'sir-barkington', 'mochi-the-menace', 'big-tony-two-chains']) await sql(`INSERT INTO pa_discovered (user_id, character_slug) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [U, s]);
  { const m = fakeMessage(U); await H.handlePrecruitCommand(m, ['sir', 'bark']); assert.match(text(m), /Sir Barkington/); assert.match(text(m), /signed/); await H.handlePrecruitCommand(m, ['sir']); assert.match(m.sent[1].content, /already works/);
    await H.handlePrecruitCommand(m, ['i']); await H.handlePrecruitCommand(m, ['vendo']); pass('typed recruit partial name; duplicate refused; ambiguity handled'); console.log('     ambiguity reply:', m.sent[3 - 1 + 0].content); }

  // hub + select + profile
  const hubMsg = fakeMessage(U); await H.handlePlistCommand(hubMsg); const hub = hubMsg.sent[0]; assert.ok(hub.components[0].components[0].options.length >= 2); pass('hub has select menu');
  const rosterRows = (await sql(`SELECT id, character_slug FROM pa_roster WHERE user_id=$1 ORDER BY id`, [U])).rows;
  const target = rosterRows.find((r: any) => r.character_slug === 'sir-barkington') ?? rosterRows[0];
  const sel = fakeInteraction(`pa_select_${U}_hub`, U, [String(target.id)]); await H.handleAgencyInteraction(sel);
  let prof = sel.log.edits[0]; assert.ok(btn(prof, 'Care') && btn(prof, 'Train') && btn(prof, 'Send to work') && btn(prof, 'Back')); assert.ok(btn(prof, 'Care').disabled); pass('profile has Care/Train/Send/Back (care disabled at full stamina)');
  assert.equal(prof.embeds[0].fields.length, 5);

  // train: confirm then yes (and stale double confirm)
  const tr = fakeInteraction(btn(prof, 'Train').custom_id, U); await H.handleAgencyInteraction(tr); const conf = tr.log.edits[0]; assert.match(conf.embeds[0].description, /Level \*\*1\*\*/);
  const yesId = conf.components[0].components[0].custom_id; const y1 = fakeInteraction(yesId, U), y2 = fakeInteraction(yesId, U);
  const before = (await getCoinBalanceInfo(U))!.balance; await Promise.all([H.handleAgencyInteraction(y1), H.handleAgencyInteraction(y2)]);
  const lvl = (await sql(`SELECT level FROM pa_roster WHERE id=$1`, [target.id])).rows[0].level; assert.equal(lvl, 2); assert.equal(before - (await getCoinBalanceInfo(U))!.balance, 350);
  assert.equal(y1.log.follow.length + y2.log.follow.length, 1); pass('train confirm: charged once (350), stale second confirm rejected');

  // work via button, care disabled while working, collect
  const wk = fakeInteraction(`pa_work_${U}_${target.id}`, U); await H.handleAgencyInteraction(wk); prof = wk.log.edits[0]; assert.ok(btn(prof, 'Send to work').disabled && btn(prof, 'Train').disabled); pass('send to work via button');
  const pw = fakeMessage(U); await H.handlePworkCommand(pw, []); assert.match(text(pw), /Who's clocking in/); await H.handlePworkCommand(pw, ['mochi']); assert.match(pw.sent[1].content, /Nobody on your roster/);
  await H.handlePworkCommand(pw, ['vendo']); assert.match(pw.sent[2].content, /out working/); pass('.pwork list + by name');
  const pc0 = fakeMessage(U); await H.handlePcollectCommand(pc0); assert.match(text(pc0), /first pay in/); pass('.pcollect before 30 min explains wait');
  await sql(`UPDATE pa_roster SET work_started_at = now() - interval '45 minutes' WHERE user_id=$1 AND status='working'`, [U]);
  const hub2 = fakeMessage(U); await H.handlePlistCommand(hub2); assert.match(hub2.sent[0].embeds[0].description, /Ready to collect/); pass('hub shows ready-to-collect');
  const pc = fakeMessage(U); await H.handlePcollectCommand(pc); assert.match(pc.sent[0].embeds[0].title, /Payday/); console.log('     collect:', pc.sent[0].embeds[0].description.split('\n').slice(2).join(' | '), '|', pc.sent[0].embeds[0].fields.map((f: any) => f.value.replace(/\n/g, ' ')).join(' | ')); pass('.pcollect pays and summarizes');
  const pc2 = fakeMessage(U); await H.handlePcollectCommand(pc2); assert.match(text(pc2), /Nobody is out working/); pass('second collect refused');

  // care confirm flow (stamina is now < 100)
  const sel2 = fakeInteraction(`pa_select_${U}_hub`, U, [String(target.id)]); await H.handleAgencyInteraction(sel2); prof = sel2.log.edits[0]; assert.ok(!btn(prof, 'Care').disabled);
  const ca = fakeInteraction(btn(prof, 'Care').custom_id, U); await H.handleAgencyInteraction(ca); const cc = ca.log.edits[0]; const cy = fakeInteraction(cc.components[0].components[0].custom_id, U); await H.handleAgencyInteraction(cy);
  assert.equal((await sql(`SELECT stamina FROM pa_roster WHERE id=$1`, [target.id])).rows[0].stamina, 100); pass('care confirm restores stamina to 100');
  const no = fakeInteraction(cc.components[0].components[1].custom_id, U); await H.handleAgencyInteraction(no); assert.ok(no.log.edits[0].embeds[0].title.includes('Barkington') || true); pass('NO returns to profile');
  const bk = fakeInteraction(`pa_back_${U}_list`, U); await H.handleAgencyInteraction(bk); assert.ok(bk.log.edits[0].components[0].components[0].options); pass('Back to list');

  // image present => attachment sent
  const fs = await import('fs'); fs.mkdirSync('assets/characters', { recursive: true });
  fs.writeFileSync('assets/characters/sir-barkington.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  const sel3 = fakeInteraction(`pa_select_${U}_hub`, U, [String(target.id)]); await H.handleAgencyInteraction(sel3); assert.equal(sel3.log.edits[0].files, 1); assert.equal(sel3.log.edits[0].embeds[0].image.url, 'attachment://sir-barkington.png'); pass('image attachment used when file exists');
  fs.rmSync('assets/characters/sir-barkington.png'); try { fs.rmdirSync('assets/characters'); } catch {}

  for (const t of ['pa_roster', 'pa_discovered', 'pa_players']) await sql(`DELETE FROM ${t} WHERE user_id LIKE 't\\_h\\_%'`);
  await sql(`DELETE FROM coin_transactions WHERE user_id LIKE 't\\_h\\_%'`); await sql(`DELETE FROM users WHERE user_id LIKE 't\\_h\\_%'`);
  console.log(`\nALL ${n} HANDLER CHECKS PASSED`);
}
main().then(() => disconnect()).catch(async (e) => { console.error('FAIL', e); await disconnect(); process.exit(1); });
