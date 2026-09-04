import { Message, MessageComponentInteraction } from 'discord.js';
import { Blackjack2Game } from '../blackjack/Blackjack2Game.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by user ID (both players map to the same game)
const activeGames = new Map<string, Blackjack2Game>();

/**
 * Handle the bj2 command
 */
export async function handleBj2Command(message: Message, args: string[]): Promise<void> {
  const userId = message.author.id;

  // Parse mentioned user
  if (args.length < 1) {
    await message.reply('Usage: `.bj2 @user <bet>`');
    return;
  }

  const mentionedUser = message.mentions.users.first();
  if (!mentionedUser) {
    await message.reply('Please mention a user to challenge.');
    return;
  }

  const opponentId = mentionedUser.id;

  // Parse bet amount
  if (args.length < 2) {
    await message.reply('Usage: `.bj2 @user <bet>`');
    return;
  }

  const betArg = args[1];
  const betAmount = parseInt(betArg, 10);

  if (isNaN(betAmount) || betAmount <= 0) {
    await message.reply('Invalid bet amount. Please enter a positive number.');
    return;
  }

  // Prevent self-challenge
  if (opponentId === userId) {
    await message.reply('You cannot challenge yourself!');
    return;
  }

  // Prevent bot challenge
  if (mentionedUser.bot) {
    await message.reply('You cannot challenge a bot!');
    return;
  }

  // Check if either player already has an active game
  if (activeGames.has(userId) || activeGames.has(opponentId)) {
    await message.reply('One of you already has an active Blackjack game in progress!');
    return;
  }

  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    const player1Name = message.author.username;
    const player2Name = mentionedUser.username;

    // Create new game instance
    const game = new Blackjack2Game(userId, opponentId, player1Name, player2Name, betAmount, channelId, guildId);
    
    // Store in active games for both players
    activeGames.set(userId, game);
    activeGames.set(opponentId, game);
    
    // Start the game
    await game.start(message);
    
    // Clean up when game is finished
    const checkInterval = setInterval(() => {
      if (game.isFinished()) {
        activeGames.delete(userId);
        activeGames.delete(opponentId);
        clearInterval(checkInterval);
      }
    }, 1000);
    
  } catch (error) {
    console.error('[Blackjack2 Command] Error:', error);
    await message.reply('An error occurred while starting 2-Player Blackjack. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'bj2 command');
  }
}

/**
 * Handle 2-player blackjack button interactions
 */
export async function handleBj2Interaction(interaction: MessageComponentInteraction): Promise<void> {
  const userId = interaction.user.id;
  const game = activeGames.get(userId);

  if (!game) {
    await interaction.reply({
      content: 'No active 2-Player Blackjack game found.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[Blackjack2 Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during 2-Player Blackjack.',
      ephemeral: true,
    });
  }
}
