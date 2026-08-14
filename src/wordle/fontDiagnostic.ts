import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { cwd } from 'process';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = cwd();

// Load font files as base64 for embedding in SVG
const robotoBoldPath = join(PROJECT_ROOT, 'assets', 'fonts', 'Roboto-Bold.ttf');
const robotoRegularPath = join(PROJECT_ROOT, 'assets', 'fonts', 'Roboto-Regular.ttf');

let robotoBoldBase64 = '';
let robotoRegularBase64 = '';

try {
  if (existsSync(robotoBoldPath)) {
    const fontBuffer = readFileSync(robotoBoldPath);
    robotoBoldBase64 = fontBuffer.toString('base64');
    console.log('[Font Diagnostic] Loaded Roboto-Bold.ttf');
  } else {
    console.log('[Font Diagnostic] Roboto-Bold.ttf not found');
  }
} catch (error) {
  console.warn('[Font Diagnostic] Could not load Roboto-Bold.ttf:', error);
}

try {
  if (existsSync(robotoRegularPath)) {
    const fontBuffer = readFileSync(robotoRegularPath);
    robotoRegularBase64 = fontBuffer.toString('base64');
    console.log('[Font Diagnostic] Loaded Roboto-Regular.ttf');
  } else {
    console.log('[Font Diagnostic] Roboto-Regular.ttf not found');
  }
} catch (error) {
  console.warn('[Font Diagnostic] Could not load Roboto-Regular.ttf:', error);
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
   * Generate comprehensive font diagnostic image
   */
  static async generateDiagnostic(): Promise<FontDiagnosticResult> {
    console.log('=== FONT DIAGNOSTIC START ===');
    
    const environmentInfo = this.getEnvironmentInfo();
    console.log('Environment Info:', environmentInfo);
    
    let svg = this.createSVGHeader();
    let currentY = this.PADDING;
    let consoleLog = 'FONT DIAGNOSTIC LOG\n';
    consoleLog += environmentInfo + '\n\n';

    // Test 1: DejaVu Sans (plain system font)
    console.log('FONT TEST: DejaVu Sans');
    const test1SVG = this.createFontTestSection(
      'TEST 1: DejaVu Sans',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\nWORDLE PLANET',
      'DejaVu Sans',
      currentY
    );
    svg += test1SVG.svg;
    currentY += this.SECTION_HEIGHT;
    consoleLog += test1SVG.log + '\n';

    // Test 2: Arial fallback
    console.log('FONT TEST: Arial');
    const test2SVG = this.createFontTestSection(
      'TEST 2: Arial',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\nWORDLE PLANET',
      'Arial, sans-serif',
      currentY
    );
    svg += test2SVG.svg;
    currentY += this.SECTION_HEIGHT;
    consoleLog += test2SVG.log + '\n';

    // Test 3: Embedded Roboto (same as Wordle renderer)
    console.log('FONT TEST: Embedded Roboto');
    const test3SVG = this.createEmbeddedRobotoSection(
      'TEST 3: Embedded Roboto',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nWORDLE PLANET',
      currentY
    );
    svg += test3SVG.svg;
    currentY += this.SECTION_HEIGHT;
    consoleLog += test3SVG.log + '\n';

    // Test 4: Roboto Regular (if available)
    if (robotoRegularBase64) {
      console.log('FONT TEST: Roboto Regular');
      const test4SVG = this.createEmbeddedFontSection(
        'TEST 4: Roboto Regular',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nWORDLE PLANET',
        'Roboto-Regular',
        robotoRegularBase64,
        currentY
      );
      svg += test4SVG.svg;
      currentY += this.SECTION_HEIGHT;
      consoleLog += test4SVG.log + '\n';
    } else {
      console.log('FONT TEST: Roboto Regular - SKIPPED (font file not found)');
      const skipSVG = this.createSkipSection('TEST 4: Roboto Regular (font file not found)', currentY);
      svg += skipSVG;
      currentY += this.SECTION_HEIGHT;
      consoleLog += 'TEST 4: Roboto Regular - SKIPPED (font file not found)\n';
    }

    // Test 5: Roboto Bold (if available)
    if (robotoBoldBase64) {
      console.log('FONT TEST: Roboto Bold');
      const test5SVG = this.createEmbeddedFontSection(
        'TEST 5: Roboto Bold',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nWORDLE PLANET',
        'Roboto-Bold',
        robotoBoldBase64,
        currentY
      );
      svg += test5SVG.svg;
      currentY += this.SECTION_HEIGHT;
      consoleLog += test5SVG.log + '\n';
    } else {
      console.log('FONT TEST: Roboto Bold - SKIPPED (font file not found)');
      const skipSVG = this.createSkipSection('TEST 5: Roboto Bold (font file not found)', currentY);
      svg += skipSVG;
      currentY += this.SECTION_HEIGHT;
      consoleLog += 'TEST 5: Roboto Bold - SKIPPED (font file not found)\n';
    }

    // Test 6: Wordle-style cells
    console.log('FONT TEST: Wordle-style cells');
    const test6SVG = this.createWordleCellSection('TEST 6: Wordle-style cells', 'PLANET', currentY);
    svg += test6SVG.svg;
    currentY += this.SECTION_HEIGHT + 50;
    consoleLog += test6SVG.log + '\n';

    // Environment metadata section
    const metadataSVG = this.createMetadataSection(environmentInfo, currentY);
    svg += metadataSVG;

    svg += '</svg>';

    console.log('=== CONVERTING SVG TO PNG ===');
    const image = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

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
    
    // Sharp version
    try {
      const sharpVersion = sharp.versions;
      info.push(`Sharp version: ${sharpVersion.sharp}`);
      info.push(`Sharp libvips: ${sharpVersion.vips}`);
    } catch (error) {
      info.push('Sharp version: ERROR');
    }

    // Available font files
    const fontFiles = [];
    if (existsSync(robotoBoldPath)) fontFiles.push('Roboto-Bold.ttf');
    if (existsSync(robotoRegularPath)) fontFiles.push('Roboto-Regular.ttf');
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
   * Create SVG header
   */
  private static createSVGHeader(): string {
    return `
      <svg width="${this.IMAGE_WIDTH}" height="${this.IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff"/>
    `;
  }

  /**
   * Create a font test section with plain system font
   */
  private static createFontTestSection(
    label: string,
    text: string,
    fontFamily: string,
    startY: number
  ): { svg: string; log: string } {
    const lines = text.split('\n');
    let svg = `
      <rect x="${this.PADDING}" y="${startY}" width="${this.IMAGE_WIDTH - 2 * this.PADDING}" height="${this.SECTION_HEIGHT}" 
            fill="#f0f0f0" stroke="#cccccc" stroke-width="1"/>
      <text x="${this.PADDING + 10}" y="${startY + 25}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#333333">${label}</text>
    `;

    let currentY = startY + 50;
    for (const line of lines) {
      svg += `
        <text x="${this.PADDING + 10}" y="${currentY}" font-family="${fontFamily}" font-size="18" fill="#000000">${line}</text>
      `;
      currentY += 25;
    }

    const log = `Font: ${fontFamily}\nText: ${text}\nSVG text element: <text font-family="${fontFamily}">${text}</text>`;

    return { svg, log };
  }

  /**
   * Create embedded Roboto section (same as Wordle renderer)
   */
  private static createEmbeddedRobotoSection(
    label: string,
    text: string,
    startY: number
  ): { svg: string; log: string } {
    const lines = text.split('\n');
    const fontFace = robotoBoldBase64 ? `
      <style>
        @font-face {
          font-family: 'Roboto-Bold';
          src: url('data:font/truetype;charset=utf-8;base64,${robotoBoldBase64}') format('truetype');
        }
        .test-text { font-family: 'Roboto-Bold', Ubuntu, Cantarell, DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif; }
      </style>
    ` : '';

    let svg = `
      <rect x="${this.PADDING}" y="${startY}" width="${this.IMAGE_WIDTH - 2 * this.PADDING}" height="${this.SECTION_HEIGHT}" 
            fill="#f0f0f0" stroke="#cccccc" stroke-width="1"/>
      ${fontFace}
      <text x="${this.PADDING + 10}" y="${startY + 25}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#333333">${label}</text>
    `;

    let currentY = startY + 50;
    for (const line of lines) {
      svg += `
        <text x="${this.PADDING + 10}" y="${currentY}" class="test-text" font-size="18" fill="#000000">${line}</text>
      `;
      currentY += 25;
    }

    const log = `Font: Embedded Roboto-Bold (same as Wordle renderer)\nText: ${text}\nSVG: @font-face with data URI, fallback to system fonts`;

    return { svg, log };
  }

  /**
   * Create embedded font section with custom font
   */
  private static createEmbeddedFontSection(
    label: string,
    text: string,
    fontName: string,
    fontBase64: string,
    startY: number
  ): { svg: string; log: string } {
    const lines = text.split('\n');
    const fontFace = `
      <style>
        @font-face {
          font-family: '${fontName}';
          src: url('data:font/truetype;charset=utf-8;base64,${fontBase64}') format('truetype');
        }
        .test-text { font-family: '${fontName}', Arial, sans-serif; }
      </style>
    `;

    let svg = `
      <rect x="${this.PADDING}" y="${startY}" width="${this.IMAGE_WIDTH - 2 * this.PADDING}" height="${this.SECTION_HEIGHT}" 
            fill="#f0f0f0" stroke="#cccccc" stroke-width="1"/>
      ${fontFace}
      <text x="${this.PADDING + 10}" y="${startY + 25}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#333333">${label}</text>
    `;

    let currentY = startY + 50;
    for (const line of lines) {
      svg += `
        <text x="${this.PADDING + 10}" y="${currentY}" class="test-text" font-size="18" fill="#000000">${line}</text>
      `;
      currentY += 25;
    }

    const log = `Font: Embedded ${fontName}\nText: ${text}\nSVG: @font-face with data URI`;

    return { svg, log };
  }

  /**
   * Create skip section for missing fonts
   */
  private static createSkipSection(label: string, startY: number): string {
    return `
      <rect x="${this.PADDING}" y="${startY}" width="${this.IMAGE_WIDTH - 2 * this.PADDING}" height="${this.SECTION_HEIGHT}" 
            fill="#f0f0f0" stroke="#cccccc" stroke-width="1"/>
      <text x="${this.PADDING + 10}" y="${startY + 25}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#333333">${label}</text>
      <text x="${this.PADDING + 10}" y="${startY + 60}" font-family="Arial, sans-serif" font-size="16" fill="#666666">Test skipped - font file not available</text>
    `;
  }

  /**
   * Create Wordle-style cell section
   */
  private static createWordleCellSection(
    label: string,
    word: string,
    startY: number
  ): { svg: string; log: string } {
    const cellSize = 60;
    const cellPadding = 5;
    const wordLength = word.length;
    const totalWidth = wordLength * (cellSize + cellPadding) + cellPadding;
    const startX = (this.IMAGE_WIDTH - totalWidth) / 2;

    // Use the same font setup as Wordle renderer
    const fontStyle = `
      <style>
        .letter {
          font-family: "DejaVu Sans", "Liberation Sans", "Arial", sans-serif;
          font-weight: 700;
        }
      </style>
    `;

    let svg = `
      <rect x="${this.PADDING}" y="${startY}" width="${this.IMAGE_WIDTH - 2 * this.PADDING}" height="${this.SECTION_HEIGHT + 50}" 
            fill="#f0f0f0" stroke="#cccccc" stroke-width="1"/>
      ${fontStyle}
      <text x="${this.PADDING + 10}" y="${startY + 25}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#333333">${label}</text>
    `;

    // Create cells with different colors (like Wordle)
    const colors = ['#538d4e', '#b59f3b', '#3a3a3c', '#538d4e', '#b59f3b', '#3a3a3c'];
    
    for (let i = 0; i < wordLength; i++) {
      const x = startX + i * (cellSize + cellPadding);
      const y = startY + 40;
      const color = colors[i % colors.length];
      const letter = word[i];

      svg += `
        <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" 
              fill="${color}" stroke="#3a3a3c" stroke-width="2" rx="4"/>
        <text x="${x + cellSize / 2}" y="${y + cellSize / 2}" class="letter" 
              font-size="36" fill="#ffffff" 
              text-anchor="middle" dominant-baseline="middle">${letter}</text>
      `;
    }

    const log = `Font: DejaVu Sans (same as Wordle renderer)\nText: ${word}\nSVG: Wordle-style cells with current renderer font setup`;

    return { svg, log };
  }

  /**
   * Create metadata section
   */
  private static createMetadataSection(environmentInfo: string, startY: number): string {
    const lines = environmentInfo.split('\n');
    let svg = `
      <rect x="${this.PADDING}" y="${startY}" width="${this.IMAGE_WIDTH - 2 * this.PADDING}" height="${lines.length * 20 + 40}" 
            fill="#e8e8e8" stroke="#999999" stroke-width="1"/>
      <text x="${this.PADDING + 10}" y="${startY + 20}" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#333333">ENVIRONMENT METADATA</text>
    `;

    let currentY = startY + 40;
    for (const line of lines) {
      svg += `
        <text x="${this.PADDING + 10}" y="${currentY}" font-family="Arial, sans-serif" font-size="10" fill="#333333">${line}</text>
      `;
      currentY += 15;
    }

    return svg;
  }
}