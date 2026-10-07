import { Message } from 'discord.js';
import { awardCoins } from '../services/coins.js';
import { createOrUpdateUser } from '../database/client.js';
import {
  GOON_COOLDOWN_MS,
  GOON_REWARD,
  GOON_REWARD_REDUCED,
  GOON_DAILY_FREE_USES,
  GOON_POWERUP_DURATION_MS,
  centralDateString,
  claimTracking,
  loadTracking,
} from '../utils/goon-edge.js';
import { config, isGameFloorChannel, isTalentAgencyChannel, isGoonEdgeChannel } from '../config/index.js';

const COIN = '<:bombocoin:1545139736312815840>';

const GOON_FLAVOR_LINES = [
  '💀 Bro couldn\'t resist the goon.',
  '🗿 The goon agenda marches on.',
  '😭 There goes the edge streak.',
  '⚡ Quick money, questionable choices.',
  '🫡 Bro chose violence against his own streak.',
  '📉 Edge streak: deleted. Goon: secured.',
  '💸 Financially irresponsible. Spiritually committed.',
  '👁️ The temptation won.',
  '🔥 Bro hit the emergency goon button.',
  '🏆 Congratulations, you gooned. Society is proud.',
];

const GOON_LIMIT_FLAVOR = '💸 Bro used up the premium goon package.';
const GOON_RUSH_FLAVOR = '⚡ The power-up is doing WORK.';

export async function handleGoonCommand(message: Message): Promise<void> {
  // Check if command is used in game floor channel, talent agency channel, or goon/edge channel
  if (!isGameFloorChannel(message.channel.id) && !isTalentAgencyChannel(message.channel.id) && !isGoonEdgeChannel(message.channel.id)) {
    await message.reply(`This command can only be used in <#${config.gameFloorChannelIds[0]}>, <#${config.talentAgencyChannelId}>, or <#${config.goonEdgeChannelId}>.`);
    return;
  }

  const userId = message.author.id;

  // Ensure user exists
  await createOrUpdateUser(userId);

  const t = await loadTracking(userId);
  const now = Date.now();
  const today = centralDateString(now);

  // Power-up (earned with 10 edges in a row) halves the goon cooldown
  const powerupActive = !!t.goon_powerup_until && now < t.goon_powerup_until.getTime();
  const cooldownMs = powerupActive ? GOON_COOLDOWN_MS / 2 : GOON_COOLDOWN_MS;

  // Check cooldown
  if (t.last_goon_used) {
    const timeSinceLastUse = now - t.last_goon_used.getTime();
    if (timeSinceLastUse < cooldownMs) {
      const remainingTime = Math.ceil((cooldownMs - timeSinceLastUse) / 1000 / 60);
      await message.reply(`Cooldown: ${remainingTime}m${powerupActive ? ' (power-up active)' : ''}`);
      return;
    }
  }

  // Daily resets
  let dailyGoonCount = t.goon_daily_date === today ? t.goon_daily_count : 0;
  dailyGoonCount++;
  const isOverLimit = dailyGoonCount > GOON_DAILY_FREE_USES;
  const reward = isOverLimit ? GOON_REWARD_REDUCED : GOON_REWARD;

  const after = {
    ...t,
    last_goon_used: new Date(now),
    goon_daily_count: dailyGoonCount,
    goon_daily_date: today,
    // Using .goon resets the edge streak
    edge_streak: 0,
    last_edge_streak_at: null,
  };

  // Atomic claim: if two .goon messages race, only one gets through
  const claimed = await claimTracking(userId, t, after, ['last_goon_used', 'goon_daily_count']);
  if (!claimed) {
    await message.reply('Easy there, one .goon at a time!');
    return;
  }

  const awardResult = await awardCoins(userId, reward, 'goon', {
    reason: 'Goon command reward',
    description: `Gooned and earned ${reward} coins`,
    gameInstanceId: `goon_${userId}_${now}`,
  });

  if (awardResult === null) {
    // Give the use back so a failed payout doesn't burn the cooldown
    await claimTracking(userId, after, t, ['last_goon_used']).catch(() => undefined);
    await message.reply('Failed to award coins. Please try again later.');
    return;
  }

  // Pick flavor line based on state
  let flavorLine;
  if (powerupActive) {
    flavorLine = GOON_RUSH_FLAVOR;
  } else if (isOverLimit) {
    flavorLine = GOON_LIMIT_FLAVOR;
  } else {
    flavorLine = GOON_FLAVOR_LINES[Math.floor(Math.random() * GOON_FLAVOR_LINES.length)];
  }

  // Build info line
  let infoLine = `💰 +${reward} ${COIN} • 🍆 Goon: ${dailyGoonCount}`;
  if (dailyGoonCount <= GOON_DAILY_FREE_USES) {
    infoLine += `/${GOON_DAILY_FREE_USES} today`;
  } else {
    infoLine += `+ today`;
  }
  if (powerupActive) {
    infoLine += ` • ⚡ 7.5m cooldown`;
  }

  await message.reply(`${flavorLine}\n${infoLine}`);
}
