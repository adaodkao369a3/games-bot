import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Handle the .av (avatar) command
 * Shows a user's server avatar in an embed with a delete button for privacy
 */
export async function handleAvatarCommand(message: Message): Promise<void> {
  try {
    let targetMember;
    let targetUser;

    // Check if message is a reply to another user
    if (message.reference?.messageId) {
      const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
      targetUser = referencedMessage.author;
      targetMember = await message.guild?.members.fetch(targetUser.id).catch(() => null);
    } else {
      // Check if a user mention is provided
      const args = message.content.slice(1).trim().split(/\s+/);
      const command = args.shift()?.toLowerCase();

      if (args.length > 0) {
        const userMention = args[0];
        const userIdMatch = userMention.match(/<@!?(\d+)>/);

        if (userIdMatch) {
          const userId = userIdMatch[1];
          targetUser = await message.client.users.fetch(userId);
          targetMember = await message.guild?.members.fetch(userId).catch(() => null);
        }
      } else {
        // Default to message author
        targetUser = message.author;
        targetMember = message.member;
      }
    }

    if (!targetUser) {
      await message.reply('Could not find that user.');
      return;
    }

    // Get server-specific avatar if available, otherwise fall back to main avatar
    const avatarUrl = targetMember?.displayAvatarURL({ extension: 'png', size: 1024 })
      ?? targetUser.displayAvatarURL({ extension: 'png', size: 1024 });

    // Get server nickname or fallback to username
    const displayName = targetMember?.nickname ?? targetUser.username;

    // Create embed with avatar
    const embed = {
      title: `${displayName}'s Avatar`,
      image: {
        url: avatarUrl,
      },
      color: 0x00BFFF,
      footer: {
        text: `Requested by ${message.author.username}`,
      },
    };

    // Create delete button (only the avatar owner can use it)
    const deleteButton = new ButtonBuilder()
      .setCustomId(`avatar_delete_${targetUser.id}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(deleteButton);

    const sentMessage = await message.reply({
      embeds: [embed],
      components: [row],
    });

    // Create button interaction collector
    const collector = sentMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000, // 1 minute timeout
    });

    collector.on('collect', async (interaction) => {
      // Only allow the avatar owner to delete
      if (interaction.user.id !== targetUser.id) {
        await interaction.reply({
          content: 'Only the person whose avatar is shown can delete this message.',
          ephemeral: true,
        });
        return;
      }

      // Delete the message
      await interaction.deferUpdate();
      await sentMessage.delete().catch(() => {
        // If delete fails (e.g., message already deleted), just remove components
        sentMessage.edit({ components: [] }).catch(() => {});
      });
    });

    collector.on('end', async () => {
      // Remove the button after timeout
      await sentMessage.edit({ components: [] }).catch(() => {});
    });

  } catch (error) {
    console.error('[AVATAR] Error:', error);
    await ErrorHandler.handleMessageError(message, error, 'avatar command');
  }
}
