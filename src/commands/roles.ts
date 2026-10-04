import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction } from 'discord.js';
import { TitleSystem } from '../titles/TitleSystem.js';
import { awardCoins, getCoinBalanceInfo } from '../services/coins.js';
import { recordRoleForfeit, hasUserForfeitedRole } from '../database/client.js';
import { ErrorHandler } from '../utils/error-handler.js';

const FORFEIT_COST = 2000;

/**
 * Handle the roles command
 */
export async function handleRolesCommand(message: Message): Promise<void> {
  const userId = message.author.id;
  const guild = message.guild;

  if (!guild) {
    await message.reply('This command can only be used in a server.');
    return;
  }

  try {
    const allCategories = TitleSystem.getAllCategories();
    const userRoles: Array<{ categoryId: string; name: string; roleId: string; hasRole: boolean; forfeited: boolean }> = [];

    // Check each category
    for (const [categoryId, category] of Object.entries(allCategories)) {
      const hasRole = await TitleSystem.userHoldsTitle(categoryId, userId);
      const forfeited = await hasUserForfeitedRole(userId, categoryId);

      if (hasRole || forfeited) {
        userRoles.push({
          categoryId,
          name: category.name,
          roleId: category.roleId,
          hasRole,
          forfeited,
        });
      }
    }

    if (userRoles.length === 0) {
      const noRolesEmbed = new EmbedBuilder()
        .setTitle('👑 Your Roles')
        .setDescription('You don\'t have any roles yet. Complete quizzes to earn titles!')
        .setColor(0x00BFFF)
        .setFooter({ text: 'Use `.quiz jjk` to start earning roles!' });

      await message.reply({ embeds: [noRolesEmbed] });
      return;
    }

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle('👑 Your Roles')
      .setDescription('View and manage your earned roles')
      .setColor(0x00BFFF);

    const roleList = userRoles.map((role, index) => {
      const status = role.forfeited ? '~~Stripped~~' : (role.hasRole ? '✅ Active' : '❌ Lost');
      const forfeitButton = role.hasRole && !role.forfeited ? `\n💰 Forfeit for ${FORFEIT_COST.toLocaleString()} coins` : '';
      return `${index + 1}. **${role.name}** - ${status}${forfeitButton}`;
    }).join('\n');

    embed.addFields({ name: 'Roles', value: roleList });

    // Create buttons for each role that can be forfeited
    const buttons = userRoles
      .filter(role => role.hasRole && !role.forfeited)
      .map(role => 
        new ButtonBuilder()
          .setCustomId(`forfeit_role_${role.categoryId}`)
          .setLabel(`Forfeit ${role.name}`)
          .setStyle(ButtonStyle.Danger)
      );

    if (buttons.length > 0) {
      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
      await message.reply({ embeds: [embed], components: [actionRow] });
    } else {
      await message.reply({ embeds: [embed] });
    }

  } catch (error) {
    console.error('[Roles Command] Error:', error);
    await message.reply('An error occurred while fetching your roles. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'roles command');
  }
}

/**
 * Handle role forfeit button interactions
 */
export async function handleRolesInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const customId = interaction.customId;

  if (!customId.startsWith('forfeit_role_')) {
    return;
  }

  const categoryId = customId.replace('forfeit_role_', '');
  const userId = interaction.user.id;
  const guild = interaction.guild;

  if (!guild) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  try {
    // Check if user still has the role
    const hasRole = await TitleSystem.userHoldsTitle(categoryId, userId);
    if (!hasRole) {
      await interaction.reply({
        content: 'You no longer have this role.',
        ephemeral: true,
      });
      return;
    }

    // Check if already forfeited
    const alreadyForfeited = await hasUserForfeitedRole(userId, categoryId);
    if (alreadyForfeited) {
      await interaction.reply({
        content: 'You have already forfeited this role.',
        ephemeral: true,
      });
      return;
    }

    // Check user's coin balance
    const coinInfo = await getCoinBalanceInfo(userId);
    if (!coinInfo || coinInfo.balance < FORFEIT_COST) {
      await interaction.reply({
        content: `You need at least ${FORFEIT_COST.toLocaleString()} <:bombocoin:1545139736312815840> to forfeit this role. Your current balance: ${coinInfo?.balance.toLocaleString('en-US') || 0} <:bombocoin:1545139736312815840>`,
        ephemeral: true,
      });
      return;
    }

    // Get category info
    const category = TitleSystem.getCategory(categoryId);
    if (!category) {
      await interaction.reply({
        content: 'Invalid role category.',
        ephemeral: true,
      });
      return;
    }

    // Remove the role
    const removed = await TitleSystem.removeTitleFromUser(categoryId, userId, guild);
    if (!removed) {
      await interaction.reply({
        content: 'Failed to remove the role. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Record the forfeit in database
    await recordRoleForfeit(userId, categoryId);

    // Award coins
    const newBalance = await awardCoins(userId, FORFEIT_COST, 'role_forfeit', {
      reason: `Forfeited ${category.name} role`,
      description: `User forfeited ${category.name} for ${FORFEIT_COST} coins`
    });

    await interaction.reply({
      content: `✅ You have forfeited the **${category.name}** role and received ${FORFEIT_COST.toLocaleString()} <:bombocoin:1545139736312815840>!\nNew balance: ${newBalance?.toLocaleString('en-US') || 0} <:bombocoin:1545139736312815840>`,
      ephemeral: true,
    });

  } catch (error) {
    console.error('[Roles Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred while forfeiting the role. Please try again.',
      ephemeral: true,
    });
  }
}
