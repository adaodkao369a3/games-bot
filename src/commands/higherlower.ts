import { Message, MessageComponentInteraction } from 'discord.js';
import { HigherLowerGame } from '../higherlower/HigherLowerGame.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by user ID
const activeGames = new Map<string, HigherLowerGame>();

/**
 * Handle the higherlower command
 */
export async function handleHigherLowerCommand(message: Message, args: string[]): Promise<void> {
  const userId = message.author.id;

  // Parse bet amount
  if (args.length < 1) {
    await message.reply('Usage: `.hlow <bet>`');
    return;
  }

  const betArg = args[0];
  const betAmount = parseInt(betArg, 10);

  if (isNaN(betAmount) || betAmount <= 0) {
    await message.reply('Invalid bet amount. Please enter a positive number.');
    return;
  }

  // Check if user already has an active game
  if (activeGames.has(userId)) {
    await message.reply('You already have an active Higher or Lower game in progress!');
    return;
  }

  // Check if user has enough coins
  const coinInfo = await getCoinBalanceInfo(userId);
  if (!coinInfo) {
    await message.reply('Unable to retrieve your Bombo Coin balance. Please try again later.');
    return;
  }

  if (coinInfo.balance < betAmount) {
    await message.reply(
      `You don't have enough Bombo Coins for this bet! You need ${betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>.\n` +
      `Your current balance: ${coinInfo.balance.toLocaleString('en-US')} <:cash:1545149005544165416>`
    );
    return;
  }

  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    const username = message.author.username;

    // Create new game instance
    const game = new HigherLowerGame(userId, username, betAmount, channelId, guildId);
    
    // Store in active games
    activeGames.set(userId, game);
    
    // Start the game
    await game.start(message);
    
    // Clean up when game is finished
    const checkInterval = setInterval(() => {
      if (game.isFinished()) {
        activeGames.delete(userId);
        clearInterval(checkInterval);
      }
    }, 1000);
    
  } catch (error) {
    console.error('[Higher Lower Command] Error:', error);
    await message.reply('An error occurred while starting Higher or Lower. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'higherlower command');
  }
}

/**
 * Handle higher lower button interactions
 */
export async function handleHigherLowerInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const userId = interaction.user.id;
  const game = activeGames.get(userId);

  if (!game) {
    await interaction.reply({
      content: 'No active Higher or Lower game found.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[Higher Lower Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during Higher or Lower.',
      ephemeral: true,
    });
  }
}
