import { Message, EmbedBuilder } from 'discord.js';
import { awardCoins } from '../services/coins.js';
import { isStaff } from '../utils/permissions.js';

export async function handleCashCommand(message: Message, args: string[]): Promise<void> {
  // Check if user is staff
  if (!isStaff(message.member)) {
    await message.reply('❌ You do not have permission to use this command.');
    return;
  }

  // Parse arguments
  if (args.length < 2) {
    await message.reply('Usage: `.cash @user [amount]` or `.cash @everyone [amount]`\nExample: `.cash @user 1000` or `.cash @everyone 500`');
    return;
  }

  // Parse user mention
  const userMention = args[0];
  const isEveryone = userMention === '@everyone' || userMention === '<@everyone>';
  
  let targetUserId: string | null = null;
  let targetUsers: string[] = [];

  if (isEveryone) {
    // Fetch all guild members
    const guild = message.guild;
    if (!guild) {
      await message.reply('This command can only be used in a server.');
      return;
    }

    try {
      const members = await guild.members.fetch();
      targetUsers = Array.from(members.keys());
    } catch (error) {
      console.error('[Cash Command] Error fetching guild members:', error);
      await message.reply('Failed to fetch server members. Please try again.');
      return;
    }
  } else {
    const userIdMatch = userMention.match(/<@!?(\d+)>/);
    
    if (!userIdMatch) {
      await message.reply('Invalid user mention. Please use the format: `.cash @user [amount]` or `.cash @everyone [amount]`');
      return;
    }

    targetUserId = userIdMatch[1];
    targetUsers = [targetUserId];
  }

  // Parse amount
  const amountArg = args[1];
  const amount = parseInt(amountArg.replace(/,/g, ''), 10);

  if (isNaN(amount) || amount <= 0) {
    await message.reply('Please specify a valid positive amount.');
    return;
  }

  try {
    // Award coins to all target users
    let successCount = 0;
    let failCount = 0;
    let totalAwarded = 0;

    for (const userId of targetUsers) {
      const newBalance = await awardCoins(
        userId,
        amount,
        'admin_cash',
        {
          reason: 'Admin cash command',
          description: `Admin awarded ${amount} coins via .cash command${isEveryone ? ' (@everyone)' : ''}`
        }
      );

      if (newBalance !== null) {
        successCount++;
        totalAwarded += amount;
      } else {
        failCount++;
      }
    }

    // Send success message
    const successEmbed = new EmbedBuilder()
      .setTitle('<:moneybag:1545149026528268308> Coins Awarded')
      .setDescription(isEveryone 
        ? `Successfully awarded **${amount.toLocaleString('en-US')}** <:bombocoin:1545139736312815840> to **${successCount}** members\n${failCount > 0 ? `Failed to award to ${failCount} members.` : ''}`
        : `Successfully awarded **${amount.toLocaleString('en-US')}** <:bombocoin:1545139736312815840> to <@${targetUserId}>`)
      .setColor(0x00FF00);

    if (isEveryone) {
      successEmbed.addFields(
        { name: 'Total Awarded', value: `${totalAwarded.toLocaleString('en-US')} <:bombocoin:1545139736312815840>`, inline: true },
        { name: 'Members', value: `${successCount}`, inline: true }
      );
    } else if (targetUserId) {
      // For single user, fetch and show their new balance
      const finalBalance = await awardCoins(targetUserId, 0, 'check_balance', { reason: 'Balance check' });
      if (finalBalance !== null) {
        successEmbed.addFields(
          { name: 'New Balance', value: `${finalBalance.toLocaleString('en-US')} <:bombocoin:1545139736312815840>`, inline: true }
        );
      }
    }

    await message.reply({ embeds: [successEmbed] });
  } catch (error) {
    console.error('[Cash Command] Error:', error);
    await message.reply('An error occurred while awarding coins.');
  }
}
