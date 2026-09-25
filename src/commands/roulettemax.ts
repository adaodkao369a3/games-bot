import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { RouletteMaxGame, RouletteMaxPlayer } from '../roulette/RouletteMaxGame.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games by channel ID
const activeGames = new Map<string, RouletteMaxGame>();
// Pending challenges by channel ID
const pendingChallenges = new Map<string, { challenger: string, opponents: string[], player1: RouletteMaxPlayer, player2: RouletteMaxPlayer, player3?: RouletteMaxPlayer, timeout: NodeJS.Timeout }>();

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

  // Check if there's a pending challenge
  if (pendingChallenges.has(channelId)) {
    await message.reply('There is already a pending challenge in this channel. Wait for it to be accepted or declined.');
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

    // Create challenge message with accept/decline buttons
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('roulettemax_accept')
          .setLabel('✅ ACCEPT')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('roulettemax_decline')
          .setLabel('❌ DECLINE')
          .setStyle(ButtonStyle.Danger)
      );

    const opponentList = opponents.map(op => `<@${op.id}>`).join('\n');
    const challengeMessage = await message.reply({
      content: `<:gunpoint:1545149018160631868> **ROULETTE MAX CHALLENGE**\n\n<@${author.id}> has challenged:\n${opponentList}\n\nDo you accept the challenge?`,
      components: [row]
    });

    // Store pending challenge with 2-minute timeout
    const timeout = setTimeout(() => {
      if (pendingChallenges.has(channelId)) {
        pendingChallenges.delete(channelId);
        challengeMessage.edit({
          content: '⏰ The challenge has expired.',
          components: []
        }).catch(() => {});
      }
    }, 2 * 60 * 1000); // 2 minutes

    pendingChallenges.set(channelId, {
      challenger: author.id,
      opponents: opponents.map(op => op.id),
      player1,
      player2,
      player3,
      timeout
    });
  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'roulettemax command');
  }
}

/**
 * Handle roulettemax button interactions
 */
export async function handleRouletteMaxInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const customId = interaction.customId;

  // Handle challenge acceptance/decline
  if (customId === 'roulettemax_accept' || customId === 'roulettemax_decline') {
    const pendingChallenge = pendingChallenges.get(channelId);
    
    if (!pendingChallenge) {
      await interaction.reply({
        content: 'No pending challenge found.',
        ephemeral: true,
      });
      return;
    }

    // All opponents must accept
    if (!pendingChallenge.opponents.includes(interaction.user.id)) {
      await interaction.reply({
        content: 'Only the challenged opponents can accept or decline this challenge.',
        ephemeral: true,
      });
      return;
    }

    // Clear the timeout
    clearTimeout(pendingChallenge.timeout);
    pendingChallenges.delete(channelId);

    if (customId === 'roulettemax_decline') {
      await interaction.update({
        content: '❌ The challenge has been declined.',
        components: []
      });
      return;
    }

    // Accept the challenge
    try {
      await interaction.update({
        content: '✅ Challenge accepted! Starting game...',
        components: []
      });

      // Create cleanup callback
      const onGameEnd = () => {
        activeGames.delete(channelId);
      };

      // Create game instance (with or without player 3)
      const game = new RouletteMaxGame(
        channelId,
        interaction.guildId || undefined,
        pendingChallenge.player1,
        pendingChallenge.player2,
        pendingChallenge.player3,
        onGameEnd
      );

      // Store game
      activeGames.set(channelId, game);

      // Start game
      await game.start(interaction.message);
    } catch (error) {
      await ErrorHandler.handleInteractionError(interaction, error, 'roulettemax accept');
    }
    return;
  }

  // Handle game interactions
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
