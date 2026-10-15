import { Message, EmbedBuilder } from 'discord.js';
import { awardCoins } from '../services/coins.js';
import { createOrUpdateUser } from '../database/client.js';
import {
  GIG_COOLDOWN_MS,
  GIG_REWARD,
  GIG_REWARD_REDUCED,
  GIG_DAILY_FREE_USES,
  centralDateString,
  claimTracking,
  loadTracking,
} from '../utils/hustle-gig.js';
import { config, isGameFloorChannel, isTalentAgencyChannel, isGoonEdgeChannel } from '../config/index.js';

const COIN = '<:bombocoin:1545139736312815840>';

const GIG_FLAVOR_LINES = [
  '🎬 Last-minute booking. Talent showed up, check cleared.',
  '⚡ Quick money, questionable client.',
  '💸 Financially responsible. Spiritually committed.',
  '📸 Your agency booked a gig that "pays in exposure." Also in coins, thankfully.',
  '🗿 Another gig down. The agency never sleeps.',
  '😭 The client wanted "one small change" 14 times. Still paid.',
  '🫡 Bro said yes to a gig with zero details. Bold.',
  '📉 Dignity: down. Bombo Coins: up.',
  '<:fire:1558430096807952384> Bro hit the emergency booking button.',
  '<:trophy:1545135066148118628> Gig completed. The industry is proud.',
];

const GIG_LIMIT_FLAVOR = '💸 Bro used up the premium gig package.';

export async function handleGigCommand(message: Message): Promise<void> {
  // Check if command is used in game floor channel, talent agency channel, or goon/edge channel
  if (!isGameFloorChannel(message.channel.id) && !isTalentAgencyChannel(message.channel.id) && !isGoonEdgeChannel(message.channel.id)) {
    const allChannels = [...config.gameFloorChannelIds, ...config.talentAgencyChannelIds, ...config.goonEdgeChannelIds];
    const errorEmbed = new EmbedBuilder()
      .setTitle('<:cross:1558430092043096154> Wrong Channel')
      .setDescription(`This command can only be used in ${allChannels.map(id => `<#${id}>`).join(', ')}.`)
      .setColor(0xFF0000);
    await message.reply({ embeds: [errorEmbed] });
    return;
  }

  const userId = message.author.id;

  // Ensure user exists
  await createOrUpdateUser(userId);

  const t = await loadTracking(userId);
  const now = Date.now();
  const today = centralDateString(now);

  // Check cooldown
  if (t.last_gig_used) {
    const timeSinceLastUse = now - t.last_gig_used.getTime();
    if (timeSinceLastUse < GIG_COOLDOWN_MS) {
      const remainingTime = Math.ceil((GIG_COOLDOWN_MS - timeSinceLastUse) / 1000 / 60);
      const cooldownEmbed = new EmbedBuilder()
        .setTitle('<a:alarm1:1545148991782518844> Cooldown Active')
        .setDescription(`You need to wait ${remainingTime} more minutes before booking another gig.`)
        .setColor(0xFFA500);
      await message.reply({ embeds: [cooldownEmbed] });
      return;
    }
  }

  // Daily resets
  let dailyGigCount = t.gig_daily_date === today ? t.gig_daily_count : 0;
  dailyGigCount++;
  const isOverLimit = dailyGigCount > GIG_DAILY_FREE_USES;
  const reward = isOverLimit ? GIG_REWARD_REDUCED : GIG_REWARD;

  const after = {
    ...t,
    last_gig_used: new Date(now),
    gig_daily_count: dailyGigCount,
    gig_daily_date: today,
  };

  // Atomic claim: if two .gig messages race, only one gets through
  const claimed = await claimTracking(userId, t, after, ['last_gig_used', 'gig_daily_count']);
  if (!claimed) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('<:warning:1558430107087933511> Slow Down')
      .setDescription('Easy there, one .gig at a time!')
      .setColor(0xFFA500);
    await message.reply({ embeds: [errorEmbed] });
    return;
  }

  const awardResult = await awardCoins(userId, reward, 'gig', {
    reason: 'Gig command reward',
    description: `Booked a gig and earned ${reward} coins`,
    gameInstanceId: `gig_${userId}_${now}`,
  });

  if (awardResult === null) {
    // Give the use back so a failed payout doesn't burn the cooldown
    await claimTracking(userId, after, t, ['last_gig_used']).catch(() => undefined);
    const errorEmbed = new EmbedBuilder()
      .setTitle('<:cross:1558430092043096154> Error')
      .setDescription('Failed to award coins. Please try again later.')
      .setColor(0xFF0000);
    await message.reply({ embeds: [errorEmbed] });
    return;
  }

  // Pick flavor line based on state
  let flavorLine;
  if (isOverLimit) {
    flavorLine = GIG_LIMIT_FLAVOR;
  } else {
    flavorLine = GIG_FLAVOR_LINES[Math.floor(Math.random() * GIG_FLAVOR_LINES.length)];
  }

  // Build fields for embed
  const fields = [
    { name: '<:moneybag:1545149026528268308> Reward', value: `+${reward} ${COIN}`, inline: true },
    { name: '🎬 Gig Count', value: `${dailyGigCount}${dailyGigCount <= GIG_DAILY_FREE_USES ? `/${GIG_DAILY_FREE_USES}` : '+'} today`, inline: true },
  ];

  const successEmbed = new EmbedBuilder()
    .setTitle('🎬 Gig Successful')
    .setDescription(flavorLine)
    .setColor(0xFF69B4)
    .addFields(fields)
    .setFooter({ text: isOverLimit ? 'Reduced rewards (daily limit exceeded)' : 'Free gigs remaining today' });

  await message.reply({ embeds: [successEmbed] });
}
