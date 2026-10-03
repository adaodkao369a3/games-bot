import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { FishingGame } from '../fishing/FishingGame.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { config, isGameFloorChannel } from '../config/index.js';

// Active games keyed by user ID
const activeGames = new Map<string, FishingGame>();
// Pending confirmations keyed by user ID
const pendingConfirmations = new Map<string, { timeout: NodeJS.Timeout }>();

/**
 * Handle the fish command
 */
export async function handleFishCommand(message: Message): Promise<void> {
  // Check if command is used in game floor channel
  if (!isGameFloorChannel(message.channel.id)) {
    await message.reply(`This command can only be used in <#${config.gameFloorChannelIds[0]}>.`);
    return;
  }

  const userId = message.author.id;

  // Check if user already has an active fishing session
  if (activeGames.has(userId)) {
    await message.reply({
      content: 'You already have a fishing session in progress!',
    });
    return;
  }

  // Check if there's a pending confirmation
  if (pendingConfirmations.has(userId)) {
    await message.reply('You already have a pending fishing confirmation. Please respond to it first.');
    return;
  }

  // Check if user has enough coins
  const coinInfo = await getCoinBalanceInfo(userId);
  if (!coinInfo) {
    await message.reply('Unable to retrieve your Bombo Coin balance. Please try again later.');
    return;
  }

  const ENTRY_FEE = 500;
  if (coinInfo.balance < ENTRY_FEE) {
    await message.reply(
      `You don't have enough Bombo Coins to go fishing! You need ${ENTRY_FEE.toLocaleString('en-US')} <:bombocoin:1545139736312815840>.\n` +
      `Your current balance: ${coinInfo.balance.toLocaleString('en-US')} <:bombocoin:1545139736312815840>`
    );
    return;
  }

  try {
    // Create confirmation message with yes/no buttons
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('fish_confirm')
          .setLabel('✅ YES')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('fish_cancel')
          .setLabel('❌ NO')
          .setStyle(ButtonStyle.Danger)
      );

    const confirmationMessage = await message.reply({
      content: `🎣 **Are you ready to fish?**\n\nThis will cost ${ENTRY_FEE.toLocaleString('en-US')} <:bombocoin:1545139736312815840>.\nYour current balance: ${coinInfo.balance.toLocaleString('en-US')} <:bombocoin:1545139736312815840>`,
      components: [row]
    });

    // Store pending confirmation with 2-minute timeout
    const timeout = setTimeout(() => {
      if (pendingConfirmations.has(userId)) {
        pendingConfirmations.delete(userId);
        confirmationMessage.edit({
          content: '⏰ The fishing confirmation has expired.',
          components: []
        }).catch(() => {});
      }
    }, 2 * 60 * 1000); // 2 minutes

    pendingConfirmations.set(userId, { timeout });
  } catch (error) {
    console.error('[Fish Command] Error:', error);
    await message.reply('An error occurred while starting fishing. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'fish command');
  }
}

/**
 * Handle fishing button interactions
 */
export async function handleFishInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const userId = interaction.user.id;
  const customId = interaction.customId;

  // Handle confirmation buttons
  if (customId === 'fish_confirm' || customId === 'fish_cancel') {
    const pendingConfirmation = pendingConfirmations.get(userId);
    
    if (!pendingConfirmation) {
      await interaction.reply({
        content: 'No pending fishing confirmation found.',
        ephemeral: true,
      });
      return;
    }

    // Clear the timeout
    clearTimeout(pendingConfirmation.timeout);
    pendingConfirmations.delete(userId);

    if (customId === 'fish_cancel') {
      await interaction.update({
        content: '❌ Fishing cancelled.',
        components: []
      });
      return;
    }

    // Confirm and start fishing
    try {
      const channelId = interaction.channelId;
      const guildId = interaction.guildId || undefined;

      // Create new game instance
      const game = new FishingGame(userId, channelId, guildId);
      
      // Store in active games
      activeGames.set(userId, game);
      
      // Start the game
      await game.start(interaction.message);
      
      // Clean up when game is finished
      const checkInterval = setInterval(() => {
        if (game.isFinished()) {
          activeGames.delete(userId);
          clearInterval(checkInterval);
        }
      }, 1000);
    } catch (error) {
      console.error('[Fish Start] Error:', error);
      await interaction.update({
        content: 'An error occurred while starting fishing. Please try again.',
        components: []
      });
      await ErrorHandler.handleInteractionError(interaction, error, 'fish start');
    }
    return;
  }

  // Handle game interactions
  const game = activeGames.get(userId);

  if (!game) {
    await interaction.reply({
      content: 'No active fishing session found.',
      ephemeral: true,
    });
    return;
  }

  try {
    await game.handleInteraction(interaction);
  } catch (error) {
    console.error('[Fish Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred during fishing.',
      ephemeral: true,
    });
  }
}
