import { Message, EmbedBuilder } from 'discord.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { createOrUpdateUser } from '../database/client.js';
import { config, isGameFloorChannel, isTalentAgencyChannel, isGoonEdgeChannel } from '../config/index.js';

export async function handleWalletCommand(message: Message, args: string[] = []): Promise<void> {
  // Check if command is used in game floor channel, talent agency channel, or goon/edge channel
  if (!isGameFloorChannel(message.channel.id) && !isTalentAgencyChannel(message.channel.id) && !isGoonEdgeChannel(message.channel.id)) {
    await message.reply(`This command can only be used in <#${config.gameFloorChannelIds[0]}>, <#${config.talentAgencyChannelId}>, or <#${config.goonEdgeChannelId}>.`);
    return;
  }
  let userId = message.author.id;
  let isOtherUser = false;

  // Check if a user mention is provided
  if (args.length > 0) {
    const userMention = args[0];
    const userIdMatch = userMention.match(/<@!?(\d+)>/);

    if (userIdMatch) {
      userId = userIdMatch[1];
      isOtherUser = true;
    }
  }

  // Get user's current balance (auto-creates user if doesn't exist)
  let coinInfo = await getCoinBalanceInfo(userId);

  // If user doesn't exist, create them with 0 balance
  if (!coinInfo) {
    coinInfo = await createOrUpdateUser(userId);
  }

  // Create wallet embed
  const walletEmbed = new EmbedBuilder()
    .setTitle(isOtherUser ? `<:moneybag:1545149026528268308> ${message.guild?.members.cache.get(userId)?.displayName || '<@' + userId + '>'}'S WALLET` : '<:moneybag:1545149026528268308> YOUR WALLET')
    .setDescription('Current Bombo Coin balance')
    .setColor(0x00BFFF)
    .addFields(
      { name: 'Balance', value: `${coinInfo.balance.toLocaleString('en-US')} <:bombocoin:1545139736312815840>`, inline: true }
    )
    .setFooter({ text: '💵 Bombo Coins are the currency of the realm.' });

  await message.reply({ embeds: [walletEmbed] });
}
