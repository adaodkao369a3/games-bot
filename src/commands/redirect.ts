import { Message } from 'discord.js';
import { getQuoteRedirectSettings, setQuoteRedirectSettings } from '../database/client.js';
import { isStaff } from '../utils/permissions.js';

/**
 * Handle the redirect command - Toggle quote redirect on/off
 */
export async function handleRedirectCommand(message: Message, args: string[]): Promise<void> {
  try {
    // Only staff can use this command
    if (!isStaff(message.member)) {
      await message.reply('❌ Only staff members can use this command.');
      return;
    }

    // Check if in a guild
    if (!message.guild) {
      await message.reply('❌ This command can only be used in a server.');
      return;
    }

    // Check if argument is provided
    if (args.length === 0) {
      const currentSettings = await getQuoteRedirectSettings(message.guild.id);
      const status = currentSettings.redirect_enabled ? 'ON' : 'OFF';
      await message.reply(`📋 Quote redirect is currently **${status}** for this server.\n\nUsage: \`$redirect quote on\` or \`$redirect quote off\``);
      return;
    }

    const action = args[0].toLowerCase();
    const type = args[1]?.toLowerCase();

    // Validate command format
    if (type !== 'quote') {
      await message.reply('❌ Invalid redirect type. Usage: `$redirect quote on` or `$redirect quote off`');
      return;
    }

    // Validate action
    if (action !== 'on' && action !== 'off') {
      await message.reply('❌ Invalid action. Use `on` or `off`. Usage: `$redirect quote on` or `$redirect quote off`');
      return;
    }

    const newStatus = action === 'on';
    const success = await setQuoteRedirectSettings(message.guild.id, newStatus);

    if (success) {
      const statusText = newStatus ? 'ON' : 'OFF';
      await message.reply(`✅ Quote redirect has been turned **${statusText}** for this server.`);
    } else {
      await message.reply('❌ Failed to update quote redirect settings. Please try again.');
    }
  } catch (error) {
    console.error('[Redirect Command] Error:', error);
    await message.reply('❌ There was an error processing the redirect command. Please try again.');
  }
}
