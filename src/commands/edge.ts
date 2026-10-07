import { Message } from 'discord.js';
import { awardCoins } from '../services/coins.js';
import { createOrUpdateUser } from '../database/client.js';
import {
  EDGE_COOLDOWN_MS,
  EDGE_REWARD,
  EDGE_STREAK_GAP_MS,
  EDGE_STREAK_MAX_PCT,
  EDGE_POWERUP_STREAK,
  GOON_POWERUP_DURATION_MS,
  claimTracking,
  edgeStreakBonusPct,
  loadTracking,
} from '../utils/goon-edge.js';
import { config, isGameFloorChannel, isTalentAgencyChannel, isGoonEdgeChannel } from '../config/index.js';

const COIN = '<:bombocoin:1545139736312815840>';

const EDGE_FLAVOR_LINES = [
  '🧱 Bro is edging like the rent is due.',
  '😭 Another edge? Seek professional help.',
  '🗿 Absolutely locked in. Respectfully.',
  '⚡ The grind never ends. Neither does the edge.',
  '🫡 Bro clocked in for another shift.',
  '📈 Your priorities are questionable, but profitable.',
  '🔥 That\'s not an edge streak, that\'s a lifestyle.',
  '💀 Bro has transcended normal decision-making.',
  '🏃‍♂️ Another one for the edge economy.',
  '👁️ The council has noticed your dedication.',
];

export async function handleEdgeCommand(message: Message): Promise<void> {
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

  // Check cooldown
  if (t.last_edge_used) {
    const timeSinceLastUse = now - t.last_edge_used.getTime();
    if (timeSinceLastUse < EDGE_COOLDOWN_MS) {
      const remainingTime = Math.ceil((EDGE_COOLDOWN_MS - timeSinceLastUse) / 1000 / 60);
      await message.reply(`Cooldown: ${remainingTime}m`);
      return;
    }
  }

  // Streak: consecutive edges. Breaks after a >20 min gap.
  const streakBroken = !t.last_edge_streak_at || now - t.last_edge_streak_at.getTime() > EDGE_STREAK_GAP_MS;
  const streak = (streakBroken ? 0 : t.edge_streak) + 1;
  const bonusPct = edgeStreakBonusPct(streak);
  const streakReward = Math.round(EDGE_REWARD * (1 + bonusPct / 100));
  const grantsPowerup = streak === EDGE_POWERUP_STREAK;

  const after = {
    ...t,
    last_edge_used: new Date(now),
    edge_streak: streak,
    last_edge_streak_at: new Date(now),
    goon_powerup_until: grantsPowerup ? new Date(now + GOON_POWERUP_DURATION_MS) : t.goon_powerup_until,
  };

  // Atomic claim: if two .edge messages race, only one gets through
  const claimed = await claimTracking(userId, t, after, ['last_edge_used', 'edge_streak']);
  if (!claimed) {
    await message.reply('Easy there, one .edge at a time!');
    return;
  }

  const awardResult = await awardCoins(userId, streakReward, 'edge', {
    reason: 'Edge command reward',
    description: `Edged (streak ${streak}, +${bonusPct}%)`,
    gameInstanceId: `edge_${userId}_${now}`,
  });

  if (awardResult === null) {
    // Give the use back so a failed payout doesn't burn the cooldown or the streak
    await claimTracking(userId, after, t, ['last_edge_used']).catch(() => undefined);
    await message.reply('Failed to award coins. Please try again later.');
    return;
  }

  // Pick random flavor line
  const flavorLine = EDGE_FLAVOR_LINES[Math.floor(Math.random() * EDGE_FLAVOR_LINES.length)];

  // Build info line
  let infoLine = `💰 +${streakReward} ${COIN} • 🔥 ${streak} streak`;
  if (bonusPct > 0) {
    infoLine += ` • +${bonusPct}% bonus`;
  }
  if (grantsPowerup) {
    infoLine += ` • ⚡ Goon cooldown halved for 1h`;
  }

  await message.reply(`${flavorLine}\n${infoLine}`);
}
