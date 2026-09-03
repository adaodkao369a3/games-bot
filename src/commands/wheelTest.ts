import { Message, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { WheelImageGenerator, WheelOption } from '../utils/wheel-image-generator.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { isStaff } from '../utils/permissions.js';

/**
 * Handle the wheel test command (staff only)
 */
export async function handleWheelTestCommand(message: Message): Promise<void> {
  try {
    // Check staff permission
    if (!isStaff(message.member)) {
      await message.reply({
        content: '❌ This command is restricted to staff members only.',
      });
      return;
    }

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

    // Send initial message with embed
    const timestamp = Date.now();
    const gifFilename = `wheel-test-spin-${timestamp}.gif`;

    // Generate animated GIF
    console.log('[WheelTest] Generating spinning GIF...');
    const gifBuffer = await WheelImageGenerator.generateSpinningGIF({
      options: testOptions,
      selectedIndex,
      canvasSize: 800,
      duration: 5,
      frameCount: 40,
    });

    // Create attachment and embed
    const gifAttachment = new AttachmentBuilder(gifBuffer, { name: gifFilename });
    const initialEmbed = new EmbedBuilder()
      .setDescription(`🧪 <@${message.author.id}> is testing the wheel...`)
      .setImage(`attachment://${gifFilename}`);

    const replyMessage = await message.reply({
      embeds: [initialEmbed],
      files: [gifAttachment],
    });

    console.log('[WheelTest] GIF sent, waiting for animation...');

    // Wait for animation to complete
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Generate final result PNG
    console.log('[WheelTest] Generating final result PNG...');
    const pngFilename = `wheel-test-result-${Date.now()}.png`;
    const pngBuffer = await WheelImageGenerator.generateResultPNG({
      options: testOptions,
      selectedIndex,
      finalRotation,
      canvasSize: 800,
    });

    // Create final attachment and embed
    const pngAttachment = new AttachmentBuilder(pngBuffer, { name: pngFilename });
    const finalEmbed = new EmbedBuilder()
      .setDescription(
        `🧪 <@${message.author.id}> tested the wheel!\n\n` +
        `<a:cargando:1545149001983197364> **${selectedOption.label}**\n\n` +
        `${selectedOption.description}`
      )
      .setImage(`attachment://${pngFilename}`);

    // Edit message with final result
    await replyMessage.edit({
      content: '',
      embeds: [finalEmbed],
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