import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { RussianRouletteGame, RoulettePlayer } from '../roulette/RussianRouletteGame.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games by channel ID
const activeGames = new Map<string, RussianRouletteGame>();
// Pending challenges by channel ID
const pendingChallenges = new Map<string, { challenger: string, participants: RoulettePlayer[], timeout: NodeJS.Timeout }>();

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

  // Check if there's a pending challenge
  if (pendingChallenges.has(channelId)) {
    await message.reply('There is already a pending challenge in this channel. Wait for it to be accepted or declined.');
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
    // Create challenge message with accept/decline buttons
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('roulette_accept')
          .setLabel('✅ ACCEPT')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('roulette_decline')
          .setLabel('❌ DECLINE')
          .setStyle(ButtonStyle.Danger)
      );

    const playerList = participants.map(p => `<@${p.id}>`).join('\n');
    const challengeMessage = await message.reply({
      content: `<:gunpoint:1545149018160631868> **RUSSIAN ROULETTE CHALLENGE**\n\n<@${author.id}> has challenged:\n${playerList}\n\nDo you accept the challenge?`,
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
      participants,
      timeout
    });
  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'roulette command');
  }
}

/**
 * Handle roulette button interactions
 */
export async function handleRouletteInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const customId = interaction.customId;

  // Handle challenge acceptance/decline
  if (customId === 'roulette_accept' || customId === 'roulette_decline') {
    const pendingChallenge = pendingChallenges.get(channelId);
    
    if (!pendingChallenge) {
      await interaction.reply({
        content: 'No pending challenge found.',
        ephemeral: true,
      });
      return;
    }

    // Only the challenger can accept/decline
    if (interaction.user.id !== pendingChallenge.challenger) {
      await interaction.reply({
        content: 'Only the challenger can accept or decline this challenge.',
        ephemeral: true,
      });
      return;
    }

    // Clear the timeout
    clearTimeout(pendingChallenge.timeout);
    pendingChallenges.delete(channelId);

    if (customId === 'roulette_decline') {
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

      // Create game instance
      const game = new RussianRouletteGame(
        channelId,
        interaction.guildId || undefined,
        pendingChallenge.participants,
        onGameEnd
      );

      // Store game
      activeGames.set(channelId, game);

      // Start game
      await game.start(interaction.message);
    } catch (error) {
      await ErrorHandler.handleInteractionError(interaction, error, 'roulette accept');
    }
    return;
  }

  // Handle game interactions
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
  } catch (error) {
    await ErrorHandler.handleInteractionError(interaction, error, 'roulette interaction');
  }
}
