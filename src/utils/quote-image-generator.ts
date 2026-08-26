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
  private static readonly PFP_SIZE = 450; // Large PFP for background (30% of composition)
  private static readonly PFP_OPACITY = 0.4; // Faded for background

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
    // Position PFP on the left side
    const pfpX = 80;
    const pfpY = (this.IMAGE_HEIGHT - this.PFP_SIZE) / 2;

    // Draw faded PFP with directional edge fading (right and bottom edges fade to black)
    ctx.save();
    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }
    this.drawCoverImage(ctx, avatar, pfpX, pfpY, this.PFP_SIZE, this.PFP_SIZE);
    ctx.restore();

    // Apply directional fade to PFP (right and bottom edges)
    this.drawDirectionalFade(ctx, pfpX, pfpY, this.PFP_SIZE, this.PFP_SIZE, 'right-bottom');

    // Position text to the right of PFP
    const textX = pfpX + this.PFP_SIZE + 80;
    const textY = this.IMAGE_HEIGHT / 2 - 50;

    // Draw soft black gradient behind text
    this.drawTextGradient(ctx, textX - 50, textY - 40, 400, 200);

    // Draw quote text (large, on the right)
    this.drawQuoteText(ctx, message.content, textX, textY, 400, false);

    // Draw username underneath (larger)
    this.drawUsername(ctx, message.username, textX, textY + 120, false, false);
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
    const pfp1X = 80;
    const pfp1Y = 80;
    
    ctx.save();
    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }
    this.drawCoverImage(ctx, avatar1, pfp1X, pfp1Y, this.PFP_SIZE, this.PFP_SIZE);
    ctx.restore();

    // Apply directional fade to top-left PFP (right and bottom edges)
    this.drawDirectionalFade(ctx, pfp1X, pfp1Y, this.PFP_SIZE, this.PFP_SIZE, 'right-bottom');

    // Message A (reply) - BOTTOM RIGHT
    const pfp2X = this.IMAGE_WIDTH - this.PFP_SIZE - 80;
    const pfp2Y = this.IMAGE_HEIGHT - this.PFP_SIZE - 80;
    
    ctx.save();
    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }
    this.drawCoverImage(ctx, avatar2, pfp2X, pfp2Y, this.PFP_SIZE, this.PFP_SIZE);
    ctx.restore();

    // Apply directional fade to bottom-right PFP (top and left edges)
    this.drawDirectionalFade(ctx, pfp2X, pfp2Y, this.PFP_SIZE, this.PFP_SIZE, 'top-left');

    // Message B (top-left) - text to the RIGHT of the PFP
    const text1X = pfp1X + this.PFP_SIZE + 60;
    const text1Y = pfp1Y + 50;
    
    this.drawTextGradient(ctx, text1X - 40, text1Y - 30, 350, 180);
    this.drawQuoteText(ctx, message1.content, text1X, text1Y, 350);
    this.drawUsername(ctx, message1.username, text1X, text1Y + 100);

    // Message A (bottom-right) - text to the LEFT of the PFP
    const text2X = pfp2X - 60;
    const text2Y = pfp2Y + 50;
    
    this.drawTextGradient(ctx, text2X - 310, text2Y - 30, 350, 180);
    this.drawQuoteText(ctx, message2.content, text2X, text2Y, 350, true); // right-aligned
    this.drawUsername(ctx, message2.username, text2X, text2Y + 100, true);
  }

  /**
   * Draw directional edge fade for PFP
   */
  private static drawDirectionalFade(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    direction: 'right-bottom' | 'top-left'
  ): void {
    ctx.save();
    
    if (direction === 'right-bottom') {
      // Fade right edge
      const rightGradient = ctx.createLinearGradient(x + width * 0.6, y, x + width, y);
      rightGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      rightGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
      ctx.fillStyle = rightGradient;
      ctx.fillRect(x + width * 0.6, y, width * 0.4, height);
      
      // Fade bottom edge
      const bottomGradient = ctx.createLinearGradient(x, y + height * 0.6, x, y + height);
      bottomGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      bottomGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
      ctx.fillStyle = bottomGradient;
      ctx.fillRect(x, y + height * 0.6, width, height * 0.4);
    } else {
      // Fade top edge
      const topGradient = ctx.createLinearGradient(x, y, x, y + height * 0.4);
      topGradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
      topGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = topGradient;
      ctx.fillRect(x, y, width, height * 0.4);
      
      // Fade left edge
      const leftGradient = ctx.createLinearGradient(x, y, x + width * 0.4, y);
      leftGradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
      leftGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = leftGradient;
      ctx.fillRect(x, y, width * 0.4, height);
    }
    
    ctx.restore();
  }

  /**
   * Draw soft black gradient behind text for readability
   */
  private static drawTextGradient(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    ctx.save();
    
    // Create radial gradient centered on text area
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const radius = Math.max(width, height) / 1.5;
    
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    
    ctx.restore();
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
    isProminent: boolean = false,
    rightAlign: boolean = false
  ): void {
    const fontSize = 28;
    
    ctx.textAlign = rightAlign ? 'right' : 'left';
    ctx.textBaseline = 'top';
    ctx.font = `${fontSize}px Roboto`;

    // Draw subtle shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    // Draw username (subtle gray)
    ctx.fillStyle = '#888888';
    const text = rightAlign ? `${username} —` : `— ${username}`;
    ctx.fillText(text, x, y);

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
    rightAlign: boolean = false
  ): void {
    const fontSize = 42;
    const lineHeight = fontSize * 1.4;
    
    ctx.textAlign = rightAlign ? 'right' : 'left';
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
