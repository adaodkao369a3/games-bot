import { Message, AttachmentBuilder } from 'discord.js';
import { FontDiagnostic } from '../wordle/fontDiagnostic.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { isStaff } from '../utils/permissions.js';

/**
 * Handle the font test diagnostic command (staff only)
 */
export async function handleFontTestCommand(message: Message, args: string[]): Promise<void> {
  try {
    // Check staff permission
    if (!isStaff(message.member)) {
      await message.reply({
        content: '❌ This command is restricted to staff members only.',
      });
      return;
    }

    console.log('[Font Test Command] Starting font diagnostic test');
    
    // Generate the diagnostic image
    const { image, consoleLog } = await FontDiagnostic.generateDiagnostic();
    
    // Log the diagnostic information to console
    console.log('=== FONT DIAGNOSTIC CONSOLE OUTPUT ===');
    console.log(consoleLog);
    console.log('=== END FONT DIAGNOSTIC CONSOLE OUTPUT ===');
    
    // Create attachment and send to Discord
    const attachment = new AttachmentBuilder(image, { name: 'font-diagnostic.png' });
    
    await message.reply({
      content: 'Font diagnostic test complete. Check the image and console logs for results.',
      files: [attachment],
    });
    
    console.log('[Font Test Command] Font diagnostic sent successfully');
    
  } catch (error) {
    console.error('[Font Test Command] Error:', error);
    await ErrorHandler.handleMessageError(message, error, 'font-test');
  }
}