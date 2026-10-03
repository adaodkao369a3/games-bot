import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentStamina, levelMultiplier, payoutPerBlock, trainCost, careCost,
  workEarnings, weightedPick, staminaBar, BLOCK_MS,
} from '../src/agency/agency-logic.js';

const intern = { slug: 'x', tier_key: 'intern', base_payout: 150, recruit_price: 5000, stamina_cost: 10 };
const ichiro = { slug: 'i', tier_key: 'intern', base_payout: 75, recruit_price: 3500, stamina_cost: 15 };
const t0 = new Date('2026-01-01T00:00:00Z');
const at = (min: number) => new Date(t0.getTime() + min * 60000);

test('intern L1 working 3 hours earns 600 and spends 40 stamina', () => {
  assert.deepEqual(workEarnings(intern, 1, 100, t0, at(180)), { blocks: 4, coins: 600, staminaSpent: 40 });
});
test('level 10 intern earns 258 per block, multiplier 1.72', () => {
  assert.equal(levelMultiplier(10), 1.72);
  assert.equal(payoutPerBlock(intern, 10), 258);
});
test('train intern L1->2 costs 500; max level has no cost', () => {
  assert.equal(trainCost(intern, 1), 500);
  assert.equal(trainCost(intern, 9), 4500);
  assert.equal(trainCost(intern, 10), null);
  assert.equal(trainCost(ichiro, 1), 350);
});
test('stamina limits blocks; partial block earns nothing', () => {
  assert.equal(workEarnings(intern, 1, 25, t0, at(180)).blocks, 2);
  assert.equal(workEarnings(ichiro, 1, 100, t0, at(180)).staminaSpent, 60); // 4 x 15
  assert.equal(workEarnings(intern, 1, 100, t0, at(29)).blocks, 0);
  assert.equal(workEarnings(intern, 1, 9, t0, at(180)).blocks, 0);
});
test('lazy regen: 10 per 30m resting, capped, frozen while working', () => {
  const row = { stamina: 40, stamina_updated_at: t0, status: 'resting' };
  assert.equal(currentStamina(row, at(29)), 40);
  assert.equal(currentStamina(row, at(95)), 70);
  assert.equal(currentStamina(row, at(9999)), 100);
  assert.equal(currentStamina({ ...row, status: 'working' }, at(9999)), 40);
});
test('care cost scales, rounds up, min 1', () => {
  const tier = { care_price: 400 };
  assert.equal(careCost(tier, 100), 0);
  assert.equal(careCost(tier, 0), 400);
  assert.equal(careCost(tier, 50), 200);
  assert.equal(careCost(tier, 99), 4);
  assert.equal(careCost({ care_price: 10 }, 99), 1);
});
test('weightedPick renormalizes over tiers with candidates', () => {
  const tiers = [
    { tier_key: 'a', scout_weight: 30 }, { tier_key: 'b', scout_weight: 70 },
  ];
  const onlyA = [{ tier_key: 'a', n: 1 }, { tier_key: 'a', n: 2 }];
  for (let i = 0; i < 50; i++) assert.equal(weightedPick(onlyA, tiers)!.tier_key, 'a');
  assert.equal(weightedPick([], tiers), null);
  const both = [{ tier_key: 'a' }, { tier_key: 'b' }];
  assert.equal(weightedPick(both, tiers, () => 0.29)!.tier_key, 'a'); // 0.29*100=29 <30
  assert.equal(weightedPick(both, tiers, () => 0.31)!.tier_key, 'b');
  // distribution sanity
  let a = 0; const N = 20000;
  for (let i = 0; i < N; i++) if (weightedPick(both, tiers)!.tier_key === 'a') a++;
  assert.ok(Math.abs(a / N - 0.3) < 0.02);
});
test('stamina bar', () => {
  assert.equal(staminaBar(70), '▰▰▰▰▰▰▰▱▱▱ 70/100');
  assert.equal(staminaBar(0), '▱▱▱▱▱▱▱▱▱▱ 0/100');
  assert.equal(BLOCK_MS, 1800000);
});
