import { Message, MessageComponentInteraction } from 'discord.js';
import { BombDefusalGame } from '../bomb/BombDefusalGame.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { parseWagerAmount } from '../utils/wager-parser.js';

// Active games keyed by user ID
const activeGames = new Map<string, BombDefusalGame>();

/**
 * Handle the bomb command
 */
export async function handleBombCommand(message: Message, args: string[]): Promise<void> {
  const userId = message.author.id;

  // Parse bet amount
  if (args.length < 1) {
    await message.reply(
      'Please specify an amount to bet. Usage: `.bomb [amount]`\n' +
      'Examples: `.bomb 500`, `.bomb 10k`, `.bomb 1.5m`, `.bomb all`'
    );
    return;
  }

  // Get user's current balance first, since "all"/"max" depend on it.
  const coinInfo = await getCoinBalanceInfo(userId);
  if (!coinInfo) {
    await message.reply('Unable to retrieve your Bombo Coin balance. Please try again later.');
    return;
  }

  const betArg = args[0];
  const betAmount = parseWagerAmount(betArg, coinInfo.balance);

  if (betAmount === null || isNaN(betAmount) || betAmount <= 0) {
    await message.reply(
      'Please specify a valid positive amount to bet.\n' +
      'Examples: `.bomb 500`, `.bomb 10k`, `.bomb 1.5m`, `.bomb all`'
    );
    return;
  }

  // Check if user already has an active game
  if (activeGames.has(userId)) {
    await message.reply('You already have an active Bomb Defusal game in progress!');
    return;
  }

  if (coinInfo.balance < betAmount) {
    await message.reply(
      `You don't have enough Bombo Coins for this bet! You need ${betAmount.toLocaleString('en-US')} <:bombocoin:1545139736312815840>.\n` +
      `Your current balance: ${coinInfo.balance.toLocaleString('en-US')} <:bombocoin:1545139736312815840>\n` +
      `Tip: use \`.bomb all\` to bet your entire balance.`
    );
    return;
  }

  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    const username = message.author.username;

    // Create new game instance
    const game = new BombDefusalGame(userId, username, betAmount, channelId, guildId);
    
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
    console.error('[Bomb Command] Error:', error);
    await message.reply('An error occurred while starting Bomb Defusal. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'bomb command');
  }
}

/**
 * Handle bomb button interactions
 */
export async function handleBombInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const userId = interaction.user.id;
  const game = activeGames.get(userId);

  if (!game) {
    await interaction.reply({
      content: 'No active Bomb Defusal game found.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[Bomb Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during Bomb Defusal.',
      ephemeral: true,
    });
  }
}
