import { Message, MessageComponentInteraction } from 'discord.js';
import { FishingGame } from '../fishing/FishingGame.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by user ID
const activeGames = new Map<string, FishingGame>();

/**
 * Handle the fish command
 */
export async function handleFishCommand(message: Message): Promise<void> {
  const userId = message.author.id;

  // Check if user already has an active fishing session
  if (activeGames.has(userId)) {
    await message.reply({
      content: 'You already have a fishing session in progress!',
    });
    return;
  }

  // Check if user has enough coins
  const coinInfo = await getCoinBalanceInfo(userId);
  if (!coinInfo) {
    await message.reply('Unable to retrieve your Bombo Coin balance. Please try again later.');
    return;
  }

  const ENTRY_FEE = 500;
  if (coinInfo.balance < ENTRY_FEE) {
    await message.reply(
      `You don't have enough Bombo Coins to go fishing! You need ${ENTRY_FEE.toLocaleString('en-US')} <:cash:1545149005544165416>.\n` +
      `Your current balance: ${coinInfo.balance.toLocaleString('en-US')} <:cash:1545149005544165416>`
    );
    return;
  }

  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;

    // Create new game instance
    const game = new FishingGame(userId, channelId, guildId);
    
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
    console.error('[Fish Command] Error:', error);
    await message.reply('An error occurred while starting fishing. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'fish command');
  }
}

/**
 * Handle fishing button interactions
 */
export async function handleFishInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const userId = interaction.user.id;
  const game = activeGames.get(userId);

  if (!game) {
    await interaction.reply({
      content: 'No active fishing session found.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[Fish Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during fishing.',
      ephemeral: true,
    });
  }
}
