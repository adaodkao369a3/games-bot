import { Message, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageComponentInteraction, ColorResolvable } from 'discord.js';
import { MogImageGenerator, MogImageData } from '../utils/mog-image-generator.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { getMogProfile, createMogProfile, updateMogProfile } from '../database/client.js';
import { removeCoins, getCoinBalanceInfo } from '../services/coins.js';

// Rank classifications
const RANK_CLASSIFICATIONS = {
  'D': 'ROOKIE',
  'C': 'STANDARD',
  'B': 'ADVANCED',
  'A': 'ELITE',
  'S': 'LEGENDARY',
  'SS': 'MYTHIC',
};

export async function handleMogCommand(message: Message, args: string[]): Promise<void> {
  try {
    // Parse user mentions from args
    const mentionedUsers = message.mentions.users.filter(user => !user.bot);
    const mentionedUserIds = Array.from(mentionedUsers.keys());

    // Determine target user
    let targetUser;
    if (mentionedUserIds.length > 0) {
      // Use the first mentioned user
      targetUser = mentionedUsers.first();
      
      // Only support one user for now
      if (mentionedUserIds.length > 1) {
        await message.reply({
          content: 'okkk buddy (only one user at a time for now)',
        });
        return;
      }
    } else {
      // Use the message author if no mention
      targetUser = message.author;
    }

    if (!targetUser) {
      await message.reply({
        content: 'okkk buddy',
      });
      return;
    }

    if (!message.guild) {
      await message.reply({
        content: 'okkk buddy',
      });
      return;
    }

    // Get member for display name
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    const displayName = member?.nickname || targetUser.username;
    const username = targetUser.username;
    const guildId = message.guild.id;
    const userId = targetUser.id;

    console.log(`[MOG Command] Generating card for user: ${username} (${userId}) in guild: ${guildId}`);

    // Try to get existing profile from database
    let profile = await getMogProfile(guildId, userId);
    
    if (!profile) {
      console.log(`[MOG Command] No existing profile found, generating new profile for ${username}`);

      // Generate new rank data
      const newRankData = MogImageGenerator.generateRankData();

      console.log(`[MOG Command] Generated rank: ${newRankData.rank} (${newRankData.classification}), Stars: ${newRankData.stars}/5, Theme: ${newRankData.theme_color}`);

      // Create profile atomically (handles race conditions)
      profile = await createMogProfile(
        guildId,
        userId,
        newRankData.rank,
        newRankData.stars,
        newRankData.title,
        newRankData.description,
        newRankData.theme_color,
        newRankData.attributes,
        newRankData.analysis_attributes
      );

      console.log(`[MOG Command] Profile created for ${username} with rank ${profile.rank}`);
    } else {
      console.log(`[MOG Command] Found existing profile for ${username}: ${profile.rank} (${profile.stars}/5)`);

      // Handle existing profiles without attributes/analysis_attributes
      const needsMigration = !profile.attributes || Object.keys(profile.attributes).length === 0 || !profile.analysis_attributes || profile.analysis_attributes.length === 0;

      if (needsMigration) {
        console.log(`[MOG Command] Existing profile missing attributes or analysis_attributes, generating and updating...`);

        // Generate new attributes and analysis selection
        const newRankData = MogImageGenerator.generateRankData();

        // Update profile with new attributes and analysis selection
        profile = await updateMogProfile(
          guildId,
          userId,
          profile.rank,
          profile.stars,
          profile.title,
          profile.description,
          profile.theme_color,
          newRankData.attributes,
          newRankData.analysis_attributes
        );

        console.log(`[MOG Command] Updated profile for ${username} with attributes and analysis_attributes`);
      }
    }

    // Download avatar
    const avatarUrl = targetUser.displayAvatarURL({ size: 1024, extension: 'png' });
    const avatarBuffer = await MogImageGenerator.downloadImage(avatarUrl);

    // Create rank data from profile
    const rankData = {
      rank: profile.rank,
      classification: RANK_CLASSIFICATIONS[profile.rank],
      stars: profile.stars,
      title: profile.title,
      description: profile.description,
      theme_color: profile.theme_color,
      attributes: profile.attributes,
      analysis_attributes: profile.analysis_attributes,
    };

    // Create image data
    const imageData: MogImageData = {
      username,
      displayName,
      avatarBuffer,
      rankData,
    };

    // Generate MOG card
    const mogCard = await MogImageGenerator.generateMogCard(imageData);

    // Create attachment
    const attachment = new AttachmentBuilder(mogCard, { name: 'mog-card.png' });

    // Create embed with only the image
    const embed = new EmbedBuilder()
      .setImage('attachment://mog-card.png')
      .setColor(rankData.theme_color as ColorResolvable);

    // Create retry button (includes both requester and target user IDs)
    const retryButton = new ButtonBuilder()
      .setCustomId(`mog_retry_${message.author.id}_${userId}`)
      .setLabel('ascend')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(retryButton);

    // Send reply with embed and button
    await message.reply({
      embeds: [embed],
      files: [attachment],
      components: [row],
    });

    console.log(`[MOG Command] Successfully sent MOG card for ${username}`);

  } catch (error) {
    console.error('[MOG Command] Error:', error);
    await ErrorHandler.handleMessageError(message, error, 'MOG command');
  }
}

const RETRY_PRICE = 1000000;

// Track processing interactions to prevent duplicate charges
const processingInteractions = new Set<string>();

