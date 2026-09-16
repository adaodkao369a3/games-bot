import { Message, MessageComponentInteraction, Client } from 'discord.js';
import { HigherLowerGame } from '../higherlower/HigherLowerGame.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { parseWagerAmount } from '../utils/wager-parser.js';

// Active games keyed by user ID
const activeGames = new Map<string, HigherLowerGame>();

/**
 * Handle the higherlower command
 */
export async function handleHigherLowerCommand(message: Message, args: string[], client: Client): Promise<void> {
  const userId = message.author.id;

  // Parse bet amount
  if (args.length < 1) {
    await message.reply(
      'Please specify an amount to bet. Usage: `.hlow [amount]`\n' +
      'Examples: `.hlow 500`, `.hlow 10k`, `.hlow 1.5m`, `.hlow all`'
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
      'Examples: `.hlow 500`, `.hlow 10k`, `.hlow 1.5m`, `.hlow all`'
    );
    return;
  }

  // Check if user already has an active game
  if (activeGames.has(userId)) {
    await message.reply('You already have an active Higher or Lower game in progress!');
    return;
  }

  if (coinInfo.balance < wager) {
    await message.reply(
      `You don't have enough Bombo Coins for this bet! You need ${wager.toLocaleString('en-US')} <:bombocoin:1545139736312815840>.\n` +
      `Your current balance: ${coinInfo.balance.toLocaleString('en-US')} <:bombocoin:1545139736312815840>\n` +
      `Tip: use \`.hlow all\` to bet your entire balance.`
    );
    return;
  }

  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    const username = message.author.username;

    // Create new game instance
    const game = new HigherLowerGame(userId, username, wager, channelId, guildId, client);
    
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
