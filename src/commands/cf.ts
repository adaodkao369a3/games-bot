import { Message, MessageComponentInteraction } from 'discord.js';
import { CoinFlipGame } from '../coinflip/CoinFlipGame.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { parseWagerAmount } from '../utils/wager-parser.js';

// Active games keyed by user ID
const activeGames = new Map<string, CoinFlipGame>();

/**
 * Handle the cf command
 */
export async function handleCfCommand(message: Message, args: string[]): Promise<void> {
  const userId = message.author.id;

  // Parse bet amount
  if (args.length < 1) {
    await message.reply(
      'Please specify an amount to bet. Usage: `.cf [amount]`\n' +
      'Examples: `.cf 500`, `.cf 10k`, `.cf 1.5m`, `.cf all`'
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
  const wager = parseWagerAmount(betArg, coinInfo.balance);

  // Validate wager is a valid positive number
  if (wager === null || isNaN(wager) || wager <= 0) {
    await message.reply(
      'Please specify a valid positive amount to bet.\n' +
      'Examples: `.cf 500`, `.cf 10k`, `.cf 1.5m`, `.cf all`'
    );
    return;
  }

  // Check if user already has an active game
  if (activeGames.has(userId)) {
    await message.reply('You already have an active Coin Flip game in progress!');
    return;
  }

  if (coinInfo.balance < wager) {
    await message.reply(
      `You don't have enough Bombo Coins for this bet! You need ${wager.toLocaleString('en-US')} <:cash:1545149005544165416>.\n` +
      `Your current balance: ${coinInfo.balance.toLocaleString('en-US')} <:cash:1545149005544165416>\n` +
      `Tip: use \`.cf all\` to bet your entire balance.`
    );
    return;
  }

  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    const username = message.author.username;

    // Create new game instance
    const game = new CoinFlipGame(userId, username, wager, channelId, guildId);
    
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
    console.error('[Coin Flip Command] Error:', error);
    await message.reply('An error occurred while starting Coin Flip. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'cf command');
  }
}

/**
 * Handle coin flip button interactions
 */
export async function handleCfInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const userId = interaction.user.id;
  const game = activeGames.get(userId);

  if (!game) {
    await interaction.reply({
      content: 'No active Coin Flip game found.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[Coin Flip Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during Coin Flip.',
      ephemeral: true,
    });
  }
}
