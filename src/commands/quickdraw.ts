import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { QuickDrawGame } from '../quickdraw/QuickDrawGame.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by channel ID
const activeGames = new Map<string, QuickDrawGame>();
// Pending challenges by channel ID
const pendingChallenges = new Map<string, { challenger: string, challenged: string, player1Id: string, player1Name: string, player1Avatar: string, player2Id: string, player2Name: string, player2Avatar: string, timeout: NodeJS.Timeout }>();

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
    
    // Check if there's a pending challenge
    if (pendingChallenges.has(channelId)) {
      await message.reply('There is already a pending challenge in this channel. Wait for it to be accepted or declined.');
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
        content: 'You need to mention another user to challenge! Usage: `.quickdraw @user`',
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
    
    try {
      // Create challenge message with accept/decline buttons
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('quickdraw_accept')
            .setLabel('✅ ACCEPT')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('quickdraw_decline')
            .setLabel('❌ DECLINE')
            .setStyle(ButtonStyle.Danger)
        );

      const challengeMessage = await message.reply({
        content: `🤠 **QUICK DRAW CHALLENGE**\n\n<@${player1Id}> has challenged <@${player2Id}> to a duel!\n\n<@${player2Id}>, do you accept the challenge?`,
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
        challenger: player1Id,
        challenged: player2Id,
        player1Id,
        player1Name,
        player1Avatar,
        player2Id,
        player2Name,
        player2Avatar,
        timeout
      });
    } catch (error) {
      console.error('[Quick Draw Command] Error creating challenge:', error);
      await ErrorHandler.handleMessageError(message, error, 'Quick Draw command');
    }
    
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
    const customId = interaction.customId;

    // Handle challenge acceptance/decline
    if (customId === 'quickdraw_accept' || customId === 'quickdraw_decline') {
      const pendingChallenge = pendingChallenges.get(channelId);
      
      if (!pendingChallenge) {
        await interaction.reply({
          content: 'No pending challenge found.',
          ephemeral: true,
        });
        return;
      }

      // Only the challenged user can accept/decline
      if (interaction.user.id !== pendingChallenge.challenged) {
        await interaction.reply({
          content: 'Only the challenged user can accept or decline this challenge.',
          ephemeral: true,
        });
        return;
      }

      // Clear the timeout
      clearTimeout(pendingChallenge.timeout);
      pendingChallenges.delete(channelId);

      if (customId === 'quickdraw_decline') {
        await interaction.update({
          content: '❌ The challenge has been declined.',
          components: []
        });
        return;
      }

      // Accept the challenge
      try {
        await interaction.update({
          content: '✅ Challenge accepted! Starting duel...',
          components: []
        });

        // Create new game instance
        const game = new QuickDrawGame(
          channelId,
          interaction.guildId || undefined,
          pendingChallenge.player1Id,
          pendingChallenge.player1Name,
          pendingChallenge.player2Id,
          pendingChallenge.player2Name,
          pendingChallenge.player1Avatar,
          pendingChallenge.player2Avatar
        );
        
        // Store in active games
        activeGames.set(channelId, game);
        
        // Send initial message
        const initialMessage = await interaction.message.edit({
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
        console.error('[Quick Draw Accept] Error:', error);
        await ErrorHandler.handleInteractionError(interaction, error, 'Quick Draw accept');
      }
      return;
    }

    // Handle game interactions
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
