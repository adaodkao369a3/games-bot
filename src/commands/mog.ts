import { Message, AttachmentBuilder } from 'discord.js';
import { MogImageGenerator, MogImageData } from '../utils/mog-image-generator.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { getMogProfile, createMogProfile } from '../database/client.js';

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
        newRankData.theme_color
      );
      
      console.log(`[MOG Command] Profile created for ${username} with rank ${profile.rank}`);
    } else {
      console.log(`[MOG Command] Found existing profile for ${username}: ${profile.rank} (${profile.stars}/5)`);
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

    // Send reply with only the image (no embed text or metadata)
    await message.reply({
      files: [attachment],
    });

    console.log(`[MOG Command] Successfully sent MOG card for ${username}`);

  } catch (error) {
    console.error('[MOG Command] Error:', error);
    await ErrorHandler.handleMessageError(message, error, 'MOG command');
  }
}
