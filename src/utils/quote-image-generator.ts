import { createCanvas, GlobalFonts, loadImage, SKRSContext2D } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = cwd();

// Font loading using GlobalFonts (same approach as SmashImageGenerator)
const fontPath = join(PROJECT_ROOT, 'assets', 'fonts', 'Roboto-Bold.ttf');
let fontLoaded = false;

try {
  if (existsSync(fontPath)) {
    const success = GlobalFonts.registerFromPath(fontPath, 'Roboto');
    if (success) {
      fontLoaded = true;
      console.log('[QuoteImageGenerator] Font loaded: assets/fonts/Roboto-Bold.ttf');
    } else {
      console.error('[QuoteImageGenerator] Font registration failed');
    }
  } else {
    console.error('[QuoteImageGenerator] Font file not found: assets/fonts/Roboto-Bold.ttf');
  }
} catch (error) {
  console.error('[QuoteImageGenerator] Failed to load font:', error);
}

export interface QuoteMessageData {
  username: string;
  content: string;
  avatarBuffer: Buffer;
}

export interface QuoteImageData {
  message1: QuoteMessageData;
  message2?: QuoteMessageData; // Optional for two-message quotes
  style: 'color' | 'bw';
}

export class QuoteImageGenerator {
  private static readonly IMAGE_WIDTH = 1200;
  private static readonly IMAGE_HEIGHT = 800;
  private static readonly PFP_SIZE = 500; // Large PFP for background (30% of composition)
  private static readonly PFP_OPACITY = 0.25; // Faded for background

  /**
   * Generate a quote image
   */
  static async generateQuoteImage(data: QuoteImageData): Promise<Buffer> {
    if (!fontLoaded) {
      throw new Error('[QuoteImageGenerator] Font not loaded - cannot render image');
    }

    const { message1, message2, style } = data;
    const isTwoMessage = !!message2;

    // Create canvas
    const canvas = createCanvas(this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Load images
    const avatar1 = await loadImage(message1.avatarBuffer);
    const avatar2 = message2 ? await loadImage(message2.avatarBuffer) : null;

    // Apply style filter
    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }

    // Draw background
    this.drawBackground(ctx, style);

    // Reset filter for text
    ctx.filter = 'none';

    if (isTwoMessage) {
      // Two-message layout: top-left and bottom-right
      this.drawTwoMessageLayout(ctx, avatar1, avatar2, message1, message2!, style);
    } else {
      // Single message layout: centered
      this.drawSingleMessageLayout(ctx, avatar1, message1, style);
    }

    return canvas.toBuffer('image/png');
  }

  /**
   * Draw background
   */
  private static drawBackground(ctx: SKRSContext2D, style: 'color' | 'bw'): void {
    // Mostly black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
  }

  /**
   * Draw single message layout
   */
  private static drawSingleMessageLayout(
    ctx: SKRSContext2D,
    avatar: any,
    message: QuoteMessageData,
    style: 'color' | 'bw'
  ): void {
    // Draw faded PFP in background (centered, large)
    ctx.save();
    ctx.globalAlpha = this.PFP_OPACITY;
    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }
    this.drawCoverImage(ctx, avatar, this.IMAGE_WIDTH / 2 - this.PFP_SIZE / 2, this.IMAGE_HEIGHT / 2 - this.PFP_SIZE / 2, this.PFP_SIZE, this.PFP_SIZE);
    ctx.restore();

    // Draw soft gradient overlay for blending
    this.drawGradientOverlay(ctx, style);

    // Draw quote text (centered, clean)
    this.drawQuoteText(ctx, message.content, this.IMAGE_WIDTH / 2, this.IMAGE_HEIGHT / 2 - 30, this.IMAGE_WIDTH - 300);

