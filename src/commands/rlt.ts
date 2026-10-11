import { Message, MessageComponentInteraction, ModalSubmitInteraction } from 'discord.js';
import { RouletteGame, parseRouletteId } from '../roulette/RouletteGame.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { parseWagerAmount } from '../utils/wager-parser.js';
import { config, isGameFloorChannel } from '../config/index.js';
import { RouletteBet } from '../roulette/roulette-logic.js';
import { coins, nope } from '../utils/casino-ui.js';

// Open roulette tables keyed by user ID (one table per player)
const activeGames = new Map<string, RouletteGame>();

/** Find the table a button/modal belongs to by the game id inside its customId. */
function findGame(customId: string): RouletteGame | null {
  const parsed = parseRouletteId(customId);
  if (!parsed) return null;
  for (const game of activeGames.values()) {
    if (game.gameId === parsed.gameId) return game;
  }
  return null;
}

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

  const wager = parseWagerAmount(args[0], coinInfo.balance);

  // Validate wager is a valid positive number
  if (wager === null || isNaN(wager) || wager <= 0) {
    await message.reply(
      'Please specify a valid positive amount to bet.\n' +
      'Examples: `.rlt 500`, `.rlt 10k`, `.rlt 1.5m`, `.rlt all`'
    );
    return;
  }

  if (coinInfo.balance < wager) {
    await message.reply(
      `Not enough coins. You need ${coins(wager)} (you have ${coins(coinInfo.balance)}).\n` +
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

  // One table per player. A wheel that is really spinning blocks a new table;
  // anything else (an old picker, a finished result) is simply replaced.
  const existing = activeGames.get(userId);
  if (existing) {
    if (existing.isSpinning()) {
      await message.reply('Your wheel is still spinning, one sec!');
      return;
    }
    activeGames.delete(userId);
    await existing.close();
  }

  try {
    const game = new RouletteGame(
      userId,
      message.author.username,
      message.author.displayAvatarURL(),
      wager,
      message.channel.id,
      message.guild?.id,
      message.client,
      () => {
        // Only remove the entry if it still points at this game (a newer table may have replaced it)
        if (activeGames.get(userId) === game) {
          activeGames.delete(userId);
        }
      }
    );

    activeGames.set(userId, game);
    await game.start(message, exactNumberBet ?? undefined);
  } catch (error) {
    console.error('[Roulette Command] Error:', error);
    activeGames.delete(userId);
    await ErrorHandler.handleMessageError(message, error, 'rlt command');
  }
}

export async function handleRltInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const game = findGame(interaction.customId);

  if (!game) {
    await nope(interaction, 'This roulette table is closed. Start a new one with `.rlt`.');
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[Roulette Interaction] Error:', error);
    await ErrorHandler.handleInteractionError(interaction, error, 'roulette interaction');
  }
}

export async function handleRltModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const game = findGame(interaction.customId);

  if (!game) {
    await nope(interaction, 'This roulette table is closed. Start a new one with `.rlt`.');
    return;
  }

  try {
    await game.handleModalSubmit(interaction);
  } catch (error) {
    console.error('[Roulette Modal Submit] Error:', error);
    await ErrorHandler.handleInteractionError(interaction, error, 'roulette bet');
  }
}
