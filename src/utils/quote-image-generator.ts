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
  private static readonly IMAGE_HEIGHT = 630;
  private static readonly PFP_SIZE = 400; // Large PFP for background
  private static readonly PFP_OPACITY = 0.15; // Faded for background

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
    if (style === 'color') {
      // Gradient background
      const gradient = ctx.createLinearGradient(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
      gradient.addColorStop(0, '#1a1a2e');
      gradient.addColorStop(0.5, '#16213e');
      gradient.addColorStop(1, '#0f3460');
      ctx.fillStyle = gradient;
    } else {
      // B&W background
      const gradient = ctx.createLinearGradient(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
      gradient.addColorStop(0, '#1a1a1a');
      gradient.addColorStop(0.5, '#2d2d2d');
      gradient.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = gradient;
    }
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
    // Draw faded PFP in background (centered)
    ctx.save();
    ctx.globalAlpha = this.PFP_OPACITY;
    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }
    this.drawCoverImage(ctx, avatar, this.IMAGE_WIDTH / 2 - this.PFP_SIZE / 2, this.IMAGE_HEIGHT / 2 - this.PFP_SIZE / 2, this.PFP_SIZE, this.PFP_SIZE);
    ctx.restore();

    // Draw vignette overlay for text readability
    this.drawVignette(ctx);

    // Draw username
    this.drawUsername(ctx, message.username, this.IMAGE_WIDTH / 2, 100);

    // Draw quote text
    this.drawQuoteText(ctx, message.content, this.IMAGE_WIDTH / 2, this.IMAGE_HEIGHT / 2, this.IMAGE_WIDTH - 200);
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
    // Message A - TOP LEFT
    ctx.save();
    ctx.globalAlpha = this.PFP_OPACITY;
    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }
    this.drawCoverImage(ctx, avatar1, 50, 50, this.PFP_SIZE, this.PFP_SIZE);
    ctx.restore();

    // Message B - BOTTOM RIGHT (slightly more prominent)
    ctx.save();
    ctx.globalAlpha = this.PFP_OPACITY * 1.2; // Slightly more visible
    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }
    this.drawCoverImage(ctx, avatar2, this.IMAGE_WIDTH - this.PFP_SIZE - 50, this.IMAGE_HEIGHT - this.PFP_SIZE - 50, this.PFP_SIZE, this.PFP_SIZE);
    ctx.restore();

    // Draw vignette overlay
    this.drawVignette(ctx);

    // Draw visual connection line
    this.drawConnectionLine(ctx, style);

    // Message A (top-left)
    this.drawUsername(ctx, message1.username, 50 + this.PFP_SIZE / 2, 80);
    this.drawQuoteText(ctx, message1.content, 50 + this.PFP_SIZE / 2, 200, this.IMAGE_WIDTH / 2 - 100);

    // Message B (bottom-right, slightly larger)
    this.drawUsername(ctx, message2.username, this.IMAGE_WIDTH - 50 - this.PFP_SIZE / 2, this.IMAGE_HEIGHT - this.PFP_SIZE - 20, true);
    this.drawQuoteText(ctx, message2.content, this.IMAGE_WIDTH - 50 - this.PFP_SIZE / 2, this.IMAGE_HEIGHT - 250, this.IMAGE_WIDTH / 2 - 100, true);
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
   * Draw visual connection line between messages
   */
  private static drawConnectionLine(ctx: SKRSContext2D, style: 'color' | 'bw'): void {
    ctx.save();
    ctx.strokeStyle = style === 'color' ? 'rgba(255, 215, 0, 0.3)' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    // Draw curved line from top-left to bottom-right
    ctx.beginPath();
    ctx.moveTo(50 + this.PFP_SIZE, 50 + this.PFP_SIZE / 2);
    ctx.quadraticCurveTo(
      this.IMAGE_WIDTH / 2, this.IMAGE_HEIGHT / 2,
      this.IMAGE_WIDTH - 50 - this.PFP_SIZE, this.IMAGE_HEIGHT - 50 - this.PFP_SIZE / 2
    );
    ctx.stroke();
    ctx.restore();
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
    const fontSize = isProminent ? 36 : 32;
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${fontSize}px Roboto`;

    // Draw shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Draw username
    ctx.fillStyle = isProminent ? '#FFD700' : '#FFFFFF';
    ctx.fillText(username, x, y);

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
    const fontSize = isProminent ? 28 : 24;
    const lineHeight = fontSize * 1.4;
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `${fontSize}px Roboto`;

    // Draw shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Wrap text
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
