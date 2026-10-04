import { Message, MessageComponentInteraction, ModalSubmitInteraction } from 'discord.js';
import { RouletteGame } from '../roulette/RouletteGame.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { parseWagerAmount } from '../utils/wager-parser.js';
import { config, isGameFloorChannel } from '../config/index.js';
import { RouletteBet } from '../roulette/roulette-logic.js';

// Active games keyed by user ID
const activeGames = new Map<string, RouletteGame>();

export async function handleRltCommand(message: Message, args: string[]): Promise<void> {
  // Check if command is used in game floor channel
  if (!isGameFloorChannel(message.channel.id)) {
    await message.reply(`This command can only be used in <#${config.gameFloorChannelIds[0]}>.`);
    return;
  }

  const userId = message.author.id;

  // Parse bet amount
  if (args.length < 1) {
    await message.reply(
      'Please specify an amount to bet. Usage: `.rlt [amount]` or `.rlt [amount] [number]`\n' +
      'Examples: `.rlt 500`, `.rlt 10k`, `.rlt 1.5m`, `.rlt all`, `.rlt 500 17`'
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
      'Examples: `.rlt 500`, `.rlt 10k`, `.rlt 1.5m`, `.rlt all`'
    );
    return;
  }

  // Check if user already has an active game
  if (activeGames.has(userId)) {
    await message.reply('You already have an active Roulette game in progress!');
    return;
  }

  if (coinInfo.balance < wager) {
    await message.reply(
      `You don't have enough Bombo Coins for this bet! You need ${wager.toLocaleString('en-US')} <:bombocoin:1545139736312815840>.\n` +
      `Your current balance: ${coinInfo.balance.toLocaleString('en-US')} <:bombocoin:1545139736312815840>\n` +
      `Tip: use \`.rlt all\` to bet your entire balance.`
    );
    return;
  }

  // Check for exact number bet
  let exactNumberBet: RouletteBet | null = null;
  if (args.length >= 2) {
    const numberArg = args[1];
    
    // Validate number format
    if (!/^\d+$/.test(numberArg)) {
      await message.reply('Invalid number. Please use a number between 0 and 36 (e.g., `.rlt 500 17`).');
      return;
    }

    const number = parseInt(numberArg, 10);
    if (number < 0 || number > 36) {
      await message.reply('Number must be between 0 and 36 (inclusive).');
      return;
    }

    exactNumberBet = { kind: 'number', value: number };
  }

  // Extra args beyond number are not allowed
  if (args.length > 2) {
    await message.reply('Too many arguments. Usage: `.rlt [amount]` or `.rlt [amount] [number]`');
    return;
  }

  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    const username = message.author.username;
    const avatarUrl = message.author.displayAvatarURL();

    // Create new game instance
    const game = new RouletteGame(userId, username, avatarUrl, wager, channelId, guildId, message.client);
    
    // Store in active games
    activeGames.set(userId, game);
    
    // Start the game
    await game.start(message, exactNumberBet);
    
    // Clean up when game is finished
    const checkInterval = setInterval(() => {
      if (game.isFinished()) {
        activeGames.delete(userId);
        clearInterval(checkInterval);
      }
    }, 1000);
    
  } catch (error) {
    console.error('[Roulette Command] Error:', error);
    await message.reply('An error occurred while starting Roulette. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'rlt command');
  }
}

export async function handleRltInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const userId = interaction.user.id;
  const game = activeGames.get(userId);

  if (!game) {
    await interaction.reply({
      content: 'No active Roulette game found.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[Roulette Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during Roulette.',
      ephemeral: true,
    });
  }
}

export async function handleRltModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const userId = interaction.user.id;
  const game = activeGames.get(userId);

  if (!game) {
    await interaction.reply({
      content: 'No active Roulette game found.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleModalSubmit(interaction);
  } catch (error) {
    console.error('[Roulette Modal Submit] Error:', error);
    await interaction.reply({
      content: 'An error occurred processing your bet.',
      ephemeral: true,
    });
  }
}
