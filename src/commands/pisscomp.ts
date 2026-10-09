import { Message, MessageComponentInteraction } from 'discord.js';
import { PissCompGame } from '../pisscomp/PissCompGame.js';
import { PissCompMaxGame } from '../pisscomp/PissCompMaxGame.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by channel ID
const activeGames = new Map<string, PissCompGame>();
const activeMaxGames = new Map<string, PissCompMaxGame>();

/**
 * Handle the Piss Comp command to start a competition
 */
export async function handlePissCompCommand(message: Message, args: string[]): Promise<void> {
  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    
    // Check if a game is already running in this channel
    if (activeGames.has(channelId)) {
      await message.reply({
        content: 'A Piss Competition is already in progress in this channel!',
      });
      return;
    }
    
    if (!message.guild) {
      await message.reply({
        content: 'Piss Comp can only be played in a server.',
      });
      return;
    }
    
    // Validate command: need a mentioned user
    if (message.mentions.users.size === 0) {
      await message.reply({
        content: 'You need to mention another user to challenge! Usage: `.pisscomp @user`',
      });
      return;
    }
    
    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) {
      await message.reply({
        content: 'Invalid user mentioned.',
      });
      return;
    }
    
    // Validate: cannot challenge yourself
    if (mentionedUser.id === message.author.id) {
      await message.reply({
        content: 'You cannot challenge yourself!',
      });
      return;
    }
    
    // Validate: bots cannot participate
    if (mentionedUser.bot) {
      await message.reply({
        content: 'You cannot challenge a bot!',
      });
      return;
    }
    
    const player1Id = message.author.id;
    const player1Name = message.author.displayName || message.author.username;
    const player1Avatar = message.author.displayAvatarURL({ size: 256 }) || message.author.defaultAvatarURL;
    const player2Id = mentionedUser.id;
    const player2Name = mentionedUser.displayName || mentionedUser.username;
    const player2Avatar = mentionedUser.displayAvatarURL({ size: 256 }) || mentionedUser.defaultAvatarURL;
    
    // Create new game instance
    const game = new PissCompGame(
      channelId,
      guildId,
      { id: player1Id, name: player1Name, avatar: player1Avatar },
      { id: player2Id, name: player2Name, avatar: player2Avatar },
      () => {
        // Cleanup callback: remove game from active games when finished
        activeGames.delete(channelId);
      }
    );

    // Store in active games
    activeGames.set(channelId, game);

    // Send initial message
    const initialMessage = await message.reply({
      content: '💦 Setting up the competition...',
    });

    // Start the game
    await game.start(initialMessage);

    // Clean up when game is finished (fallback cleanup)
    const checkInterval = setInterval(() => {
      if (game.isFinished()) {
        activeGames.delete(channelId);
        clearInterval(checkInterval);
      }
    }, 1000);

  } catch (error) {
    console.error('[Piss Comp Command] Error:', error);
    await ErrorHandler.handleMessageError(message, error, 'Piss Comp command');
  }
}

/**
 * Handle the Piss Comp Max command to start a JJK fight sequence
 */
