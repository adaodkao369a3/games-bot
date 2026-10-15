import { Message, EmbedBuilder } from 'discord.js';
import { awardCoins } from '../services/coins.js';
import { createOrUpdateUser } from '../database/client.js';
import {
  HUSTLE_COOLDOWN_MS,
  HUSTLE_REWARD,
  claimTracking,
  loadTracking,
} from '../utils/hustle-gig.js';
import { config, isGameFloorChannel, isTalentAgencyChannel, isGoonEdgeChannel } from '../config/index.js';

const COIN = '<:bombocoin:1545139736312815840>';

const HUSTLE_FLAVOR_LINES = [
  '🤝 Bro shook hands with a producer and said nothing of value. Got paid anyway.',
  '📞 Cold-called a casting director. They picked up. Miracles happen.',
  '🗿 Locked in. The agency runs on delusion and business cards.',
  '😭 Another pitch meeting that could have been an email.',
  '📈 Questionable networking, profitable results.',
  '🫡 Bro clocked in for another shift at the agency.',
  '<:fire:1558430096807952384> That\'s not networking, that\'s a lifestyle.',
  '💼 Bro handed out 40 business cards and got 1 real lead. Respect.',
  '🥂 Free appetizers at an industry mixer. Contacts acquired.',
  '👁️ The industry has noticed your dedication.',
];

export async function handleHustleCommand(message: Message): Promise<void> {
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

  // Check cooldown
  if (t.last_hustle_used) {
    const timeSinceLastUse = now - t.last_hustle_used.getTime();
    if (timeSinceLastUse < HUSTLE_COOLDOWN_MS) {
      const remainingTime = Math.ceil((HUSTLE_COOLDOWN_MS - timeSinceLastUse) / 1000 / 60);
      const cooldownEmbed = new EmbedBuilder()
        .setTitle('<:alarm1:1545148991782518844> Cooldown Active')
        .setDescription(`You need to wait ${remainingTime} more minutes before hustling again.`)
        .setColor(0xFFA500);
      await message.reply({ embeds: [cooldownEmbed] });
      return;
    }
  }

  const after = {
    ...t,
    last_hustle_used: new Date(now),
  };

  // Atomic claim: if two .hustle messages race, only one gets through
  const claimed = await claimTracking(userId, t, after, ['last_hustle_used']);
  if (!claimed) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('<:warning:1558430107087933511> Slow Down')
      .setDescription('Easy there, one .hustle at a time!')
      .setColor(0xFFA500);
    await message.reply({ embeds: [errorEmbed] });
    return;
  }

  const awardResult = await awardCoins(userId, HUSTLE_REWARD, 'hustle', {
    reason: 'Hustle command reward',
    description: `Hustled and earned ${HUSTLE_REWARD} coins`,
    gameInstanceId: `hustle_${userId}_${now}`,
  });

  if (awardResult === null) {
    // Give the use back so a failed payout doesn't burn the cooldown
    await claimTracking(userId, after, t, ['last_hustle_used']).catch(() => undefined);
    const errorEmbed = new EmbedBuilder()
      .setTitle('<:cross:1558430092043096154> Error')
      .setDescription('Failed to award coins. Please try again later.')
      .setColor(0xFF0000);
    await message.reply({ embeds: [errorEmbed] });
    return;
  }

  // Pick random flavor line
  const flavorLine = HUSTLE_FLAVOR_LINES[Math.floor(Math.random() * HUSTLE_FLAVOR_LINES.length)];

  // Build fields for embed
  const fields = [
    { name: '<:moneybag:1545149026528268308> Reward', value: `+${HUSTLE_REWARD} ${COIN}`, inline: true },
  ];

  const successEmbed = new EmbedBuilder()
    .setTitle('🤝 Hustle Successful')
    .setDescription(flavorLine)
    .setColor(0x00FF00)
    .addFields(fields)
    .setFooter({ text: 'Keep networking!' });

  await message.reply({ embeds: [successEmbed] });
}
