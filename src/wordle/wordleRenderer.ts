import sharp from 'sharp';
import { LetterState, EvaluatedGuess } from './wordleEvaluator.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { cwd } from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = cwd();

// Load font file as base64 for embedding in SVG
const fontPath = join(PROJECT_ROOT, 'assets', 'fonts', 'Roboto-Bold.ttf');
let fontBase64 = '';
try {
  if (existsSync(fontPath)) {
    const fontBuffer = readFileSync(fontPath);
    fontBase64 = fontBuffer.toString('base64');
  }
} catch (error) {
  console.warn('[WordleRenderer] Could not load font file:', error);
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
 * Renders Wordle game boards using Sharp
 */
export class WordleRenderer {
  private static readonly BOARD_WIDTH = 600;
  private static readonly BOARD_HEIGHT = 700; // Board + keyboard
  private static readonly CELL_SIZE = 60;
  private static readonly CELL_PADDING = 5;
  private static readonly BOARD_TOP_PADDING = 20;
  private static readonly KEYBOARD_TOP_PADDING = 350;
  
  // Colors
  private static readonly COLORS = {
    background: '#121213',
    border: '#3a3a3c',
    empty: '#121213',
    correct: '#538d4e',    // Green
    wrong_position: '#b59f3b', // Yellow
    not_found: '#3a3a3c',  // Gray
    text: '#ffffff',
  };
  
  /**
   * Generate a Wordle board image
   */
  static async generateBoard(data: WordleBoardData): Promise<Buffer> {
    const { guesses, maxGuesses, wordLength, keyboardStates, isGameOver, guessCount } = data;
    
    // Create SVG with board and keyboard
    const svg = this.createBoardSVG(guesses, maxGuesses, wordLength, keyboardStates);
    
    // Convert SVG to PNG using Sharp
    const image = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();
    
    return image;
  }
  
  /**
   * Create SVG for the Wordle board
   */
  private static createBoardSVG(
    guesses: EvaluatedGuess[],
    maxGuesses: number,
    wordLength: number,
    keyboardStates: Map<string, LetterState>
  ): string {
    const boardWidth = wordLength * (this.CELL_SIZE + this.CELL_PADDING) + this.CELL_PADDING;
    const boardHeight = maxGuesses * (this.CELL_SIZE + this.CELL_PADDING) + this.BOARD_TOP_PADDING;
    const keyboardHeight = 100;
    const totalHeight = boardHeight + keyboardHeight + 20;
    
    const fontFace = fontBase64 ? `
      <style>
        @font-face {
          font-family: 'Roboto-Bold';
          src: url('data:font/truetype;charset=utf-8;base64,${fontBase64}') format('truetype');
        }
        .letter { font-family: 'Roboto-Bold', Arial, sans-serif; font-weight: bold; }
      </style>
    ` : '';
    
    let svg = `
      <svg width="${boardWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${this.COLORS.background}"/>
        ${fontFace}
    `;
    
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
        
        svg += `
          <rect x="${x}" y="${y}" width="${this.CELL_SIZE}" height="${this.CELL_SIZE}" 
                fill="${fillColor}" stroke="${this.COLORS.border}" stroke-width="2" rx="4"/>
        `;
        
        if (letter) {
          const centerX = x + this.CELL_SIZE / 2;
          const centerY = y + this.CELL_SIZE / 2 + this.CELL_SIZE * 0.35;
          svg += `
            <text x="${centerX}" y="${centerY}" class="letter" 
                  font-size="32" fill="${this.COLORS.text}" 
                  text-anchor="middle" font-weight="bold">${letter}</text>
          `;
        }
      }
    }
    
    // Draw keyboard
    svg += this.createKeyboardSVG(keyboardStates, boardWidth, boardHeight + 20);
    
    svg += '</svg>';
    
    return svg;
  }
  
  /**
   * Create SVG for the keyboard
   */
  private static createKeyboardSVG(
    keyboardStates: Map<string, LetterState>,
    boardWidth: number,
    startY: number
  ): string {
    const rows = [
      'QWERTYUIOP',
      'ASDFGHJKL',
      'ZXCVBNM'
    ];
    
    const keySize = 30;
    const keyPadding = 4;
    let svg = '';
    
    let currentY = startY;
    
    for (const row of rows) {
      const rowWidth = row.length * (keySize + keyPadding) + keyPadding;
      const startX = (boardWidth - rowWidth) / 2;
      
      for (let i = 0; i < row.length; i++) {
        const letter = row[i];
        const x = startX + i * (keySize + keyPadding);
        
        let fillColor = this.COLORS.empty;
        const state = keyboardStates.get(letter);
        
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
        
        svg += `
          <rect x="${x}" y="${currentY}" width="${keySize}" height="${keySize}" 
                fill="${fillColor}" stroke="${this.COLORS.border}" stroke-width="1" rx="3"/>
        `;
        
        const centerX = x + keySize / 2;
        const centerY = currentY + keySize / 2 + keySize * 0.3;
        svg += `
          <text x="${centerX}" y="${centerY}" class="letter" 
                font-size="14" fill="${this.COLORS.text}" 
                text-anchor="middle" font-weight="bold">${letter}</text>
        `;
      }
      
      currentY += keySize + keyPadding;
    }
    
    return svg;
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
        return this.COLORS.empty;
    }
  }
  
  /**
   * Get emoji for a letter state
   */
  static getStateEmoji(state: LetterState): string {
    switch (state) {
      case LetterState.CORRECT:
        return '🟩';
      case LetterState.WRONG_POSITION:
        return '🟨';
      case LetterState.NOT_FOUND:
        return '⬛';
      default:
        return '⬜';
    }
  }
}