export async function handlePissCompMaxCommand(message: Message, args: string[]): Promise<void> {
  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;

    // Check if a game is already running in this channel
    if (activeGames.has(channelId) || activeMaxGames.has(channelId)) {
      await message.reply({
        content: 'A Piss Competition is already in progress in this channel!',
      });
      return;
    }

    if (!message.guild) {
      await message.reply({
        content: 'Piss Comp Max can only be played in a server.',
      });
      return;
    }

    // Validate command: need a mentioned user
    if (message.mentions.users.size === 0) {
      await message.reply({
        content: 'You need to mention another user to challenge! Usage: `.pisscompmax @user`',
      });
      return;
    }

    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) {
      await message.reply({
        content: 'Invalid user mentioned.',
      });
      return;
    }

    // Validate: cannot challenge yourself
    if (mentionedUser.id === message.author.id) {
      await message.reply({
        content: 'You cannot challenge yourself!',
      });
      return;
    }

    // Validate: bots cannot participate
    if (mentionedUser.bot) {
      await message.reply({
        content: 'You cannot challenge a bot!',
      });
      return;
    }

    const player1Id = message.author.id;
    const player1Name = message.author.displayName || message.author.username;
    const player1Avatar = message.author.displayAvatarURL({ size: 256 }) || message.author.defaultAvatarURL;
    const player2Id = mentionedUser.id;
    const player2Name = mentionedUser.displayName || mentionedUser.username;
    const player2Avatar = mentionedUser.displayAvatarURL({ size: 256 }) || mentionedUser.defaultAvatarURL;

    // First, run the normal Piss Comp game
    const normalGame = new PissCompGame(
      channelId,
      guildId,
      { id: player1Id, name: player1Name, avatar: player1Avatar },
      { id: player2Id, name: player2Name, avatar: player2Avatar },
      () => {
        // Cleanup callback: remove game from active games when finished
        activeGames.delete(channelId);
      }
    );

    // Store in active games
    activeGames.set(channelId, normalGame);

    // Send initial message
    const initialMessage = await message.reply({
      content: '💦 Setting up the competition...',
    });

    // Start the normal game
    await normalGame.start(initialMessage);

    // Wait for normal game to finish, then start JJK fight sequence
    const checkInterval = setInterval(() => {
      if (normalGame.isFinished()) {
        clearInterval(checkInterval);
        activeGames.delete(channelId);

        // Get the winner
        const gameState = normalGame.getState();
        const winner = gameState.winner;

        if (winner) {
          // Start JJK fight sequence
          const maxGame = new PissCompMaxGame(
            channelId,
            guildId,
            { id: player1Id, name: player1Name, avatar: player1Avatar },
            { id: player2Id, name: player2Name, avatar: player2Avatar },
            () => {
              // Cleanup callback: remove game from active games when finished
              activeMaxGames.delete(channelId);
            }
          );

          // Store in active games
          activeMaxGames.set(channelId, maxGame);

          // Start the JJK fight sequence
          maxGame.start(initialMessage, winner).catch((error) => {
            console.error('[Piss Comp Max] Error starting JJK fight:', error);
            activeMaxGames.delete(channelId);
          });

          // Clean up when game is finished (fallback cleanup)
          const maxCheckInterval = setInterval(() => {
            if (maxGame.isFinished()) {
              activeMaxGames.delete(channelId);
              clearInterval(maxCheckInterval);
            }
          }, 1000);
        }
      }
    }, 1000);

  } catch (error) {
    console.error('[Piss Comp Max Command] Error:', error);
    await ErrorHandler.handleMessageError(message, error, 'Piss Comp Max command');
  }
}

/**
 * Handle Piss Comp button interactions
 */
export async function handlePissCompInteraction(interaction: MessageComponentInteraction): Promise<void> {
  try {
    if (!interaction.channel) return;

    const channelId = interaction.channel.id;
    const customId = interaction.customId;

    // Check if it's a Piss Comp Max interaction
    if (customId === 'pisscompmax_dodge') {
      const maxGame = activeMaxGames.get(channelId);

      if (!maxGame) {
        await interaction.reply({
          content: 'No active Piss Comp Max game in this channel.',
          ephemeral: true,
        });
        return;
      }

      await maxGame.handleInteraction(interaction);
      return;
    }

    // Normal Piss Comp interaction
    const game = activeGames.get(channelId);

    if (!game) {
      await interaction.reply({
        content: 'No active Piss Competition in this channel.',
        ephemeral: true,
      });
      return;
    }

    await game.handleInteraction(interaction);

  } catch (error) {
    console.error('[Piss Comp Interaction] Error:', error);
    await ErrorHandler.handleInteractionError(interaction, error, 'Piss Comp interaction');
  }
}