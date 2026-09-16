import { Message, MessageComponentInteraction } from 'discord.js';
import { BlackjackGame } from '../blackjack/BlackjackGame.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { parseWagerAmount } from '../utils/wager-parser.js';

// Active games keyed by user ID
const activeGames = new Map<string, BlackjackGame>();

/**
 * Handle the bj command
 */
export async function handleBjCommand(message: Message, args: string[]): Promise<void> {
  const userId = message.author.id;

  // Parse bet amount
  if (args.length < 1) {
    await message.reply(
      'Please specify an amount to bet. Usage: `.bj [amount]`\n' +
      'Examples: `.bj 500`, `.bj 10k`, `.bj 1.5m`, `.bj all`'
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
      'Examples: `.bj 500`, `.bj 10k`, `.bj 1.5m`, `.bj all`'
    );
    return;
  }

  // Check if user already has an active game
  if (activeGames.has(userId)) {
    await message.reply('You already have an active Blackjack game in progress!');
    return;
  }

  if (coinInfo.balance < wager) {
    await message.reply(
      `You don't have enough Bombo Coins for this bet! You need ${wager.toLocaleString('en-US')} <:bombocoin:1545139736312815840>.\n` +
      `Your current balance: ${coinInfo.balance.toLocaleString('en-US')} <:bombocoin:1545139736312815840>\n` +
      `Tip: use \`.bj all\` to bet your entire balance.`
    );
    return;
  }

  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    const username = message.author.username;

    // Create new game instance
    const game = new BlackjackGame(userId, username, wager, channelId, guildId);
    
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
    console.error('[Blackjack Command] Error:', error);
    await message.reply('An error occurred while starting Blackjack. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'bj command');
  }
}

/**
 * Handle blackjack button interactions
 */
export async function handleBjInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const userId = interaction.user.id;
  const game = activeGames.get(userId);

  if (!game) {
    await interaction.reply({
      content: 'No active Blackjack game found.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[Blackjack Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during Blackjack.',
      ephemeral: true,
    });
  }
}
