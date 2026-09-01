import { Message, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { WheelImageGenerator } from '../utils/wheel-image-generator.js';
import { getWheelCategories, getWheelOptions, isValidCategory, wheelCategories } from '../utils/wheel-data.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { isStaff } from '../utils/permissions.js';

// Global wheel state
let wheelCooldownUntil = 0;
let wheelSpinning = false;
const COOLDOWN_DURATION = 2 * 60 * 1000; // 2 minutes in milliseconds

/**
 * Handle the wheel command
 */
export async function handleWheelCommand(message: Message, args: string[]): Promise<void> {
  try {
    // Check if wheel is currently spinning
    if (wheelSpinning) {
      await message.reply({
        content: '⏳ The wheel is already spinning! Please wait for it to finish.',
      });
      return;
    }

    // Check global cooldown (staff bypass)
    const now = Date.now();
    if (!isStaff(message.member) && now < wheelCooldownUntil) {
      const remainingTime = Math.ceil((wheelCooldownUntil - now) / 1000);
      const minutes = Math.floor(remainingTime / 60);
      const seconds = remainingTime % 60;
      const timeString = minutes > 0 ? `${minutes} minute${minutes > 1 ? 's' : ''} ${seconds} second${seconds !== 1 ? 's' : ''}` : `${seconds} second${seconds !== 1 ? 's' : ''}`;
      
      await message.reply({
        content: `⏳ The wheel is cooling down.\n<@${message.author.id}>, someone already spun the wheel.\nYou can spin again in ${timeString}.`,
      });
      return;
    }

    // Check if category was provided
    const category = args[0]?.toLowerCase();
    
    if (!category) {
      // Show available categories
      const categories = getWheelCategories();
      const categoryList = categories.map(cat => `.wheel ${cat}`).join('\n');
      
      await message.reply({
        content: `🎡 Wheel Categories\n\n${categoryList}`,
      });
      return;
    }

    // Validate category
    if (!isValidCategory(category)) {
      await message.reply({
        content: `❌ Unknown wheel category: "${category}"\n\nAvailable categories:\n${getWheelCategories().map(cat => `.wheel ${cat}`).join('\n')}`,
      });
      return;
    }

    // Get options for the category
    const options = getWheelOptions(category);
    if (!options || options.length !== 8) {
      await message.reply({
        content: '❌ Error: Wheel category must have exactly 8 options.',
      });
      return;
    }

    // Start the wheel spin
    await startWheelSpin(message, category, options);

  } catch (error) {
    // Reset spinning state on error
    wheelSpinning = false;
    await ErrorHandler.handleMessageError(message, error, 'wheel');
  }
}

/**
 * Start the wheel spin process
 */
async function startWheelSpin(message: Message, category: string, options: any[]): Promise<void> {
  // Set spinning state
  wheelSpinning = true;
  
  // Set cooldown (starts when spin begins)
  wheelCooldownUntil = Date.now() + COOLDOWN_DURATION;

  try {
    // Select random result
    const selectedIndex = Math.floor(Math.random() * 8);
    const selectedOption = options[selectedIndex];

    console.log('[Wheel] Selected option:', selectedIndex, selectedOption.label);

    // Calculate final rotation
    const finalRotation = WheelImageGenerator.getFinalRotation(selectedIndex);

    // Send initial spinning message with embed
    const timestamp = Date.now();
    const gifFilename = `wheel-spin-${timestamp}.gif`;
    
    // Generate animated GIF
    console.log('[Wheel] Generating spinning GIF...');
    const gifBuffer = await WheelImageGenerator.generateSpinningGIF({
      options,
      selectedIndex,
      canvasSize: 800,
      duration: 5,
      frameCount: 40,
    });

    // Create attachment and embed
    const gifAttachment = new AttachmentBuilder(gifBuffer, { name: gifFilename });
    const initialEmbed = new EmbedBuilder()
      .setDescription(`🎡 <@${message.author.id}> is spinning the wheel...`)
      .setImage(`attachment://${gifFilename}`);

    const replyMessage = await message.reply({
      embeds: [initialEmbed],
      files: [gifAttachment],
    });

    console.log('[Wheel] GIF sent, waiting for animation...');

    // Wait for animation to complete (5 seconds)
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Generate final result PNG
    console.log('[Wheel] Generating final result PNG...');
    const pngFilename = `wheel-result-${Date.now()}.png`;
    const pngBuffer = await WheelImageGenerator.generateResultPNG({
      options,
      selectedIndex,
      finalRotation,
      canvasSize: 800,
    });

    // Create final attachment and embed
    const pngAttachment = new AttachmentBuilder(pngBuffer, { name: pngFilename });
    const finalEmbed = new EmbedBuilder()
      .setDescription(
        `🎡 <@${message.author.id}> spun the wheel!\n\n` +
        `🎯 **${selectedOption.label}**\n\n` +
        `${selectedOption.description}\n\n` +
        `⏳ Wheel cooldown: 2 minutes`
      )
      .setImage(`attachment://${pngFilename}`);

    // Edit message with final result
    await replyMessage.edit({
      content: '',
      embeds: [finalEmbed],
      files: [pngAttachment],
    });

    console.log('[Wheel] Spin completed successfully');

  } catch (error) {
    console.error('[Wheel] Error during spin:', error);
    
    // Try to send error message
    try {
      await message.reply({
        content: '❌ There was an error spinning the wheel. Please try again later.',
      });
    } catch (replyError) {
      console.error('[Wheel] Could not send error message:', replyError);
    }
    
    throw error;
  } finally {
    // Reset spinning state
    wheelSpinning = false;
  }
}

/**
 * Get current wheel state (for testing/debugging)
 */
export function getWheelState(): { cooldownUntil: number; spinning: boolean } {
  return {
    cooldownUntil: wheelCooldownUntil,
    spinning: wheelSpinning,
  };
}

/**
 * Reset wheel state (for testing/debugging)
 */
export function resetWheelState(): void {
  wheelCooldownUntil = 0;
  wheelSpinning = false;
}