import { Message, MessageComponentInteraction } from 'discord.js';
import { TitleDuelGame } from '../titles/TitleDuelGame.js';
import { TitleSystem } from '../titles/TitleSystem.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by challenger ID
const activeGames = new Map<string, TitleDuelGame>();

/**
 * Handle the challenge command
 */
export async function handleChallengeCommand(message: Message, args: string[]): Promise<void> {
  const challengerId = message.author.id;

  // Parse mentioned user
  if (args.length < 1) {
    await message.reply('Usage: `.challenge @user <category>` (e.g., `.challenge @user jjk`)');
    return;
  }

  const mentionedUser = message.mentions.users.first();
  if (!mentionedUser) {
    await message.reply('Please mention a user to challenge.');
    return;
  }

  const holderId = mentionedUser.id;

  // Parse category
  if (args.length < 2) {
    await message.reply('Usage: `.challenge @user <category>` (e.g., `.challenge @user jjk`)');
    return;
  }

  const category = args[1].toLowerCase();

  // Validate category
  if (category !== 'jjk') {
    await message.reply('Invalid category. Currently only `jjk` is supported.');
    return;
  }

  // Prevent self-challenge
  if (holderId === challengerId) {
    await message.reply('You cannot challenge yourself!');
    return;
  }

  // Check if challenger already holds the title
  if (await TitleSystem.userHoldsTitle(category, challengerId)) {
    await message.reply('You already hold this title!');
    return;
  }

  // Check if holder actually holds the title
  if (!(await TitleSystem.userHoldsTitle(category, holderId))) {
    await message.reply('That user does not hold this title.');
    return;
  }

  // Check if challenger already has an active challenge
  if (activeGames.has(challengerId)) {
    await message.reply('You already have an active title challenge in progress!');
    return;
  }

  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    const challengerName = message.author.username;
    const holderName = mentionedUser.username;

    // Create new game instance
    const game = new TitleDuelGame(challengerId, challengerName, holderId, holderName, category, channelId, guildId);
    
    // Store in active games
    activeGames.set(challengerId, game);
    
    // Start the game
    await game.start(message);
    
    // Clean up when game is finished
    const checkInterval = setInterval(() => {
      if (game.isFinished()) {
        activeGames.delete(challengerId);
        clearInterval(checkInterval);
      }
    }, 1000);
    
  } catch (error) {
    console.error('[Challenge Command] Error:', error);
    await message.reply('An error occurred while starting the challenge. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'challenge command');
  }
}

/**
 * Handle challenge button interactions
 */
export async function handleChallengeInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const userId = interaction.user.id;
  
  // Find the game where this user is either challenger or holder
  let game: TitleDuelGame | null = null;
  for (const g of activeGames.values()) {
    if (g.isParticipant(userId)) {
      game = g;
      break;
    }
  }

  if (!game) {
    await interaction.reply({
      content: 'No active title challenge found.',
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
    console.error('[Challenge Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during the challenge.',
      ephemeral: true,
    });
  }
}
