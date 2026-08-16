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

  // Must have exactly 1 or 2 opponents (for 2 or 3 player mode)
  if (!mentionedUsers || (mentionedUsers.size !== 1 && mentionedUsers.size !== 2)) {
    await message.reply('You must mention exactly 1 or 2 opponents to play Roulette Max (2 or 3 player mode).');
    return;
  }

  // Get the mentioned users
  const opponents = Array.from(mentionedUsers.values());
  if (opponents.length === 0) {
    await message.reply('Invalid opponents mentioned.');
    return;
  }

  // Reject bots
  for (const opponent of opponents) {
    if (opponent.bot) {
      await message.reply('Bots cannot participate in Roulette Max.');
      return;
    }
  }

  // Reject if any opponent is the same as author
  for (const opponent of opponents) {
    if (opponent.id === author.id) {
      await message.reply('You cannot play against yourself.');
      return;
    }
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
      id: opponents[0].id,
      name: opponents[0].displayName || opponents[0].username,
      avatar: opponents[0].displayAvatarURL({ size: 256 }) || opponents[0].defaultAvatarURL,
    };

    // Optional player 3 for 3-player mode
    let player3: RouletteMaxPlayer | undefined;
    if (opponents.length === 2) {
      player3 = {
        id: opponents[1].id,
        name: opponents[1].displayName || opponents[1].username,
        avatar: opponents[1].displayAvatarURL({ size: 256 }) || opponents[1].defaultAvatarURL,
      };
    }

    // Create cleanup callback
    const onGameEnd = () => {
      activeGames.delete(channelId);
    };

    // Create game instance (with or without player 3)
    const game = new RouletteMaxGame(
      channelId,
      guildId || undefined,
      player1,
      player2,
      player3,
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
