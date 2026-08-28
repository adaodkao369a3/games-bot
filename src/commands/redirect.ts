import { isStaff } from '../utils/permissions.js';
import { setRedirectEnabled, isRedirectEnabled } from '../utils/redirect-manager.js';

export async function handleRedirectOnCommand(message: any): Promise<void> {
  try {
    // Check admin permissions
    if (!message.member || !isStaff(message.member)) {
      await message.reply({
        content: 'You do not have permission to use this command.',
      });
      return;
    }

    // Enable redirect for this channel
    setRedirectEnabled(message.channel.id, true);
    await message.reply({
      content: `✅ Redirect enabled for this channel. Quotes will be sent to the directors cut channel.`,
    });
  } catch (error) {
    console.error('[Redirect On Command] Error:', error);
    await message.reply({
      content: 'An error occurred while enabling redirect.',
    });
  }
}

export async function handleRedirectOffCommand(message: any): Promise<void> {
  try {
    // Check admin permissions
    if (!message.member || !isStaff(message.member)) {
      await message.reply({
        content: 'You do not have permission to use this command.',
      });
      return;
    }

    // Disable redirect for this channel
    setRedirectEnabled(message.channel.id, false);
    await message.reply({
      content: `✅ Redirect disabled for this channel. Quotes will only be sent to this channel.`,
    });
  } catch (error) {
    console.error('[Redirect Off Command] Error:', error);
    await message.reply({
      content: 'An error occurred while disabling redirect.',
    });
  }
}
