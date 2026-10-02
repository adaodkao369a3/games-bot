import { Message, EmbedBuilder } from 'discord.js';
import { awardCoins } from '../services/coins.js';
import { createOrUpdateUser, getClient } from '../database/client.js';

const EDGE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const EDGE_REWARD = 500;
const EDGE_STREAK_BONUS = 2000;
const EDGE_STREAK_TARGET = 10;

interface GoonEdgeTracking {
  last_goon_used: Date | null;
  last_edge_used: Date | null;
  edge_daily_count: number;
  edge_daily_date: Date;
  goon_count: number;
  edge_blocked_until: Date | null;
}

async function getGoonEdgeTracking(userId: string): Promise<GoonEdgeTracking | null> {
  const client = await getClient();
  try {
    const result = await client.query(
      'SELECT last_goon_used, last_edge_used, edge_daily_count, edge_daily_date, goon_count, edge_blocked_until FROM goon_edge_tracking WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      last_goon_used: row.last_goon_used,
      last_edge_used: row.last_edge_used,
      edge_daily_count: row.edge_daily_count,
      edge_daily_date: row.edge_daily_date,
      goon_count: row.goon_count,
      edge_blocked_until: row.edge_blocked_until,
    };
  } finally {
    client.release();
  }
}

async function createGoonEdgeTracking(userId: string): Promise<void> {
  const client = await getClient();
  try {
    await client.query(
      'INSERT INTO goon_edge_tracking (user_id, edge_daily_date) VALUES ($1, CURRENT_DATE)',
      [userId]
    );
  } finally {
    client.release();
  }
}

async function updateGoonEdgeTracking(
  userId: string,
  updates: Partial<GoonEdgeTracking>
): Promise<void> {
  const client = await getClient();
  try {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.last_goon_used !== undefined) {
      setClauses.push(`last_goon_used = $${paramIndex++}`);
      values.push(updates.last_goon_used);
    }
    if (updates.last_edge_used !== undefined) {
      setClauses.push(`last_edge_used = $${paramIndex++}`);
      values.push(updates.last_edge_used);
    }
    if (updates.edge_daily_count !== undefined) {
      setClauses.push(`edge_daily_count = $${paramIndex++}`);
      values.push(updates.edge_daily_count);
    }
    if (updates.edge_daily_date !== undefined) {
      setClauses.push(`edge_daily_date = $${paramIndex++}`);
      values.push(updates.edge_daily_date);
    }
    if (updates.goon_count !== undefined) {
      setClauses.push(`goon_count = $${paramIndex++}`);
      values.push(updates.goon_count);
    }
    if (updates.edge_blocked_until !== undefined) {
      setClauses.push(`edge_blocked_until = $${paramIndex++}`);
      values.push(updates.edge_blocked_until);
    }

    values.push(userId);
    const query = `UPDATE goon_edge_tracking SET ${setClauses.join(', ')} WHERE user_id = $${paramIndex}`;
    await client.query(query, values);
  } finally {
    client.release();
  }
}

function getCentralTimeDate(): Date {
  // Central Time is UTC-6 (or UTC-5 during DST)
  // We'll use UTC-6 as a simple approximation
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc - (6 * 3600000));
}

export async function handleEdgeCommand(message: Message): Promise<void> {
  const userId = message.author.id;

  // Ensure user exists
  await createOrUpdateUser(userId);

  const tracking = await getGoonEdgeTracking(userId);
  if (!tracking) {
    await createGoonEdgeTracking(userId);
  }

  const currentTracking = tracking || {
    last_goon_used: null,
    last_edge_used: null,
    edge_daily_count: 0,
    edge_daily_date: getCentralTimeDate(),
    goon_count: 0,
    edge_blocked_until: null,
  };

  // Check if edge is blocked due to goon streak
  if (currentTracking.edge_blocked_until && new Date() < currentTracking.edge_blocked_until) {
    const remainingMinutes = Math.ceil((currentTracking.edge_blocked_until.getTime() - Date.now()) / 1000 / 60);
    await message.reply(`You have used .goon 3 times! You cannot use .edge for ${remainingMinutes} more minutes.`);
    return;
  }

  // Check cooldown
  if (currentTracking.last_edge_used) {
    const timeSinceLastUse = Date.now() - currentTracking.last_edge_used.getTime();
    if (timeSinceLastUse < EDGE_COOLDOWN_MS) {
      const remainingTime = Math.ceil((EDGE_COOLDOWN_MS - timeSinceLastUse) / 1000 / 60);
      await message.reply(`You need to wait ${remainingTime} more minutes before using .edge again!`);
      return;
    }
  }

  // Check if daily streak needs reset
  const centralToday = getCentralTimeDate();
  const centralTodayStr = centralToday.toISOString().split('T')[0];
  const trackingDateStr = currentTracking.edge_daily_date.toISOString().split('T')[0];

  let edgeCount = currentTracking.edge_daily_count;
  let goonCount = currentTracking.goon_count;
  if (trackingDateStr !== centralTodayStr) {
    // New day, reset streak
    edgeCount = 0;
    goonCount = 0;
  }

  // Increment edge count
  edgeCount++;
  const reachedStreakTarget = edgeCount === EDGE_STREAK_TARGET;

  // Update tracking
  const updates: Partial<GoonEdgeTracking> = {
    last_edge_used: new Date(),
    edge_daily_count: edgeCount,
    edge_daily_date: centralToday,
    goon_count: goonCount,
  };

  await updateGoonEdgeTracking(userId, updates);

  // Award coins
  let totalReward = EDGE_REWARD;
  if (reachedStreakTarget) {
    totalReward += EDGE_STREAK_BONUS;
  }

  const awardResult = await awardCoins(
    userId,
    totalReward,
    'edge',
    {
      reason: 'Edge command reward',
      description: `Successfully edged and earned ${totalReward} coins${reachedStreakTarget ? ' (including streak bonus!)' : ''}`,
    }
  );

  if (awardResult === null) {
    await message.reply('Failed to award coins. Please try again later.');
    return;
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
    .setTitle('🔥 EDGE STREAK STARTED!')
    .setDescription(`You earned **${totalReward}** <:bombocoin:1545139736312815840>!\n\n` +
      `${reachedStreakTarget ? `🌟 **STREAK BONUS!** You reached ${EDGE_STREAK_TARGET} edges today and earned an extra ${EDGE_STREAK_BONUS} coins!\n\n` : ''}` +
      `**Daily Count:** ${edgeCount}/${EDGE_STREAK_TARGET}\n\n` +
      `Use \`.edge\` ${EDGE_STREAK_TARGET} times today for ${EDGE_STREAK_BONUS} bonus coins!\n` +
      `Resets daily.`)
    .setThumbnail(message.author.displayAvatarURL())
    .setColor(0xFF4500);

  await message.reply({ embeds: [embed] });
}
