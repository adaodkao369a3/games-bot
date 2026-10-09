import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWagerAmount } from '../src/utils/wager-parser.js';

test('parseWagerAmount: numeric amounts', () => {
  assert.equal(parseWagerAmount('100', 1000), 100);
  assert.equal(parseWagerAmount('500', 1000), 500);
  assert.equal(parseWagerAmount('1000', 1000), 1000);
  assert.equal(parseWagerAmount('1,500', 10000), 1500);
});

test('parseWagerAmount: k suffix', () => {
  assert.equal(parseWagerAmount('1k', 10000), 1000);
  assert.equal(parseWagerAmount('5k', 10000), 5000);
  assert.equal(parseWagerAmount('10k', 10000), 10000);
  assert.equal(parseWagerAmount('1.5k', 10000), 1500);
});

test('parseWagerAmount: m suffix', () => {
  assert.equal(parseWagerAmount('1m', 10000000), 1000000);
  assert.equal(parseWagerAmount('2.5m', 10000000), 2500000);
});

test('parseWagerAmount: b suffix', () => {
  assert.equal(parseWagerAmount('1b', 10000000000), 1000000000);
});

test('parseWagerAmount: all keyword', () => {
  assert.equal(parseWagerAmount('all', 1000), 1000);
  assert.equal(parseWagerAmount('all', 5000), 5000);
  assert.equal(parseWagerAmount('ALL', 1000), 1000);
  assert.equal(parseWagerAmount('all', 0), null); // zero balance returns null
});

test('parseWagerAmount: max keyword', () => {
  assert.equal(parseWagerAmount('max', 1000), 1000);
  assert.equal(parseWagerAmount('MAX', 1000), 1000);
  assert.equal(parseWagerAmount('max', 0), null); // zero balance returns null
});

test('parseWagerAmount: invalid inputs return null', () => {
  assert.equal(parseWagerAmount('invalid', 1000), null);
  assert.equal(parseWagerAmount('', 1000), null);
  assert.equal(parseWagerAmount('abc', 1000), null);
});

test('parseWagerAmount: negative amounts return null', () => {
  assert.equal(parseWagerAmount('-100', 1000), null);
  assert.equal(parseWagerAmount('-1k', 1000), null);
});

test('parseWagerAmount: zero returns null', () => {
  assert.equal(parseWagerAmount('0', 1000), null);
  assert.equal(parseWagerAmount('0k', 1000), null);
});

test('parseWagerAmount: amount exceeds balance', () => {
  // Parser should return the parsed amount even if it exceeds balance
  // Validation against balance is the caller's responsibility
  assert.equal(parseWagerAmount('10000', 1000), 10000);
});

test('parseWagerAmount: decimal amounts are floored', () => {
  assert.equal(parseWagerAmount('1.5', 1000), 1);
  assert.equal(parseWagerAmount('1.9k', 10000), 1900);
  assert.equal(parseWagerAmount('2.7m', 10000000), 2700000);
});
