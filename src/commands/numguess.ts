import { Message, MessageComponentInteraction } from 'discord.js';
import { NumGuessGame } from '../numguess/NumGuessGame.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by channel ID
const activeGames = new Map<string, NumGuessGame>();

/**
 * Handle the numguess command
 */
export async function handleNumGuessCommand(message: Message): Promise<void> {
  const channelId = message.channel.id;

  // Check if game already exists in channel
  if (activeGames.has(channelId)) {
    await message.reply('There is already an active NumGuess game in this channel!');
    return;
  }

  try {
    const guildId = message.guild?.id;
    const hostId = message.author.id;

    // Create new game instance
    const game = new NumGuessGame(channelId, guildId, hostId);
    
    // Store in active games
    activeGames.set(channelId, game);
    
    // Start the game
    await game.start(message);
    
    // Clean up when game is finished
    const checkInterval = setInterval(() => {
      if (game.isFinished()) {
        activeGames.delete(channelId);
        clearInterval(checkInterval);
      }
    }, 1000);
    
  } catch (error) {
    console.error('[NumGuess Command] Error:', error);
    await message.reply('An error occurred while starting NumGuess. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'numguess command');
  }
}

/**
 * Handle numguess button interactions
 */
export async function handleNumGuessInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const game = activeGames.get(channelId);

  if (!game) {
    await interaction.reply({
      content: 'No active NumGuess game found.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[NumGuess Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during NumGuess.',
      ephemeral: true,
    });
  }
}

/**
 * Handle numguess message submissions (guesses)
 */
export async function handleNumGuessMessage(message: Message): Promise<void> {
  const channelId = message.channel.id;
  const game = activeGames.get(channelId);

  if (!game) {
    return;
  }

  try {
    await game.handleMessage(message);
  } catch (error) {
    console.error('[NumGuess Message] Error:', error);
  }
}
