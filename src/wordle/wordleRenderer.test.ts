import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WordleRenderer } from './wordleRenderer.js';
import { LetterState } from './wordleEvaluator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test font rendering by generating a simple image with all letters
 */
async function testFontRendering(): Promise<void> {
  console.log('[Font Test] Starting font rendering test...');

  try {
    // Load font
    const fontPath = join(__dirname, '../../assets/fonts/Roboto-Bold.ttf');
    console.log('[Font Test] Loading font from:', fontPath);
    const fontBuffer = await readFile(fontPath);
    const base64Font = fontBuffer.toString('base64');
    console.log('[Font Test] Font loaded, base64 length:', base64Font.length);

    // Create test SVG with all letters
    const svg = `
      <svg width="800" height="200" xmlns="http://www.w3.org/2000/svg">
        <style>
          @font-face {
            font-family: 'Roboto';
            src: url('data:font/truetype;charset=utf-8;base64,${base64Font}') format('truetype');
            font-weight: bold;
          }
          .letter { font-family: 'Roboto', 'Arial', 'Helvetica', 'DejaVu Sans', 'Liberation Sans', sans-serif; font-weight: bold; }
        </style>
        <rect width="100%" height="100%" fill="#121213"/>
        <text x="20" y="50" class="letter" font-size="32" fill="#ffffff">ABCDEFGHIJKLMNOPQRSTUVWXYZ</text>
        <text x="20" y="100" class="letter" font-size="48" fill="#ffffff">WORDLE</text>
        <text x="20" y="150" class="letter" font-size="24" fill="#ffffff">abcdefghijklmnopqrstuvwxyz</text>
      </svg>
    `;

    console.log('[Font Test] SVG created, length:', svg.length);

    // Convert to PNG
    const image = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    console.log('[Font Test] Generated image buffer size:', image.length);

    // Save test image
    const testPath = join(__dirname, '../../font-test.png');
    await sharp(image).toFile(testPath);
    console.log('[Font Test] Test image saved to:', testPath);

    console.log('[Font Test] ✓ Font rendering test completed successfully');
  } catch (error) {
    console.error('[Font Test] ✗ Font rendering test failed:', error);
    throw error;
  }
}

export { testFontRendering };

/**
 * Test keyboard rendering with full keyboard layout
 */
async function testKeyboardRendering(): Promise<void> {
  console.log('[Keyboard Test] Starting keyboard rendering test...');

  try {
    // Create keyboard states for all letters to test full layout
    const keyboardStates = new Map<string, LetterState>([
      // Top row: QWERTYUIOP
      ['Q', LetterState.NOT_FOUND],
      ['W', LetterState.WRONG_POSITION],
      ['E', LetterState.CORRECT],
      ['R', LetterState.NOT_FOUND],
      ['T', LetterState.WRONG_POSITION],
      ['Y', LetterState.CORRECT],
      ['U', LetterState.NOT_FOUND],
      ['I', LetterState.WRONG_POSITION],
      ['O', LetterState.CORRECT],
      ['P', LetterState.NOT_FOUND],
      // Middle row: ASDFGHJKL
      ['A', LetterState.WRONG_POSITION],
      ['S', LetterState.CORRECT],
      ['D', LetterState.NOT_FOUND],
      ['F', LetterState.WRONG_POSITION],
      ['G', LetterState.CORRECT],
      ['H', LetterState.NOT_FOUND],
      ['J', LetterState.WRONG_POSITION],
      ['K', LetterState.CORRECT],
      ['L', LetterState.NOT_FOUND],
      // Bottom row: ZXCVBNM
      ['Z', LetterState.NOT_FOUND],
      ['X', LetterState.WRONG_POSITION],
      ['C', LetterState.CORRECT],
      ['V', LetterState.NOT_FOUND],
      ['B', LetterState.WRONG_POSITION],
      ['N', LetterState.CORRECT],
      ['M', LetterState.NOT_FOUND],
    ]);

    console.log('[Keyboard Test] Keyboard states:', Object.fromEntries(keyboardStates));

    // Generate board with empty guesses but with keyboard states
    const boardData = {
      guesses: [],
      maxGuesses: 5,
      wordLength: 6,
      keyboardStates,
      isGameOver: false,
      guessCount: 0,
    };

    const buffer = await WordleRenderer.generateBoard(boardData);
    console.log('[Keyboard Test] Generated image buffer size:', buffer.length);

    // Save test image
    const testPath = join(__dirname, '../../keyboard-test.png');
    await sharp(buffer).toFile(testPath);
    console.log('[Keyboard Test] Test image saved to:', testPath);

    console.log('[Keyboard Test] ✓ Keyboard rendering test completed successfully');
  } catch (error) {
    console.error('[Keyboard Test] ✗ Keyboard rendering test failed:', error);
    throw error;
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testType = process.argv[2];
  
  if (testType === 'keyboard') {
    testKeyboardRendering()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  } else {
    testFontRendering()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  }
}
