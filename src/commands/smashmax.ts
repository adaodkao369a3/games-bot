import { Message, MessageComponentInteraction, EmbedBuilder } from 'discord.js';
import { SmashMaxGame, SmashMaxState } from '../smashmax/SmashMaxGame.js';
import { AniListCharacterService } from '../services/anilist-character-service.js';
import { ErrorHandler } from '../utils/error-handler.js';

const activeGames = new Map<string, SmashMaxGame>();

export async function handleSmashMaxCommand(message: Message): Promise<void> {
  try {
    // Check if there's already an active game in this channel
    if (activeGames.has(message.channel.id)) {
      await message.reply({
        content: 'A SmashMax game is already running in this channel!',
      });
      return;
    }

    if (!message.guild) {
      await message.reply({
        content: 'SmashMax can only be used in servers!',
      });
      return;
    }

    // Send initial loading message
    const loadingEmbed = new EmbedBuilder()
      .setTitle('🔥 SMASHMAX')
      .setDescription('🎲 Fetching anime characters...\n\nPlease wait.')
      .setColor(0xFFD700);

    const replyMessage = await message.reply({
      embeds: [loadingEmbed],
    });

    // Fetch two random characters
    const anilistService = AniListCharacterService.getInstance();
    const [char1, char2] = await anilistService.fetchTwoRandomCharacters();

    // Handle API failure
    if (!char1 || !char2) {
      await replyMessage.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('SmashMax character data is temporarily unavailable. Please try again later.')
            .setColor(0xFF0000)
        ],
      });
      return;
    }

    // Create and start the game
    const game = new SmashMaxGame(
      message.channel.id,
      message.guild.id,
      char1,
      char2,
      () => {
        // Cleanup callback
        activeGames.delete(message.channel.id);
      }
    );

    activeGames.set(message.channel.id, game);
    await game.start(replyMessage);

  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'smashmax');
  }
}

export async function handleSmashMaxInteraction(interaction: MessageComponentInteraction): Promise<void> {
  try {
    const customId = interaction.customId;

    // Only handle SmashMax interactions
    if (!customId.startsWith('smashmax_')) {
      return;
    }

    const game = activeGames.get(interaction.channelId);
    
    if (!game) {
      await interaction.reply({
        content: 'This game is no longer active.',
        ephemeral: true,
      });
      return;
    }

    await game.handleInteraction(interaction);

  } catch (error) {
    await ErrorHandler.handleInteractionError(interaction, error, 'smashmax-interaction');
  }
}
