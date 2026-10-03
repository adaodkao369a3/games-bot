import { Message, EmbedBuilder } from 'discord.js';
import { awardCoins } from '../services/coins.js';
import { createOrUpdateUser } from '../database/client.js';
import {
  EDGE_COOLDOWN_MS,
  EDGE_REWARD,
  EDGE_DAILY_BONUS,
  EDGE_DAILY_TARGET,
  EDGE_STREAK_GAP_MS,
  EDGE_STREAK_MAX_PCT,
  EDGE_POWERUP_STREAK,
  GOON_POWERUP_DURATION_MS,
  centralDateString,
  claimTracking,
  edgeStreakBonusPct,
  loadTracking,
} from '../utils/goon-edge.js';

const COIN = '<:bombocoin:1545139736312815840>';

export async function handleEdgeCommand(message: Message): Promise<void> {
  const userId = message.author.id;

  // Ensure user exists
  await createOrUpdateUser(userId);

  const t = await loadTracking(userId);
  const now = Date.now();
  const today = centralDateString(now);

  // Check if edge is blocked due to goon streak (existing behaviour)
  if (t.edge_blocked_until && now < t.edge_blocked_until.getTime()) {
    const remainingMinutes = Math.ceil((t.edge_blocked_until.getTime() - now) / 1000 / 60);
    await message.reply(`You have used .goon 3 times! You cannot use .edge for ${remainingMinutes} more minutes.`);
    return;
  }

  // Check cooldown
  if (t.last_edge_used) {
    const timeSinceLastUse = now - t.last_edge_used.getTime();
    if (timeSinceLastUse < EDGE_COOLDOWN_MS) {
      const remainingTime = Math.ceil((EDGE_COOLDOWN_MS - timeSinceLastUse) / 1000 / 60);
      await message.reply(`You need to wait ${remainingTime} more minutes before using .edge again!`);
      return;
    }
  }

  // Daily resets (same "new day" rule as before)
  let edgeCount = t.edge_daily_count;
  let goonCount = t.goon_count;
  if (t.edge_daily_date !== today) {
    edgeCount = 0;
    goonCount = 0;
  }
  edgeCount++;
  const reachedDailyTarget = edgeCount === EDGE_DAILY_TARGET;

  // Streak: consecutive edges. Breaks after a >30 min gap (a .goon also resets it, see goon.ts).
  const streakBroken = !t.last_edge_streak_at || now - t.last_edge_streak_at.getTime() > EDGE_STREAK_GAP_MS;
  const streak = (streakBroken ? 0 : t.edge_streak) + 1;
  const bonusPct = edgeStreakBonusPct(streak);
  const streakReward = Math.round(EDGE_REWARD * (1 + bonusPct / 100));
  const grantsPowerup = streak % EDGE_POWERUP_STREAK === 0;

  const after = {
    ...t,
    last_edge_used: new Date(now),
    edge_daily_count: edgeCount,
    edge_daily_date: today,
    goon_count: goonCount,
    edge_streak: streak,
    last_edge_streak_at: new Date(now),
    goon_powerup_until: grantsPowerup ? new Date(now + GOON_POWERUP_DURATION_MS) : t.goon_powerup_until,
  };

  // Atomic claim: if two .edge messages race, only one gets through
  const claimed = await claimTracking(userId, t, after, ['last_edge_used', 'edge_streak', 'edge_daily_count']);
  if (!claimed) {
    await message.reply('Easy there, one .edge at a time!');
    return;
  }

  const totalReward = streakReward + (reachedDailyTarget ? EDGE_DAILY_BONUS : 0);
  const awardResult = await awardCoins(userId, totalReward, 'edge', {
    reason: 'Edge command reward',
    description: `Edged (streak ${streak}, +${bonusPct}%) and earned ${totalReward} coins${reachedDailyTarget ? ' (including daily bonus!)' : ''}`,
    gameInstanceId: `edge_${userId}_${now}`,
  });

  if (awardResult === null) {
    // Give the use back so a failed payout doesn't burn the cooldown or the streak
    await claimTracking(userId, after, t, ['last_edge_used']).catch(() => undefined);
    await message.reply('Failed to award coins. Please try again later.');
    return;
  }

  const lines: string[] = [
    `You earned **${totalReward}** ${COIN}!` +
      (bonusPct > 0 ? `\n(${EDGE_REWARD} base + ${bonusPct}% streak bonus = ${streakReward}${reachedDailyTarget ? ` + ${EDGE_DAILY_BONUS} daily bonus` : ''})` : reachedDailyTarget ? `\n(${EDGE_REWARD} base + ${EDGE_DAILY_BONUS} daily bonus)` : ''),
    `🔥 **Streak:** ${streak} in a row (+${bonusPct}% bonus, max +${EDGE_STREAK_MAX_PCT}%)`,
  ];
  if (grantsPowerup) {
    lines.push(`⚡ **POWER-UP!** ${EDGE_POWERUP_STREAK} edges in a row: your .goon cooldown is halved for 1 hour. (Using .goon resets your edge streak.)`);
  } else if (streak < EDGE_POWERUP_STREAK) {
    lines.push(`Reach ${EDGE_POWERUP_STREAK} in a row (edge every ≤30 min, no .goon in between) for a 1-hour half-cooldown .goon power-up.`);
  }
  if (reachedDailyTarget) lines.push(`🌟 **DAILY BONUS!** ${EDGE_DAILY_TARGET} edges today: +${EDGE_DAILY_BONUS} coins.`);
  lines.push(`**Daily Count:** ${edgeCount}/${EDGE_DAILY_TARGET}  ·  Resets daily.`);

  const embed = new EmbedBuilder()
    .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
    .setTitle('🔥 EDGE STREAK STARTED!')
    .setDescription(lines.join('\n\n'))
    .setThumbnail(message.author.displayAvatarURL())
    .setColor(0xFF4500);

  await message.reply({ embeds: [embed] });
}
