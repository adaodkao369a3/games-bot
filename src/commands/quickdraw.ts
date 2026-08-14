import { Message, MessageComponentInteraction } from 'discord.js';
import { QuickDrawGame } from '../quickdraw/QuickDrawGame.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by channel ID
const activeGames = new Map<string, QuickDrawGame>();

/**
 * Handle the Quick Draw command to start a duel
 */
export async function handleQuickDrawCommand(message: Message, args: string[]): Promise<void> {
  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    
    // Check if a game is already running in this channel
    if (activeGames.has(channelId)) {
      await message.reply({
        content: 'A Quick Draw duel is already in progress in this channel!',
      });
      return;
    }
    
    if (!message.guild) {
      await message.reply({
        content: 'Quick Draw can only be played in a server.',
      });
      return;
    }
    
    // Validate command: need a mentioned user
    if (message.mentions.users.size === 0) {
      await message.reply({
        content: 'You need to mention another user to challenge! Usage: `,quickdraw @user`',
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
    const player2Id = mentionedUser.id;
    const player2Name = mentionedUser.displayName || mentionedUser.username;
    
    // Create new game instance
    const game = new QuickDrawGame(
      channelId,
      guildId,
      player1Id,
      player1Name,
      player2Id,
      player2Name
    );
    
    // Store in active games
    activeGames.set(channelId, game);
    
    // Send initial message
    const initialMessage = await message.reply({
      content: '🤠 Setting up the duel...',
    });
    
    // Start the game
    await game.start(initialMessage);
    
    // Clean up when game is finished
    const checkInterval = setInterval(() => {
      if (game.isFinished()) {
        activeGames.delete(channelId);
        clearInterval(checkInterval);
      }
    }, 1000);
    
  } catch (error) {
    console.error('[Quick Draw Command] Error:', error);
    await ErrorHandler.handleMessageError(message, error, 'Quick Draw command');
  }
}

/**
 * Handle Quick Draw button interactions
 */
export async function handleQuickDrawInteraction(interaction: MessageComponentInteraction): Promise<void> {
  try {
    if (!interaction.channel) return;
    
    const channelId = interaction.channel.id;
    const game = activeGames.get(channelId);
    
    if (!game) {
      await interaction.reply({
        content: 'No active Quick Draw duel in this channel.',
        ephemeral: true,
      });
      return;
    }
    
    await game.handleInteraction(interaction);
    
  } catch (error) {
    console.error('[Quick Draw Interaction] Error:', error);
    await ErrorHandler.handleInteractionError(interaction, error, 'Quick Draw interaction');
  }
}
