import { Message, MessageComponentInteraction } from 'discord.js';
import { RouletteMaxGame, RouletteMaxPlayer } from '../roulette/RouletteMaxGame.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games by channel ID
const activeGames = new Map<string, RouletteMaxGame>();

/**
 * Handle the roulettemax command
 */
export async function handleRouletteMaxCommand(message: Message): Promise<void> {
  const channelId = message.channelId;
  const guildId = message.guildId;

  // Check if a game is already active in this channel
  if (activeGames.has(channelId)) {
    await message.reply('A Roulette Max game is already in progress in this channel!');
    return;
  }

  // Parse mentioned users
  const mentionedUsers = message.mentions.users;
  const author = message.author;

  // Must have exactly one opponent
  if (!mentionedUsers || mentionedUsers.size !== 1) {
    await message.reply('You must mention exactly one opponent to play Roulette Max.');
    return;
  }

  // Get the mentioned user
  const opponent = mentionedUsers.first();
  if (!opponent) {
    await message.reply('Invalid opponent mentioned.');
    return;
  }

  // Reject bots
  if (opponent.bot) {
    await message.reply('Bots cannot participate in Roulette Max.');
    return;
  }

  // Reject if opponent is the same as author
  if (opponent.id === author.id) {
    await message.reply('You cannot play against yourself.');
    return;
  }

  try {
    // Send initial message
    const initialMessage = await message.reply('🔫 Loading Roulette Max...');

    // Create players
    const player1: RouletteMaxPlayer = {
      id: author.id,
      name: author.displayName || author.username,
      avatar: author.displayAvatarURL({ size: 256 }) || author.defaultAvatarURL,
    };

    const player2: RouletteMaxPlayer = {
      id: opponent.id,
      name: opponent.displayName || opponent.username,
      avatar: opponent.displayAvatarURL({ size: 256 }) || opponent.defaultAvatarURL,
    };

    // Create cleanup callback
    const onGameEnd = () => {
      activeGames.delete(channelId);
    };

    // Create game instance
    const game = new RouletteMaxGame(
      channelId,
      guildId || undefined,
      player1,
      player2,
      onGameEnd
    );

    // Store game
    activeGames.set(channelId, game);

    // Start game
    await game.start(initialMessage);
  } catch (error) {
    activeGames.delete(channelId);
    await ErrorHandler.handleMessageError(message, error, 'roulettemax command');
  }
}

/**
 * Handle roulettemax button interactions
 */
export async function handleRouletteMaxInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const game = activeGames.get(channelId);

  if (!game) {
    await interaction.reply({
      content: 'No active Roulette Max game in this channel.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    await ErrorHandler.handleInteractionError(interaction, error, 'roulettemax interaction');
  }
}
