import { Message, MessageComponentInteraction } from 'discord.js';
import { ImpostorGame } from '../impostor/ImpostorGame.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by channel ID
const activeGames = new Map<string, ImpostorGame>();

/**
 * Handle the impostor command
 */
export async function handleImpostorCommand(message: Message): Promise<void> {
  const channelId = message.channel.id;

  // Check if game already exists in channel
  if (activeGames.has(channelId)) {
    await message.reply('There is already an active Impostor game in this channel!');
    return;
  }

  try {
    const guildId = message.guild?.id;
    const hostId = message.author.id;

    // Create new game instance
    const game = new ImpostorGame(channelId, guildId, hostId);
    
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
    console.error('[Impostor Command] Error:', error);
    await message.reply('An error occurred while starting Impostor. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'impostor command');
  }
}

/**
 * Handle impostor button interactions
 */
export async function handleImpostorInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const game = activeGames.get(channelId);

  if (!game) {
    await interaction.reply({
      content: 'No active Impostor game found.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[Impostor Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during Impostor.',
      ephemeral: true,
    });
  }
}

/**
 * Handle impostor message submissions (clues)
 */
export async function handleImpostorMessage(message: Message): Promise<void> {
  const channelId = message.channel.id;
  const game = activeGames.get(channelId);

  if (!game) {
    return;
  }

  try {
    await game.handleMessage(message);
  } catch (error) {
    console.error('[Impostor Message] Error:', error);
  }
}
