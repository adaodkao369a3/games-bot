import { Message, AttachmentBuilder } from 'discord.js';
import { createCanvas, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = cwd();

// Font loading using GlobalFonts (same approach as Wordle)
const fontPath = join(PROJECT_ROOT, 'assets', 'fonts', 'Roboto-Bold.ttf');
let fontLoaded = false;

try {
  if (existsSync(fontPath)) {
    const success = GlobalFonts.registerFromPath(fontPath, 'Roboto');
    if (success) {
      fontLoaded = true;
      console.log('[WheelFontTest] Font loaded: assets/fonts/Roboto-Bold.ttf');
    } else {
      console.error('[WheelFontTest] Font registration failed');
    }
  } else {
    console.error('[WheelFontTest] Font file not found: assets/fonts/Roboto-Bold.ttf');
  }
} catch (error) {
  console.error('[WheelFontTest] Failed to load font:', error);
}

/**
 * Handle the wheel font test command
 */
export async function handleWheelFontTestCommand(message: Message): Promise<void> {
  try {
    console.log('[WheelFontTest] Generating font test image');

    if (!fontLoaded) {
      await message.reply({
        content: '❌ Font not loaded. Cannot generate test image.',
      });
      return;
    }

    // Create canvas
    const canvas = createCanvas(800, 600);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 800, 600);

    // Test text
    const testTexts = [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'abcdefghijklmnopqrstuvwxyz',
      'FURRY PFP',
      'TRUTH OR DARE',
      'PUNISHMENT',
      'ACT LIKE AN NPC',
      'WHEEL FONT TEST',
    ];

    let y = 50;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (const text of testTexts) {
      ctx.font = 'bold 32px Roboto';
      ctx.fillText(text, 400, y);
      y += 60;
    }

    // Add diagnostic info
    ctx.font = '16px Roboto';
    ctx.fillStyle = '#333333';
    ctx.fillText(`Font loaded: ${fontLoaded ? 'YES' : 'NO'}`, 400, y + 20);
    ctx.fillText(`Font path: ${fontPath}`, 400, y + 45);
    ctx.fillText(`Available fonts: ${GlobalFonts.families.map(f => f.family).join(', ')}`, 400, y + 70);

    // Convert to buffer
    const buffer = canvas.toBuffer('image/png');

    console.log('[WheelFontTest] Generated test image buffer size:', buffer.length);

    // Create attachment
    const attachment = new AttachmentBuilder(buffer, { name: 'wheel-font-test.png' });

    // Send message
    await message.reply({
      content: '🎨 Wheel font test image:',
      files: [attachment],
    });

    console.log('[WheelFontTest] Font test completed successfully');

  } catch (error) {
    console.error('[WheelFontTest] Error generating font test:', error);
    await message.reply({
      content: '❌ Error generating font test image.',
    });
  }
}