import { Message, MessageComponentInteraction } from 'discord.js';
import { DiceDuelGame } from '../diceduel/DiceDuelGame.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by player IDs (both players map to the same game)
const activeGames = new Map<string, DiceDuelGame>();

/**
 * Handle the diceduel command
 */
export async function handleDiceDuelCommand(message: Message, args: string[]): Promise<void> {
  const userId = message.author.id;

  // Parse arguments
  if (args.length < 2) {
    await message.reply('Usage: `.diceduel @user bet_amount`');
    return;
  }

  // Extract mentioned user
  const mentionedUser = message.mentions.users.first();
  if (!mentionedUser) {
    await message.reply('You must mention a user to challenge.');
    return;
  }

  const opponentId = mentionedUser.id;

  // Validate opponent
  if (opponentId === userId) {
    await message.reply('You cannot challenge yourself!');
    return;
  }

  if (mentionedUser.bot) {
    await message.reply('You cannot challenge a bot!');
    return;
  }

  // Parse bet amount
  const betArg = args[1];
  const betAmount = parseInt(betArg, 10);

  if (isNaN(betAmount) || betAmount <= 0) {
    await message.reply('Invalid bet amount. Please enter a positive number.');
    return;
  }

  // Check if either player already has an active game
  if (activeGames.has(userId) || activeGames.has(opponentId)) {
    await message.reply('One of the players already has an active dice duel in progress!');
    return;
  }

  // Check if challenger has enough coins
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

    // Get player names
    const player1Name = message.author.username;
    const player2Name = mentionedUser.username;

    // Create new game instance
    const game = new DiceDuelGame(userId, opponentId, betAmount, channelId, guildId, player1Name, player2Name);
    
    // Store in active games for both players
    activeGames.set(userId, game);
    activeGames.set(opponentId, game);
    
    // Start the game
    await game.start(message);
    
    // Clean up when game is finished
    const checkInterval = setInterval(() => {
      if (game.isFinished()) {
        activeGames.delete(userId);
        activeGames.delete(opponentId);
        clearInterval(checkInterval);
      }
    }, 1000);
    
  } catch (error) {
    console.error('[Dice Duel Command] Error:', error);
    await message.reply('An error occurred while starting the dice duel. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'diceduel command');
  }
}

/**
 * Handle dice duel button interactions
 */
export async function handleDiceDuelInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const userId = interaction.user.id;
  const game = activeGames.get(userId);

  if (!game) {
    await interaction.reply({
      content: 'No active dice duel found.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[Dice Duel Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during the dice duel.',
      ephemeral: true,
    });
  }
}
