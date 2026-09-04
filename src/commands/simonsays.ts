import { Message, MessageComponentInteraction } from 'discord.js';
import { SimonSaysGame } from '../simonsays/SimonSaysGame.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by channel ID
const activeGames = new Map<string, SimonSaysGame>();

/**
 * Handle the simonsays command
 */
export async function handleSimonSaysCommand(message: Message): Promise<void> {
  const channelId = message.channel.id;

  // Check if game already exists in channel
  if (activeGames.has(channelId)) {
    await message.reply('There is already an active Simon Says game in this channel!');
    return;
  }

  try {
    const guildId = message.guild?.id;
    const hostId = message.author.id;

    // Create new game instance
    const game = new SimonSaysGame(channelId, guildId, hostId);
    
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
    console.error('[SimonSays Command] Error:', error);
    await message.reply('An error occurred while starting Simon Says. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'simonsays command');
  }
}

/**
 * Handle simonsays button interactions
 */
export async function handleSimonSaysInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const game = activeGames.get(channelId);

  if (!game) {
    await interaction.reply({
      content: 'No active Simon Says game found.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[SimonSays Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during Simon Says.',
      ephemeral: true,
    });
  }
}
