import { Message, EmbedBuilder } from 'discord.js';
import { awardCoins, removeCoins, getCoinBalanceInfo } from '../services/coins.js';
import { createOrUpdateUser } from '../database/client.js';
import {
  GOON_COOLDOWN_MS,
  GOON_REWARD,
  GOON_STREAK_LIMIT,
  EDGE_BLOCK_DURATION_MS,
  GOON_DAILY_FREE_USES,
  GOON_EXTRA_USE_PENALTY,
  centralDateString,
  claimTracking,
  loadTracking,
} from '../utils/goon-edge.js';

const COIN = '<:bombocoin:1545139736312815840>';

/** Takes up to `amount` coins, but never more than the user has. Never throws. Returns what was actually taken. */
async function chargeUpTo(userId: string, amount: number, id: string): Promise<number> {
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const info = await getCoinBalanceInfo(userId);
      const take = Math.min(amount, info?.balance ?? 0);
      if (take <= 0) return 0;
      const result = await removeCoins(userId, take, 'goon', {
        reason: 'Goon over-use penalty',
        description: `Used .goon more than ${GOON_DAILY_FREE_USES} times today`,
        gameInstanceId: `${id}_${attempt}`,
      });
      if (result !== null) return take;
    }
  } catch (error) {
    console.error('[GOON] Penalty charge failed:', error);
  }
  return 0;
}

export async function handleGoonCommand(message: Message): Promise<void> {
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
      await message.reply(`You need to wait ${remainingTime} more minutes before using .goon again!${powerupActive ? ' (power-up active: half cooldown)' : ''}`);
      return;
    }
  }

  // Existing behaviour: the 3-goon streak lock also applies here
  if (t.edge_blocked_until && now < t.edge_blocked_until.getTime()) {
    const remainingMinutes = Math.ceil((t.edge_blocked_until.getTime() - now) / 1000 / 60);
    await message.reply(`You have used .goon ${GOON_STREAK_LIMIT} times! You cannot use .edge for ${remainingMinutes} more minutes.`);
    return;
  }

  // Daily resets (same "new day" rule as before)
  let goonCount = t.goon_count;
  let edgeCount = t.edge_daily_count;
  if (t.edge_daily_date !== today) {
    goonCount = 0;
    edgeCount = 0;
  }
  const dailyGoons = (t.goon_daily_date === today ? t.goon_daily_count : 0) + 1;
  const newGoonCount = goonCount + 1;

  const after = {
    ...t,
    last_goon_used: new Date(now),
    goon_count: newGoonCount,
    edge_daily_count: edgeCount,
    edge_daily_date: today,
    goon_daily_count: dailyGoons,
    goon_daily_date: today,
    // DEFAULT: using .goon breaks the edge streak
    edge_streak: 0,
    last_edge_streak_at: null,
    edge_blocked_until: newGoonCount >= GOON_STREAK_LIMIT ? new Date(now + EDGE_BLOCK_DURATION_MS) : t.edge_blocked_until,
  };

  // Atomic claim: if two .goon messages race, only one gets through
  const claimed = await claimTracking(userId, t, after, ['last_goon_used', 'goon_daily_count', 'goon_daily_date']);
  if (!claimed) {
    await message.reply('Easy there, one .goon at a time!');
    return;
  }

  // Award coins
  const awardResult = await awardCoins(userId, GOON_REWARD, 'goon', {
    reason: 'Goon command reward',
    description: `Successfully gooned and earned ${GOON_REWARD} coins`,
    gameInstanceId: `goon_${userId}_${now}`,
  });

  if (awardResult === null) {
    // Give the use back so a failed payout doesn't burn the cooldown
    await claimTracking(userId, after, t, ['last_goon_used']).catch(() => undefined);
    await message.reply('Failed to award coins. Please try again later.');
    return;
  }

  // Over-use penalty: still paid above, but each use past the daily limit costs extra (never fails the command)
  let penaltyTaken = 0;
  const overLimit = dailyGoons > GOON_DAILY_FREE_USES;
  if (overLimit) {
    penaltyTaken = await chargeUpTo(userId, GOON_EXTRA_USE_PENALTY, `goon_penalty_${userId}_${now}`);
  }

  const lines: string[] = [`You earned **${GOON_REWARD}** ${COIN}!`];
  if (overLimit) {
    lines.push(
      `💸 **Over-use penalty:** -${penaltyTaken} ${COIN} (use #${dailyGoons} today, limit is ${GOON_DAILY_FREE_USES}).` +
        `\nNet this use: **${GOON_REWARD - penaltyTaken >= 0 ? '+' : ''}${GOON_REWARD - penaltyTaken}** ${COIN}`
    );
  }
  if (newGoonCount >= GOON_STREAK_LIMIT) lines.push(`⚠️ **Goon streak complete!** You cannot use .edge for 1 hour.`);
  if (powerupActive) lines.push('⚡ Power-up active: goon cooldown is halved.');
  lines.push(
    `**Goon Count:** ${newGoonCount}/${GOON_STREAK_LIMIT}`,
    `**Uses today:** ${dailyGoons}/${GOON_DAILY_FREE_USES} free (extra uses cost ${GOON_EXTRA_USE_PENALTY} ${COIN} each)`,
    `Use \`.goon\` ${GOON_STREAK_LIMIT} times to block .edge for 1 hour! Resets daily.`
  );

  const embed = new EmbedBuilder()
    .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
    .setTitle('🎉 SUCCESSFULLY GOONED!')
    .setDescription(lines.join('\n\n'))
    .setThumbnail(message.author.displayAvatarURL())
    .setColor(overLimit ? 0xE74C3C : 0xFF69B4);

  await message.reply({ embeds: [embed] });
}
