import { createCanvas, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';
import { LetterState, EvaluatedGuess } from './wordleEvaluator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = cwd();

// Font loading using GlobalFonts
const fontPath = join(PROJECT_ROOT, 'assets', 'fonts', 'Roboto-Bold.ttf');
let fontLoaded = false;

try {
  if (existsSync(fontPath)) {
    const success = GlobalFonts.registerFromPath(fontPath, 'Roboto');
    if (success) {
      fontLoaded = true;
      console.log('[WordleRenderer] Font loaded: assets/fonts/Roboto-Bold.ttf');
      console.log('[WordleRenderer] Available font families:', GlobalFonts.families.map(f => f.family));
    } else {
      console.error('[WordleRenderer] Font registration failed');
    }
  } else {
    console.error('[WordleRenderer] Font file not found: assets/fonts/Roboto-Bold.ttf');
  }
} catch (error) {
  console.error('[WordleRenderer] Failed to load font:', error);
}

export interface WordleBoardData {
  guesses: EvaluatedGuess[];
  maxGuesses: number;
  wordLength: number;
  keyboardStates: Map<string, LetterState>;
  isGameOver: boolean;
  guessCount: number;
}

/**
 * Renders Wordle game boards using @napi-rs/canvas
 */
export class WordleRenderer {
  private static readonly BOARD_WIDTH = 600;
  private static readonly BOARD_HEIGHT = 700; // Board + keyboard
  private static readonly CELL_SIZE = 60;
  private static readonly CELL_PADDING = 5;
  private static readonly BOARD_TOP_PADDING = 20;
  private static readonly KEYBOARD_TOP_PADDING = 560;
  
  // Colors
  private static readonly COLORS = {
    background: '#121213',
    border: '#3a3a3c',
    empty: '#121213',
    correct: '#538d4e',    // Green
    wrong_position: '#b59f3b', // Yellow
    not_found: '#3a3a3c',  // Gray
    unused: '#818384',     // Light gray for unused keys
    text: '#ffffff',
  };
  
  /**
   * Generate a Wordle board image using Canvas
   */
  static async generateBoard(data: WordleBoardData): Promise<Buffer> {
    const { guesses, maxGuesses, wordLength, keyboardStates, isGameOver, guessCount } = data;
    
    console.log('[WordleRenderer] Generating board with', guesses.length, 'guesses');
    
    // Check if font is loaded
    if (!fontLoaded) {
      throw new Error('[WordleRenderer] Font not loaded - cannot render board');
    }
    
    // Calculate dimensions
    const boardWidth = wordLength * (this.CELL_SIZE + this.CELL_PADDING) + this.CELL_PADDING;
    const boardHeight = maxGuesses * (this.CELL_SIZE + this.CELL_PADDING) + this.BOARD_TOP_PADDING;
    const keyboardHeight = 130; // Increased for larger keys
    const totalHeight = boardHeight + keyboardHeight + 20;

    // Create canvas
    const canvas = createCanvas(boardWidth, totalHeight);
    const ctx = canvas.getContext('2d');
    
    // Set font for rendering
    ctx.font = 'bold 36px Roboto';
    
    // Draw background
    ctx.fillStyle = this.COLORS.background;
    ctx.fillRect(0, 0, boardWidth, totalHeight);
    
    // Draw board cells
    for (let row = 0; row < maxGuesses; row++) {
      for (let col = 0; col < wordLength; col++) {
        const x = this.CELL_PADDING + col * (this.CELL_SIZE + this.CELL_PADDING);
        const y = this.BOARD_TOP_PADDING + row * (this.CELL_SIZE + this.CELL_PADDING);

        let fillColor = this.COLORS.empty;
        let letter = '';

        if (row < guesses.length) {
          const guess = guesses[row];
          letter = guess.word[col].toUpperCase();
          const state = guess.result.letters[col];

          console.log('[WordleRenderer] Row:', row, 'Col:', col, 'Letter:', letter, 'State:', state);

          switch (state) {
            case LetterState.CORRECT:
              fillColor = this.COLORS.correct;
              break;
            case LetterState.WRONG_POSITION:
              fillColor = this.COLORS.wrong_position;
              break;
            case LetterState.NOT_FOUND:
              fillColor = this.COLORS.not_found;
              break;
          }
        }

        // Draw cell
        ctx.fillStyle = fillColor;
        this.roundRect(ctx, x, y, this.CELL_SIZE, this.CELL_SIZE, 4);
        ctx.fill();

        // Draw border
        ctx.strokeStyle = this.COLORS.border;
        ctx.lineWidth = 2;
        this.roundRect(ctx, x, y, this.CELL_SIZE, this.CELL_SIZE, 4);
        ctx.stroke();

        // Draw letter
        if (letter) {
          const centerX = x + this.CELL_SIZE / 2;
          const centerY = y + this.CELL_SIZE / 2;

          ctx.fillStyle = this.COLORS.text;
          ctx.font = 'bold 36px Roboto';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(letter, centerX, centerY);
        }
      }
    }
    
    // Draw keyboard
    this.drawKeyboard(ctx, keyboardStates, boardWidth, boardHeight + 20);
    
    // Convert to buffer
    const buffer = canvas.toBuffer('image/png');
    
    console.log('[WordleRenderer] Generated image buffer size:', buffer.length);
    
    return buffer;
  }
  
  /**
   * Draw keyboard using Canvas
   */
  private static drawKeyboard(
    ctx: SKRSContext2D,
    keyboardStates: Map<string, LetterState>,
    boardWidth: number,
    startY: number
  ): void {
    const rows = [
      'QWERTYUIOP',
      'ASDFGHJKL',
      'ZXCVBNM'
    ];
    
    const horizontalPadding = 12;
    let keySize = 35;
    const keyPadding = 6;
    
    // Calculate maximum key width that fits with padding
    const availableWidth = boardWidth - (horizontalPadding * 2);
    const maxKeysInRow = 10; // QWERTYUIOP has 10 keys
    const maxKeyWidth = (availableWidth - ((maxKeysInRow - 1) * keyPadding)) / maxKeysInRow;
    keySize = Math.min(keySize, maxKeyWidth);
    
    let currentY = startY;
    
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const rowWidth = row.length * keySize + (row.length - 1) * keyPadding;
      const startX = (boardWidth - rowWidth) / 2;
      
      for (let i = 0; i < row.length; i++) {
        const letter = row[i];
        const x = startX + i * (keySize + keyPadding);
        
        // Determine key color based on state with proper priority
        let fillColor = this.COLORS.unused; // Default to unused (light gray)
        const state = keyboardStates.get(letter) ?? keyboardStates.get(letter.toLowerCase());
        
        if (state) {
          switch (state) {
            case LetterState.CORRECT:
              fillColor = this.COLORS.correct;
              break;
            case LetterState.WRONG_POSITION:
              fillColor = this.COLORS.wrong_position;
              break;
            case LetterState.NOT_FOUND:
              fillColor = this.COLORS.not_found;
              break;
          }
        }
        
        // Draw key background
        ctx.fillStyle = fillColor;
        this.roundRect(ctx, x, currentY, keySize, keySize, 4);
        ctx.fill();
        
        // Draw border (only for unused keys to match Wordle style)
        if (!state) {
          ctx.strokeStyle = this.COLORS.border;
          ctx.lineWidth = 2;
          this.roundRect(ctx, x, currentY, keySize, keySize, 4);
          ctx.stroke();
        }
        
        // Draw letter
        const centerX = x + keySize / 2;
        const centerY = currentY + keySize / 2;
        
        ctx.fillStyle = this.COLORS.text;
        ctx.font = 'bold 18px Roboto';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, centerX, centerY);
      }
      
      currentY += keySize + keyPadding;
    }
  }
  
  /**
   * Helper method to draw rounded rectangles
   */
  private static roundRect(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
  
  /**
   * Get color for a letter state
   */
  static getStateColor(state: LetterState): string {
    switch (state) {
      case LetterState.CORRECT:
        return this.COLORS.correct;
      case LetterState.WRONG_POSITION:
        return this.COLORS.wrong_position;
      case LetterState.NOT_FOUND:
        return this.COLORS.not_found;
      default:
        return this.COLORS.unused;
    }
  }
  
  /**
   * Get emoji for a letter state
   */
  static getStateEmoji(state: LetterState): string {
    switch (state) {
      case LetterState.CORRECT:
        return '<a:statustyping:1545155645630582794>';
      case LetterState.WRONG_POSITION:
        return '🟨';
      case LetterState.NOT_FOUND:
        return '⬛';
      default:
        return '⬜';
    }
  }
}