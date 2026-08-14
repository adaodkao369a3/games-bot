import { createCanvas, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

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
      console.log('[Font Diagnostic] Font loaded: assets/fonts/Roboto-Bold.ttf');
    } else {
      console.error('[Font Diagnostic] Font registration failed');
    }
  } else {
    console.error('[Font Diagnostic] Font file not found: assets/fonts/Roboto-Bold.ttf');
  }
} catch (error) {
  console.error('[Font Diagnostic] Failed to load font:', error);
}

export interface FontDiagnosticResult {
  image: Buffer;
  consoleLog: string;
}

/**
 * Font diagnostic utility to test font rendering in the Railway environment
 */
export class FontDiagnostic {
  private static readonly IMAGE_WIDTH = 800;
  private static readonly IMAGE_HEIGHT = 1200;
  private static readonly SECTION_HEIGHT = 150;
  private static readonly PADDING = 20;

  /**
   * Generate comprehensive font diagnostic image using Canvas
   */
  static async generateDiagnostic(): Promise<FontDiagnosticResult> {
    console.log('=== FONT DIAGNOSTIC START ===');
    
    const environmentInfo = this.getEnvironmentInfo();
    console.log('Environment Info:', environmentInfo);
    
    let consoleLog = 'FONT DIAGNOSTIC LOG\n';
    consoleLog += environmentInfo + '\n\n';

    // Calculate total height
    const sectionCount = 3; // Canvas test, Wordle cells, Metadata
    const totalHeight = this.PADDING + (sectionCount * this.SECTION_HEIGHT) + 200;
    
    // Create canvas
    const canvas = createCanvas(this.IMAGE_WIDTH, totalHeight);
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.IMAGE_WIDTH, totalHeight);
    
    let currentY = this.PADDING;

    // Test 1: Canvas text rendering with Roboto
    console.log('FONT TEST: Canvas Roboto');
    const test1Log = this.createCanvasTextSection(
      ctx,
      'TEST 1: Canvas Roboto Font',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\nWORDLE\nPLANET',
      currentY
    );
    currentY += this.SECTION_HEIGHT;
    consoleLog += test1Log + '\n';

    // Test 2: Wordle-style cells with Canvas
    console.log('FONT TEST: Wordle-style cells');
    const test2Log = this.createWordleCellSection(ctx, 'TEST 2: Wordle-style cells', 'PLANET', currentY);
    currentY += this.SECTION_HEIGHT + 50;
    consoleLog += test2Log + '\n';

    // Environment metadata section
    this.createMetadataSection(ctx, environmentInfo, currentY);

    // Convert to buffer
    const image = canvas.toBuffer('image/png');

    console.log('=== FONT DIAGNOSTIC COMPLETE ===');
    console.log('Generated image buffer size:', image.length);

