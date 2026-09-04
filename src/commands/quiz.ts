import { Message, MessageComponentInteraction } from 'discord.js';
import { QuizGame } from '../titles/QuizGame.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by user ID
const activeGames = new Map<string, QuizGame>();

/**
 * Handle the quiz command
 */
export async function handleQuizCommand(message: Message, args: string[]): Promise<void> {
  const userId = message.author.id;

  // Parse category
  if (args.length < 1) {
    await message.reply('Usage: `.quiz <category>` (e.g., `.quiz jjk`)');
    return;
  }

  const category = args[0].toLowerCase();

  // Check if user already has an active quiz
  if (activeGames.has(userId)) {
    await message.reply('You already have an active quiz in progress!');
    return;
  }

  // Validate category
  if (category !== 'jjk') {
    await message.reply('Invalid category. Currently only `jjk` is supported.');
    return;
  }

  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    const username = message.author.username;
    const guild = message.guild;

    if (!guild) {
      await message.reply('This command can only be used in a server.');
      return;
    }

    // Create new game instance
    const game = new QuizGame(userId, username, category, channelId, guildId);
    
    // Store in active games
    activeGames.set(userId, game);
    
    // Start the game
    await game.start(message, guild);
    
    // Clean up when game is finished
    const checkInterval = setInterval(() => {
      if (game.isFinished()) {
        activeGames.delete(userId);
        clearInterval(checkInterval);
      }
    }, 1000);
    
  } catch (error) {
    console.error('[Quiz Command] Error:', error);
    await message.reply('An error occurred while starting the quiz. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'quiz command');
  }
}

/**
 * Handle quiz button interactions
 */
export async function handleQuizInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const userId = interaction.user.id;
  const game = activeGames.get(userId);

  if (!game) {
    await interaction.reply({
      content: 'No active quiz found.',
      ephemeral: true,
    });
    return;
  }

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }
    await game.handleInteraction(interaction, guild);
  } catch (error) {
    console.error('[Quiz Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during the quiz.',
      ephemeral: true,
    });
  }
}
