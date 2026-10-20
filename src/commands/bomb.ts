import { Message, MessageComponentInteraction } from 'discord.js';
import { BombDefusalGame } from '../bomb/BombDefusalGame.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { parseWagerAmount } from '../utils/wager-parser.js';
import { config, isGameFloorChannel } from '../config/index.js';
import { coins } from '../utils/casino-ui.js';

// Active games keyed by user ID
const activeGames = new Map<string, BombDefusalGame>();

/**
 * Handle the bomb command
 */
export async function handleBombCommand(message: Message, args: string[]): Promise<void> {
  // Check if command is used in game floor channel
  if (!isGameFloorChannel(message.channel.id)) {
    await message.reply(`This command can only be used in <#${config.gameFloorChannelIds[0]}>.`);
    return;
  }

  const userId = message.author.id;

  // Parse bet amount
  if (args.length < 1) {
    await message.reply('Usage: `.bomb <amount>`  e.g. `.bomb 500`, `.bomb 10k`, `.bomb all`');
    return;
  }

  // Get user's current balance first, since "all"/"max" depend on it.
  const coinInfo = await getCoinBalanceInfo(userId);
  if (!coinInfo) {
    await message.reply('Could not check your balance. Try again.');
    return;
  }

  const betArg = args[0];
  const betAmount = parseWagerAmount(betArg, coinInfo.balance);

  if (betAmount === null || isNaN(betAmount) || betAmount <= 0) {
    await message.reply('That bet is not valid. Try `.bomb 500`, `.bomb 10k` or `.bomb all`.');
    return;
  }

  // Check if user already has an active game
  if (activeGames.has(userId)) {
    await message.reply('You already have a bomb game running.');
    return;
  }

  if (coinInfo.balance < betAmount) {
    await message.reply(`Not enough coins. You have ${coins(coinInfo.balance)}.`);
    return;
  }

  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    const username = message.author.username;
    const avatarUrl = message.author.displayAvatarURL();

    // Create new game instance
    const game = new BombDefusalGame(userId, username, avatarUrl, betAmount, channelId, guildId);
    
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
    await message.reply('Could not start the game. Try again.');
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
      content: 'No bomb game running.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[Bomb Interaction] Error:', error);
    await interaction.reply({
      content: 'Something went wrong.',
      ephemeral: true,
    });
  }
}
