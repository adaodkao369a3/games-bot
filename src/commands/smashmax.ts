import { Message, MessageComponentInteraction, EmbedBuilder } from 'discord.js';
import { SmashMaxGame, SmashMaxState } from '../smashmax/SmashMaxGame.js';
import { AniListCharacterService } from '../services/anilist-character-service.js';
import { ErrorHandler } from '../utils/error-handler.js';

const activeGames = new Map<string, SmashMaxGame>();

// Cooldown tracking: channelId -> last usage timestamp
const cooldowns = new Map<string, number>();
const COOLDOWN_DURATION = 120 * 1000; // 2 minutes in milliseconds

export async function handleSmashMaxCommand(message: Message): Promise<void> {
  try {
    // Check cooldown
    const now = Date.now();
    const lastUsage = cooldowns.get(message.channel.id);
    if (lastUsage && now - lastUsage < COOLDOWN_DURATION) {
      const remainingTime = Math.ceil((COOLDOWN_DURATION - (now - lastUsage)) / 1000);
      await message.reply({
        content: `SmashMax is on cooldown. Please wait ${remainingTime} seconds.`,
      });
      return;
    }

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

    // Parse mode argument
    const args = message.content.trim().split(/\s+/);
    let mode: 'normal' | 'female' = 'normal';
    
    if (args.length > 1) {
      const modeArg = args[1].toLowerCase();
      if (modeArg === 'f' || modeArg === 'female') {
        mode = 'female';
      } else {
        await message.reply({
          content: 'Invalid mode. Use: `.smashmax` (normal) or `.smashmax f` (female-only).',
        });
        return;
      }
    }

    // Send initial loading message
    const loadingEmbed = new EmbedBuilder()
      .setTitle('🔥 SMASHMAX')
      .setDescription('<a:dice:1545149015652307104> Fetching anime characters...\n\nPlease wait.')
      .setColor(0xFFD700);

    const replyMessage = await message.reply({
      embeds: [loadingEmbed],
    });

    // Fetch two random characters with mode
    const anilistService = AniListCharacterService.getInstance();
    const [char1, char2] = await anilistService.fetchTwoRandomCharacters(mode);

    // Handle API failure or exhausted pool
    if (!char1 || !char2) {
      await replyMessage.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle('⚠️ SmashMax Pool Exhausted')
            .setDescription('The SmashMax character pool needs to be replenished. New characters are being fetched in the background. Please try again in a few minutes.')
            .setColor(0xFFA500)
        ],
      });
      return;
    }

    // Set cooldown timestamp when command is successfully accepted
    cooldowns.set(message.channel.id, Date.now());

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