    // Draw username underneath (smaller)
    this.drawUsername(ctx, message.username, this.IMAGE_WIDTH / 2, this.IMAGE_HEIGHT / 2 + 100);
  }

  /**
   * Draw two-message layout (reply chain)
   */
  private static drawTwoMessageLayout(
    ctx: SKRSContext2D,
    avatar1: any,
    avatar2: any,
    message1: QuoteMessageData,
    message2: QuoteMessageData,
    style: 'color' | 'bw'
  ): void {
    // Message B (original context) - TOP LEFT
    ctx.save();
    ctx.globalAlpha = this.PFP_OPACITY;
    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }
    this.drawCoverImage(ctx, avatar1, 50, 50, this.PFP_SIZE, this.PFP_SIZE);
    ctx.restore();

    // Message A (reply) - BOTTOM RIGHT
    ctx.save();
    ctx.globalAlpha = this.PFP_OPACITY;
    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }
    this.drawCoverImage(ctx, avatar2, this.IMAGE_WIDTH - this.PFP_SIZE - 50, this.IMAGE_HEIGHT - this.PFP_SIZE - 50, this.PFP_SIZE, this.PFP_SIZE);
    ctx.restore();

    // Draw soft gradient overlay for blending
    this.drawGradientOverlay(ctx, style);

    // Message B (top-left) - original context
    this.drawQuoteText(ctx, message1.content, 50 + this.PFP_SIZE / 2, 50 + this.PFP_SIZE / 2 - 40, this.IMAGE_WIDTH / 2 - 150);
    this.drawUsername(ctx, message1.username, 50 + this.PFP_SIZE / 2, 50 + this.PFP_SIZE / 2 + 80);

    // Message A (bottom-right) - reply
    this.drawQuoteText(ctx, message2.content, this.IMAGE_WIDTH - 50 - this.PFP_SIZE / 2, this.IMAGE_HEIGHT - 50 - this.PFP_SIZE / 2 - 40, this.IMAGE_WIDTH / 2 - 150);
    this.drawUsername(ctx, message2.username, this.IMAGE_WIDTH - 50 - this.PFP_SIZE / 2, this.IMAGE_HEIGHT - 50 - this.PFP_SIZE / 2 + 80);
  }

  /**
   * Draw soft gradient overlay for blending PFP into black background
   */
  private static drawGradientOverlay(ctx: SKRSContext2D, style: 'color' | 'bw'): void {
    // Create a radial gradient from center to edges
    const gradient = ctx.createRadialGradient(
      this.IMAGE_WIDTH / 2, this.IMAGE_HEIGHT / 2, 0,
      this.IMAGE_WIDTH / 2, this.IMAGE_HEIGHT / 2, this.IMAGE_WIDTH / 1.3
    );
    
    if (style === 'color') {
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.3)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    } else {
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.4)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
  }

  /**
   * Draw vignette overlay for text readability
   */
  private static drawVignette(ctx: SKRSContext2D): void {
    const gradient = ctx.createRadialGradient(
      this.IMAGE_WIDTH / 2, this.IMAGE_HEIGHT / 2, 0,
      this.IMAGE_WIDTH / 2, this.IMAGE_HEIGHT / 2, this.IMAGE_WIDTH / 1.5
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
  }

  /**
   * Draw username with shadow
   */
  private static drawUsername(
    ctx: SKRSContext2D,
    username: string,
    x: number,
    y: number,
    isProminent: boolean = false
  ): void {
    const fontSize = 24;
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `${fontSize}px Roboto`;

    // Draw subtle shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    // Draw username (subtle gray)
    ctx.fillStyle = '#888888';
    ctx.fillText(`— ${username}`, x, y);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  /**
   * Draw quote text with word wrapping and shadow
   */
  private static drawQuoteText(
    ctx: SKRSContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    isProminent: boolean = false
  ): void {
    const fontSize = 32;
    const lineHeight = fontSize * 1.5;
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${fontSize}px Roboto`;

    // Draw subtle shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Wrap text with quotation marks
    const lines = this.wrapText(ctx, `"${text}"`, maxWidth);
    
    // Draw each line
    lines.forEach((line, index) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(line, x, y + (index * lineHeight));
    });

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  /**
   * Wrap text to fitwithin max width
   */
  private static wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + ' ' + word).width;
      
      if (width < maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    
    lines.push(currentLine);
    return lines;
  }

  /**
   * Draw image with cover cropping (object-fit: cover behavior)
   */
  private static drawCoverImage(
    ctx: SKRSContext2D,
    image: any,
    destX: number,
    destY: number,
    destWidth: number,
    destHeight: number
  ): void {
    const imgRatio = image.width / image.height;
    const destRatio = destWidth / destHeight;

    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.width;
    let sourceHeight = image.height;

    if (imgRatio > destRatio) {
      // Image is wider than destination - crop sides
      sourceWidth = image.height * destRatio;
      sourceX = (image.width - sourceWidth) / 2;
    } else {
      // Image is taller than destination - crop top/bottom
      sourceHeight = image.width / destRatio;
      sourceY = (image.height - sourceHeight) / 2;
    }

    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);
  }

  /**
   * Download image from URL to Buffer
   */
  static async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
