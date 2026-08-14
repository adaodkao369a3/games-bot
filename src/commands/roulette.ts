import { Message, MessageComponentInteraction } from 'discord.js';
import { RussianRouletteGame, RoulettePlayer } from '../roulette/RussianRouletteGame.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games by channel ID
const activeGames = new Map<string, RussianRouletteGame>();

/**
 * Handle the roulette command
 */
export async function handleRouletteCommand(message: Message): Promise<void> {
  const channelId = message.channelId;
  const guildId = message.guildId;

  // Check if a game is already active in this channel
  if (activeGames.has(channelId)) {
    await message.reply('A Russian Roulette game is already in progress in this channel!');
    return;
  }

  // Parse mentioned users
  const mentionedUsers = message.mentions.users;
  const author = message.author;

  if (!mentionedUsers || mentionedUsers.size === 0) {
    await message.reply('Please mention at least one other user to play with.');
    return;
  }

  // Collect all participants
  const participants: RoulettePlayer[] = [];
  const userIds = new Set<string>();

  // Add author
  userIds.add(author.id);
  participants.push({
    id: author.id,
    name: author.displayName || author.username,
    avatar: author.displayAvatarURL({ size: 256 }) || author.defaultAvatarURL,
    isEliminated: false,
    hasUsedDoubleTurn: false,
  });

  // Add mentioned users
  for (const [_, user] of mentionedUsers) {
    // Reject bots
    if (user.bot) {
      await message.reply('Bots cannot participate in Russian Roulette.');
      return;
    }

    // Reject duplicates
    if (userIds.has(user.id)) {
      await message.reply('You cannot mention the same user twice.');
      return;
    }

    // Reject author being mentioned
    if (user.id === author.id) {
      continue; // Skip, author is already added
    }

    userIds.add(user.id);
    participants.push({
      id: user.id,
      name: user.displayName || user.username,
      avatar: user.displayAvatarURL({ size: 256 }) || user.defaultAvatarURL,
      isEliminated: false,
      hasUsedDoubleTurn: false,
    });
  }

  // Check minimum players
  if (participants.length < 2) {
    await message.reply('You need at least 2 players to play Russian Roulette.');
    return;
  }

  // Check maximum players
  if (participants.length > 10) {
    await message.reply('Maximum 10 players allowed for Russian Roulette.');
    return;
  }

  try {
    // Send initial message
    const initialMessage = await message.reply('🔫 Loading Russian Roulette...');

    // Create game instance
    const game = new RussianRouletteGame(
      channelId,
      guildId || undefined,
      participants
    );

    // Store game
    activeGames.set(channelId, game);

    // Start game
    await game.start(initialMessage);

    // Cleanup when game ends
    game.getState(); // This will be used to check game state
  } catch (error) {
    activeGames.delete(channelId);
    await ErrorHandler.handleMessageError(message, error, 'roulette command');
  }
}

/**
 * Handle roulette button interactions
 */
export async function handleRouletteInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const game = activeGames.get(channelId);

  if (!game) {
    await interaction.reply({
      content: 'No active Russian Roulette game in this channel.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);

    // Cleanup if game is finished
    if (game.isFinished()) {
      activeGames.delete(channelId);
    }
  } catch (error) {
    await ErrorHandler.handleInteractionError(interaction, error, 'roulette interaction');
  }
}
