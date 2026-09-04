import { Message, EmbedBuilder } from 'discord.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { createOrUpdateUser } from '../database/client.js';

export async function handleWalletCommand(message: Message): Promise<void> {
  const userId = message.author.id;

  // Get user's current balance (auto-creates user if doesn't exist)
  let coinInfo = await getCoinBalanceInfo(userId);
  
  // If user doesn't exist, create them with 0 balance
  if (!coinInfo) {
    coinInfo = await createOrUpdateUser(userId);
  }

  // Create wallet embed
  const walletEmbed = new EmbedBuilder()
    .setTitle('<:cash:1545149005544165416> YOUR WALLET')
    .setDescription('Current Bombo Coin balance')
    .setColor(0x00BFFF)
    .addFields(
      { name: 'Balance', value: `${coinInfo.balance.toLocaleString('en-US')} <:cash:1545149005544165416>`, inline: true },
      { name: 'Lifetime Earned', value: `${coinInfo.lifetime_earned.toLocaleString('en-US')} <:cash:1545149005544165416>`, inline: true },
      { name: 'Lifetime Gambled', value: `${coinInfo.lifetime_gambled.toLocaleString('en-US')} <:cash:1545149005544165416>`, inline: true }
    )
    .setFooter({ text: '💵 Bombo Coins are the currency of the realm.' });

  await message.reply({ embeds: [walletEmbed] });
}
