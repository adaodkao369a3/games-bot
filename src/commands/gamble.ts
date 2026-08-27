import { Message, EmbedBuilder } from 'discord.js';
import { getResidualsInfo, removeResiduals, awardResiduals } from '../services/residuals.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Track active gambles by user ID to prevent simultaneous gambles
const activeGambles = new Map<string, boolean>();

export async function handleGambleCommand(message: Message, args: string[]): Promise<void> {
  const userId = message.author.id;

  // Check if user already has an active gamble
  if (activeGambles.has(userId)) {
    await message.reply('You already have a gamble in progress! Wait for the result before gambling again.');
    return;
  }

  // Parse wager amount
  if (args.length === 0) {
    await message.reply('Please specify an amount to gamble. Usage: `,gamble [amount]`');
    return;
  }

  const wagerArg = args[0];
  const wager = parseInt(wagerArg, 10);

  // Validate wager is a valid positive number
  if (isNaN(wager) || wager <= 0) {
    await message.reply('Please specify a valid positive number of residuals to gamble.');
    return;
  }

  // Get user's current balance
  const residualInfo = await getResidualsInfo(userId);
  if (!residualInfo) {
    await message.reply('Unable to retrieve your residual balance. Please try again later.');
    return;
  }

  // Check if user has enough residuals
  if (residualInfo.balance < wager) {
    await message.reply(`You don't have enough residuals! Your current balance: ${residualInfo.balance.toLocaleString()} residuals.`);
    return;
  }

  // Mark user as having an active gamble
  activeGambles.set(userId, true);

  try {
    // Create loading embed
    const loadingEmbed = new EmbedBuilder()
      .setTitle('🎰 BOB\'S GAMBLE')
      .setDescription('Putting your residuals on the line...')
      .setColor(0xFFD700)
      .addFields(
        { name: 'Wager', value: `${wager.toLocaleString()} residuals`, inline: true }
      )
      .setFooter({ text: '🔴 ⚫ 🔴 ⚫ 🔴' });

    // Send initial loading message
    const initialMessage = await message.reply({ embeds: [loadingEmbed] });

    // Deduct wager amount atomically
    const deductionResult = await removeResiduals(
      userId,
      wager,
      'gamble',
      {
        reason: 'Wager deducted for gamble',
        description: `Gamble wager: ${wager} residuals`
      }
    );

    if (!deductionResult) {
      activeGambles.delete(userId);
      await initialMessage.edit('Failed to process your wager. Please try again.');
      return;
    }

    // Wait for suspense (2-3 seconds)
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Determine result (50/50)
    const won = Math.random() < 0.5;

    // Create result embed
    const resultEmbed = new EmbedBuilder()
      .setTitle('🎰 BOB\'S GAMBLE');

    if (won) {
      // WIN: Award 2x wager (user already lost wager, so add 2x to get net +wager)
      const payout = wager * 2;
      const awardResult = await awardResiduals(
        userId,
        payout,
        'gamble',
        {
          reason: 'Gamble winnings',
          description: `Gamble win: ${payout} residuals (wager: ${wager})`
        }
      );

      if (!awardResult) {
        activeGambles.delete(userId);
        await initialMessage.edit('Failed to process your winnings. Please contact support.');
        return;
      }

      resultEmbed
        .setDescription('💰 THE MACHINE LIKES YOU.')
        .setColor(0x00FF00)
        .addFields(
          { name: 'You bet', value: `${wager.toLocaleString()} residuals`, inline: true },
          { name: 'Payout', value: `${payout.toLocaleString()} residuals`, inline: true },
          { name: '✨ Profit', value: `+${wager.toLocaleString()} residuals`, inline: true }
        )
        .setFooter({ text: 'Bob has temporarily approved your financial decisions.' });
    } else {
      // LOSE: User gets nothing back (wager already deducted)
      resultEmbed
        .setDescription('💀 THE MACHINE HAS SPOKEN.')
        .setColor(0xFF0000)
        .addFields(
          { name: 'You bet', value: `${wager.toLocaleString()} residuals`, inline: true },
          { name: 'Payout', value: '0 residuals', inline: true },
          { name: '📉 Loss', value: `-${wager.toLocaleString()} residuals`, inline: true }
        )
        .setFooter({ text: 'Bob recommends pretending this never happened.' });
    }

    // Edit message with result
    await initialMessage.edit({ embeds: [resultEmbed] });

  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'gamble command');
  } finally {
    // Remove user from active gambles
    activeGambles.delete(userId);
  }
}
