import { Message, MessageComponentInteraction } from 'discord.js';
import { WordBombGame } from '../wordbomb/WordBombGame.js';
import { DatamuseWordProvider } from '../wordle/datamuseProvider.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by channel ID
const activeGames = new Map<string, WordBombGame>();

// Word provider instance (shared across all games)
const wordProvider = new DatamuseWordProvider();

/**
 * Handle the wordbomb command
 */
export async function handleWordBombCommand(message: Message): Promise<void> {
  const channelId = message.channel.id;
  const guildId = message.guild?.id;

  // Check if a game is already running in this channel
  if (activeGames.has(channelId)) {
    await message.reply('A Word Bomb game is already running in this channel!');
    return;
  }

  if (!message.guild) {
    await message.reply('Word Bomb can only be played in a server.');
    return;
  }

  try {
    // Create new game instance
    const game = new WordBombGame(channelId, guildId, wordProvider);
    
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
    console.error('[Word Bomb Command] Error:', error);
    await message.reply('An error occurred while starting Word Bomb. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'wordbomb command');
  }
}

/**
 * Handle wordbomb button interactions
 */
export async function handleWordBombInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const game = activeGames.get(channelId);

  if (!game) {
    await interaction.reply({
      content: 'No active Word Bomb game found.',
      ephemeral: true,
    });
    return;
  }

  try {
    const customId = interaction.customId;

    if (customId === 'wordbomb_join') {
      const success = await game.handleJoin(interaction.user.id);
      if (success) {
        await interaction.reply({
          content: 'You joined the game!',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: 'Failed to join. You may have already joined.',
          ephemeral: true,
        });
      }
    } else {
      await interaction.reply({
        content: 'Unknown action.',
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('[Word Bomb Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during Word Bomb.',
      ephemeral: true,
    });
  }
}

/**
 * Handle word submissions during wordbomb game
 */
export async function handleWordBombMessage(message: Message): Promise<void> {
  const channelId = message.channel.id;
  const game = activeGames.get(channelId);

  if (!game) return;

  try {
    await game.handleWordSubmission(message.author.id, message.content);
  } catch (error) {
    console.error('[Word Bomb Message] Error:', error);
  }
}