    return {
      image,
      consoleLog
    };
  }

  /**
   * Get environment information
   */
  private static getEnvironmentInfo(): string {
    const info: string[] = [];
    
    info.push(`Node version: ${process.version}`);
    info.push(`Platform: ${process.platform}`);
    info.push(`Architecture: ${process.arch}`);
    info.push(`CWD: ${process.cwd()}`);
    info.push(`@napi-rs/canvas: INSTALLED`);
    info.push(`Font loaded: ${fontLoaded ? 'YES' : 'NO'}`);
    
    if (fontLoaded) {
      info.push(`Available font families: ${GlobalFonts.families.map(f => f.family).join(', ')}`);
    }

    // Available font files
    const fontFiles = [];
    if (existsSync(fontPath)) fontFiles.push('Roboto-Bold.ttf');
    info.push(`Available font files: ${fontFiles.length > 0 ? fontFiles.join(', ') : 'None'}`);

    // Fontconfig detection
    try {
      const fcList = execSync('fc-list', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      info.push(`fontconfig: AVAILABLE (${fcList.split('\n').length} fonts)`);
    } catch (error) {
      info.push('fontconfig: NOT AVAILABLE');
    }

    // Font matching attempts
    const fontsToCheck = ['DejaVu Sans', 'Arial', 'Roboto'];
    for (const font of fontsToCheck) {
      try {
        const match = execSync(`fc-match "${font}"`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        info.push(`fc-match "${font}": ${match.trim()}`);
      } catch (error) {
        info.push(`fc-match "${font}": NOT FOUND`);
      }
    }

    return info.join('\n');
  }

  /**
   * Create Canvas text section
   */
  private static createCanvasTextSection(
    ctx: SKRSContext2D,
    label: string,
    text: string,
    startY: number
  ): string {
    const lines = text.split('\n');
    
    // Background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(this.PADDING, startY, this.IMAGE_WIDTH - 2 * this.PADDING, this.SECTION_HEIGHT);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.PADDING, startY, this.IMAGE_WIDTH - 2 * this.PADDING, this.SECTION_HEIGHT);
    
    // Label
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, this.PADDING + 10, startY + 10);
    
    // Text lines
    let currentY = startY + 40;
    for (const line of lines) {
      ctx.fillStyle = '#000000';
      ctx.font = fontLoaded ? 'bold 18px Roboto' : 'bold 18px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(line, this.PADDING + 10, currentY);
      currentY += 25;
    }

    const log = `Font: ${fontLoaded ? 'Roboto (Canvas)' : 'Arial (fallback)'}\nText: ${text}\nCanvas text rendering with bundled font`;

    return log;
  }

  /**
   * Create Wordle-style cell section using Canvas
   */
  private static createWordleCellSection(
    ctx: SKRSContext2D,
    label: string,
    word: string,
    startY: number
  ): string {
    const cellSize = 60;
    const cellPadding = 5;
    const wordLength = word.length;
    const totalWidth = wordLength * (cellSize + cellPadding) + cellPadding;
    const startX = (this.IMAGE_WIDTH - totalWidth) / 2;

    // Background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(this.PADDING, startY, this.IMAGE_WIDTH - 2 * this.PADDING, this.SECTION_HEIGHT + 50);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.PADDING, startY, this.IMAGE_WIDTH - 2 * this.PADDING, this.SECTION_HEIGHT + 50);
    
    // Label
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, this.PADDING + 10, startY + 10);

    // Create cells with different colors (like Wordle)
    const colors = ['#538d4e', '#b59f3b', '#3a3a3c', '#538d4e', '#b59f3b', '#3a3a3c'];
    
    for (let i = 0; i < wordLength; i++) {
      const x = startX + i * (cellSize + cellPadding);
      const y = startY + 40;
      const color = colors[i % colors.length];
      const letter = word[i];

      // Draw cell
      ctx.fillStyle = color;
      this.roundRect(ctx, x, y, cellSize, cellSize, 4);
      ctx.fill();
      
      // Draw border
      ctx.strokeStyle = '#3a3a3c';
      ctx.lineWidth = 2;
      this.roundRect(ctx, x, y, cellSize, cellSize, 4);
      ctx.stroke();
      
      // Draw letter
      const centerX = x + cellSize / 2;
      const centerY = y + cellSize / 2;
      
      ctx.fillStyle = '#ffffff';
      ctx.font = fontLoaded ? 'bold 36px Roboto' : 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, centerX, centerY);
    }

    const log = `Font: ${fontLoaded ? 'Roboto (Canvas)' : 'Arial (fallback)'}\nText: ${word}\nCanvas Wordle-style cells with bundled font`;

    return log;
  }

  /**
   * Create metadata section using Canvas
   */
  private static createMetadataSection(ctx: SKRSContext2D, environmentInfo: string, startY: number): void {
    const lines = environmentInfo.split('\n');
    
    // Background
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(this.PADDING, startY, this.IMAGE_WIDTH - 2 * this.PADDING, lines.length * 20 + 40);
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.PADDING, startY, this.IMAGE_WIDTH - 2 * this.PADDING, lines.length * 20 + 40);
    
    // Title
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ENVIRONMENT METADATA', this.PADDING + 10, startY + 10);
    
    // Info lines
    let currentY = startY + 30;
    for (const line of lines) {
      ctx.fillStyle = '#333333';
      ctx.font = '10px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(line, this.PADDING + 10, currentY);
      currentY += 15;
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
}