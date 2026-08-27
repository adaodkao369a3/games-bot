import { Message, EmbedBuilder } from 'discord.js';
import { getResidualsInfo } from '../services/residuals.js';

export async function handleWalletCommand(message: Message): Promise<void> {
  const userId = message.author.id;

  // Get user's current balance
  const residualInfo = await getResidualsInfo(userId);
  if (!residualInfo) {
    await message.reply('Unable to retrieve your residual balance. Please try again later.');
    return;
  }

  // Create wallet embed
  const walletEmbed = new EmbedBuilder()
    .setTitle('💼 YOUR WALLET')
    .setDescription('Current residual balance')
    .setColor(0x00BFFF)
    .addFields(
      { name: 'Balance', value: `${residualInfo.balance.toLocaleString()} residuals`, inline: true },
      { name: 'Lifetime Earned', value: `${residualInfo.lifetime_earned.toLocaleString()} residuals`, inline: true },
      { name: 'Lifetime Spent', value: `${residualInfo.lifetime_spent.toLocaleString()} residuals`, inline: true }
    )
    .setFooter({ text: 'Residuals are the currency of the realm.' });

  await message.reply({ embeds: [walletEmbed] });
}
