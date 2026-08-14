import { Message, AttachmentBuilder } from 'discord.js';
import { WheelImageGenerator, WheelOption } from '../utils/wheel-image-generator.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Handle the wheel test command
 */
export async function handleWheelTestCommand(message: Message): Promise<void> {
  try {
    console.log('[WheelTest] Generating test wheel');

    // Create test options with obvious labels
    const testOptions: WheelOption[] = [
      { label: 'ONE', description: 'Test option 1' },
      { label: 'TWO', description: 'Test option 2' },
      { label: 'THREE', description: 'Test option 3' },
      { label: 'FOUR', description: 'Test option 4' },
      { label: 'FIVE', description: 'Test option 5' },
      { label: 'SIX', description: 'Test option 6' },
      { label: 'SEVEN', description: 'Test option 7' },
      { label: 'EIGHT', description: 'Test option 8' },
    ];

    // Select a random result
    const selectedIndex = Math.floor(Math.random() * 8);
    const selectedOption = testOptions[selectedIndex];

    console.log('[WheelTest] Selected option:', selectedIndex, selectedOption.label);

    // Calculate final rotation
    const finalRotation = WheelImageGenerator.getFinalRotation(selectedIndex);

    // Send initial message
    const initialContent = `🧪 <@${message.author.id}> is testing the wheel...`;
    const replyMessage = await message.reply({
      content: initialContent,
    });

    // Generate animated GIF
    console.log('[WheelTest] Generating spinning GIF...');
    const gifBuffer = await WheelImageGenerator.generateSpinningGIF({
      options: testOptions,
      selectedIndex,
      canvasSize: 800,
      duration: 5,
      frameCount: 40,
    });

    // Create attachment
    const gifAttachment = new AttachmentBuilder(gifBuffer, { name: 'wheel-test-spin.gif' });

    // Edit message with GIF
    await replyMessage.edit({
      content: initialContent,
      files: [gifAttachment],
    });

    console.log('[WheelTest] GIF sent, waiting for animation...');

    // Wait for animation to complete
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Generate final result PNG
    console.log('[WheelTest] Generating final result PNG...');
    const pngBuffer = await WheelImageGenerator.generateResultPNG({
      options: testOptions,
      selectedIndex,
      finalRotation,
      canvasSize: 800,
    });

    // Create final attachment
    const pngAttachment = new AttachmentBuilder(pngBuffer, { name: 'wheel-test-result.png' });

    // Create final message content
    const finalContent = `🧪 <@${message.author.id}> tested the wheel!\n\n**${selectedOption.label}**\n\n${selectedOption.description}`;

    // Edit message with final result
    await replyMessage.edit({
      content: finalContent,
      files: [pngAttachment],
    });

    console.log('[WheelTest] Test completed successfully');

  } catch (error) {
    console.error('[WheelTest] Error during test:', error);
    await message.reply({
      content: '❌ Error during wheel test. Check console for details.',
    });
  }
}