/**
 * Handle MOG ascend button interaction
 */
export async function handleMogInteraction(interaction: MessageComponentInteraction): Promise<void> {
  try {
    const customId = interaction.customId;

    if (customId.startsWith('mog_retry_')) {
      await handleMogRetryButton(interaction);
    }
  } catch (error) {
    console.error('[MOG Interaction] Error:', error);
    await ErrorHandler.handleInteractionError(interaction, error, 'MOG interaction');
  }
}

/**
 * Handle MOG ascend button click - process payment and reroll
 */
async function handleMogRetryButton(interaction: MessageComponentInteraction): Promise<void> {
  const customId = interaction.customId;
  const parts = customId.replace('mog_retry_', '').split('_');
  const requesterId = parts[0];
  const targetUserId = parts[1];
  const currentUserId = interaction.user.id;

  // Prevent duplicate charges for the same interaction
  if (processingInteractions.has(customId)) {
    await interaction.reply({
      content: 'This ascend is already being processed. Please wait.',
      ephemeral: true,
    });
    return;
  }

  // Verify the user is the original requester
  if (currentUserId !== requesterId) {
    await interaction.reply({
      content: 'You can only ascend your own MOG card.',
      ephemeral: true,
    });
    return;
  }

  // Mark this interaction as processing
  processingInteractions.add(customId);

  // Defer the interaction to allow time for database operations and image generation
  await interaction.deferReply({ ephemeral: false });

  // Check user's coin balance
  const balance = await getCoinBalanceInfo(currentUserId);
  if (!balance || balance.balance < RETRY_PRICE) {
    processingInteractions.delete(customId);
    await interaction.editReply({
      content: `You need ${RETRY_PRICE.toLocaleString('en-US')} Bombo Coins to ascend your MOG card. Your current balance: ${balance ? balance.balance.toLocaleString('en-US') : 0}.`,
    });
    return;
  }

  // Deduct coins from the requester
  const newBalance = await removeCoins(
    currentUserId,
    RETRY_PRICE,
    'mog',
    {
      reason: 'MOG ascend',
      description: `Rerolled MOG card for user ${targetUserId}`,
    }
  );

  if (newBalance === null) {
    processingInteractions.delete(customId);
    await interaction.editReply({
      content: 'Failed to process coin transaction. Please try again.',
    });
    return;
  }

  // Get the original message to extract guild info
  const originalMessage = interaction.message;
  const guildId = originalMessage.guildId;
  if (!guildId) {
    processingInteractions.delete(customId);
    await interaction.editReply({
      content: 'Failed to ascend MOG card: guild not found.',
    });
    return;
  }

  try {
    // Generate new random rank data
    const newRankData = MogImageGenerator.generateRankData();

    // Update profile in database with new random data
    await updateMogProfile(
      guildId,
      targetUserId,
      newRankData.rank,
      newRankData.stars,
      newRankData.title,
      newRankData.description,
      newRankData.theme_color,
      newRankData.attributes,
      newRankData.analysis_attributes
    );

    // Get the target user's avatar and display name
    const targetUser = await interaction.client.users.fetch(targetUserId);
    const avatarUrl = targetUser.displayAvatarURL({ size: 1024, extension: 'png' });
    const avatarBuffer = await MogImageGenerator.downloadImage(avatarUrl);

    // Get member for display name
    const guild = await interaction.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(targetUserId).catch(() => null);
    const displayName = member?.nickname || targetUser.username;
    const username = targetUser.username;

    // Create rank data from new profile
    const rankData = {
      rank: newRankData.rank,
      classification: RANK_CLASSIFICATIONS[newRankData.rank],
      stars: newRankData.stars,
      title: newRankData.title,
      description: newRankData.description,
      theme_color: newRankData.theme_color,
      attributes: newRankData.attributes,
      analysis_attributes: newRankData.analysis_attributes,
    };

    // Create image data
    const imageData: MogImageData = {
      username,
      displayName,
      avatarBuffer,
      rankData,
    };

    // Generate new MOG card
    const mogCard = await MogImageGenerator.generateMogCard(imageData);

    // Create attachment
    const attachment = new AttachmentBuilder(mogCard, { name: 'mog-card.png' });

    // Create embed with only the image
    const embed = new EmbedBuilder()
      .setImage('attachment://mog-card.png')
      .setColor(rankData.theme_color as ColorResolvable);

    // Create retry button (includes both requester and target user IDs)
    const retryButton = new ButtonBuilder()
      .setCustomId(`mog_retry_${requesterId}_${targetUserId}`)
      .setLabel('ascend')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(retryButton);

    // Send new message with updated card
    await interaction.editReply({
      content: `Successfully ascended! New rank: ${newRankData.rank} (${newRankData.classification})`,
      embeds: [embed],
      files: [attachment],
      components: [row],
    });

    console.log(`[MOG Ascend] User ${currentUserId} ascended user ${targetUserId} to ${newRankData.rank} (${newRankData.classification}) for ${RETRY_PRICE} coins`);
  } catch (error) {
    console.error('[MOG Ascend] Error during profile update or card generation:', error);
    await interaction.editReply({
      content: 'Failed to generate new MOG card. Your profile was updated but the card could not be rendered. Please use `.mog` to view your new profile.',
    });
  } finally {
    // Always remove the interaction from processing set
    processingInteractions.delete(customId);
  }
}
