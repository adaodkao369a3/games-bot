import { createCanvas, GlobalFonts, loadImage, SKRSContext2D } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = cwd();

// Font loading
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
  message2?: QuoteMessageData;
  style: 'color' | 'bw';
}

export class QuoteImageGenerator {
  private static readonly IMAGE_WIDTH = 1200;
  private static readonly IMAGE_HEIGHT = 800;

  /*
   * Large enough that the images reach the canvas edges
   * and dominate their respective sides.
   */
  private static readonly PFP_SIZE = 620;

  /*
   * The images themselves are intentionally visible.
   * The fades, rather than low opacity, create the blending.
   */
  private static readonly PFP_OPACITY = 1;

  /**
   * Generate a quote image.
   */
  static async generateQuoteImage(data: QuoteImageData): Promise<Buffer> {
    if (!fontLoaded) {
      throw new Error('[QuoteImageGenerator] Font not loaded - cannot render image');
    }

    const { message1, message2, style } = data;
    const isTwoMessage = !!message2;

    const canvas = createCanvas(this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
    const ctx = canvas.getContext('2d');

    const avatar1 = await loadImage(message1.avatarBuffer);
    const avatar2 = message2
      ? await loadImage(message2.avatarBuffer)
      : null;

    // Always begin with pure black.
    this.drawBackground(ctx);

    if (isTwoMessage && avatar2) {
      this.drawTwoMessageLayout(
        ctx,
        avatar1,
        avatar2,
        message1,
        message2,
        style
      );
    } else {
      this.drawSingleMessageLayout(
        ctx,
        avatar1,
        message1,
        style
      );
    }

    return canvas.toBuffer('image/png');
  }

  /**
   * Draw pure black background.
   */
  private static drawBackground(ctx: SKRSContext2D): void {
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(
      0,
      0,
      this.IMAGE_WIDTH,
      this.IMAGE_HEIGHT
    );
    ctx.restore();
  }

  /**
   * SINGLE QUOTE
   *
   * Image fills the entire left edge/corner.
   * Text is centered in the right half.
   */
  private static drawSingleMessageLayout(
    ctx: SKRSContext2D,
    avatar: any,
    message: QuoteMessageData,
    style: 'color' | 'bw'
  ): void {
    const pfpSize = 620;

    // Absolutely no margin from the top/left canvas corners.
    const pfpX = 0;
    const pfpY = 0;

    ctx.save();

    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }

    this.drawCoverImage(
      ctx,
      avatar,
      pfpX,
      pfpY,
      pfpSize,
      pfpSize
    );

    ctx.restore();

    // Fade image toward the text/right side and downward.
    this.drawDirectionalFade(
      ctx,
      pfpX,
      pfpY,
      pfpSize,
      pfpSize,
      'right-bottom'
    );

    /*
     * Text belongs to the right half.
     *
     * Center of right half:
     * x = 900
     * y = 400
     */
    const textCenterX = this.IMAGE_WIDTH * 0.75;
    const textCenterY = this.IMAGE_HEIGHT * 0.5;

    // Broad soft gradient behind the typography.
    this.drawTextGradient(
      ctx,
      textCenterX - 300,
      textCenterY - 150,
      600,
      300
    );

    const quoteLines = this.getQuoteLines(
      ctx,
      message.content,
      500
    );

    const quoteFontSize = this.getQuoteFontSize(
      ctx,
      message.content,
      500
    );

    const quoteLineHeight = quoteFontSize * 1.25;
    const quoteBlockHeight =
      quoteLines.length * quoteLineHeight;

    const totalHeight = quoteBlockHeight + 70;

    const quoteStartY =
      textCenterY - totalHeight / 2;

    this.drawQuoteText(
      ctx,
      message.content,
      textCenterX,
      quoteStartY,
      500,
      'center',
      quoteFontSize
    );

    this.drawUsername(
      ctx,
      message.username,
      textCenterX,
      quoteStartY + quoteBlockHeight + 35,
      false,
      'center'
    );
  }

  /**
   * TWO QUOTE LAYOUT
   *
   * TOP-LEFT:
   *   PFP → fade → QUOTE
   *
   * BOTTOM-RIGHT:
   *   QUOTE ← fade ← PFP
   *
   * Images touch the outer canvas corners.
   */
  private static drawTwoMessageLayout(
    ctx: SKRSContext2D,
    avatar1: any,
    avatar2: any,
    message1: QuoteMessageData,
    message2: QuoteMessageData,
    style: 'color' | 'bw'
  ): void {
    const pfpSize = 620;

    /*
     * =========================================================
     * TOP-LEFT IMAGE
     * =========================================================
     *
     * Starts at EXACTLY 0,0.
     *
     * No 80px padding.
     * No border.
     * No gap from the canvas.
     */
    const pfp1X = 0;
    const pfp1Y = 0;

    ctx.save();

    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }

    this.drawCoverImage(
      ctx,
      avatar1,
      pfp1X,
      pfp1Y,
      pfpSize,
      pfpSize
    );

    ctx.restore();

    /*
     * Fade the right and bottom edges.
     *
     * This makes the image disappear naturally
     * into the black center.
     */
    this.drawDirectionalFade(
      ctx,
      pfp1X,
      pfp1Y,
      pfpSize,
      pfpSize,
      'right-bottom'
    );

    /*
     * =========================================================
     * BOTTOM-RIGHT IMAGE
     * =========================================================
     *
     * It starts directly against the RIGHT and BOTTOM
     * canvas edges.
     */
    const pfp2X = this.IMAGE_WIDTH - pfpSize;
    const pfp2Y = this.IMAGE_HEIGHT - pfpSize;

    ctx.save();

    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }

    this.drawCoverImage(
      ctx,
      avatar2,
      pfp2X,
      pfp2Y,
      pfpSize,
      pfpSize
    );

    ctx.restore();

    /*
     * Fade top and left edges toward the center.
     */
    this.drawDirectionalFade(
      ctx,
      pfp2X,
      pfp2Y,
      pfpSize,
      pfpSize,
      'top-left'
    );

    /*
     * =========================================================
     * TOP-RIGHT TEXT
     * =========================================================
     *
     * This is centered inside the upper-right quarter.
     *
     * Approx center:
     * x = 900
     * y = 200
     */
    const topTextCenterX = this.IMAGE_WIDTH * 0.75;
    const topTextCenterY = this.IMAGE_HEIGHT * 0.25;

    this.drawTextGradient(
      ctx,
      topTextCenterX - 290,
      topTextCenterY - 140,
      580,
      280
    );

    const topFontSize = this.getQuoteFontSize(
      ctx,
      message1.content,
      500
    );

    const topLines = this.getQuoteLines(
      ctx,
      message1.content,
      500,
      topFontSize
    );

    const topLineHeight = topFontSize * 1.25;
    const topQuoteHeight =
      topLines.length * topLineHeight;

    const topTotalHeight =
      topQuoteHeight + 70;

    const topQuoteY =
      topTextCenterY - topTotalHeight / 2;

    this.drawQuoteText(
      ctx,
      message1.content,
      topTextCenterX,
      topQuoteY,
      500,
      'center',
      topFontSize
    );

    this.drawUsername(
      ctx,
      message1.username,
      topTextCenterX,
      topQuoteY + topQuoteHeight + 35,
      false,
      'center'
    );

    /*
     * =========================================================
     * BOTTOM-LEFT TEXT
     * =========================================================
     *
     * Centered inside the lower-left quarter.
     *
     * Approx center:
     * x = 300
     * y = 600
     */
    const bottomTextCenterX = this.IMAGE_WIDTH * 0.25;
    const bottomTextCenterY = this.IMAGE_HEIGHT * 0.75;

    this.drawTextGradient(
      ctx,
      bottomTextCenterX - 290,
      bottomTextCenterY - 140,
      580,
      280
    );

    const bottomFontSize = this.getQuoteFontSize(
      ctx,
      message2.content,
      500
    );

    const bottomLines = this.getQuoteLines(
      ctx,
      message2.content,
      500,
      bottomFontSize
    );

    const bottomLineHeight =
      bottomFontSize * 1.25;

    const bottomQuoteHeight =
      bottomLines.length * bottomLineHeight;

    const bottomTotalHeight =
      bottomQuoteHeight + 70;

    const bottomQuoteY =
      bottomTextCenterY - bottomTotalHeight / 2;

    this.drawQuoteText(
      ctx,
      message2.content,
      bottomTextCenterX,
      bottomQuoteY,
      500,
      'center',
      bottomFontSize
    );

    this.drawUsername(
      ctx,
      message2.username,
      bottomTextCenterX,
      bottomQuoteY + bottomQuoteHeight + 35,
      false,
      'center'
    );
  }

  /**
   * Directional fade.
   *
   * The image itself reaches the canvas edge.
   * Only its INNER edges fade toward black.
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
      /*
       * RIGHT EDGE
       *
       * Starts fading around 55% of the image.
       */
      const rightGradient = ctx.createLinearGradient(
        x + width * 0.52,
        y,
        x + width,
        y
      );

      rightGradient.addColorStop(
        0,
        'rgba(0,0,0,0)'
      );

      rightGradient.addColorStop(
        0.55,
        'rgba(0,0,0,0.35)'
      );

      rightGradient.addColorStop(
        1,
        'rgba(0,0,0,1)'
      );

      ctx.fillStyle = rightGradient;

      ctx.fillRect(
        x + width * 0.52,
        y,
        width * 0.48,
        height
      );

      /*
       * BOTTOM EDGE
       */
      const bottomGradient = ctx.createLinearGradient(
        x,
        y + height * 0.52,
        x,
        y + height
      );

      bottomGradient.addColorStop(
        0,
        'rgba(0,0,0,0)'
      );

      bottomGradient.addColorStop(
        0.55,
        'rgba(0,0,0,0.35)'
      );

      bottomGradient.addColorStop(
        1,
        'rgba(0,0,0,1)'
      );

      ctx.fillStyle = bottomGradient;

      ctx.fillRect(
        x,
        y + height * 0.52,
        width,
        height * 0.48
      );

    } else {
      /*
       * TOP EDGE
       */
      const topGradient = ctx.createLinearGradient(
        x,
        y,
        x,
        y + height * 0.48
      );

      topGradient.addColorStop(
        0,
        'rgba(0,0,0,1)'
      );

      topGradient.addColorStop(
        0.45,
        'rgba(0,0,0,0.35)'
      );

      topGradient.addColorStop(
        1,
        'rgba(0,0,0,0)'
      );

      ctx.fillStyle = topGradient;

      ctx.fillRect(
        x,
        y,
        width,
        height * 0.48
      );

      /*
       * LEFT EDGE
       */
      const leftGradient = ctx.createLinearGradient(
        x,
        y,
        x + width * 0.48,
        y
      );

      leftGradient.addColorStop(
        0,
        'rgba(0,0,0,1)'
      );

      leftGradient.addColorStop(
        0.45,
        'rgba(0,0,0,0.35)'
      );

      leftGradient.addColorStop(
        1,
        'rgba(0,0,0,0)'
      );

      ctx.fillStyle = leftGradient;

      ctx.fillRect(
        x,
        y,
        width * 0.48,
        height
      );
    }

    ctx.restore();
  }

  /**
   * Soft black gradient behind text.
   *
   * This is intentionally wide so there is no
   * obvious rectangular black box.
   */
  private static drawTextGradient(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    ctx.save();

    const centerX = x + width / 2;
    const centerY = y + height / 2;

    const radius =
      Math.max(width, height) * 0.72;

    const gradient = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      radius
    );

    gradient.addColorStop(
      0,
      'rgba(0,0,0,0.85)'
    );

    gradient.addColorStop(
      0.35,
      'rgba(0,0,0,0.65)'
    );

    gradient.addColorStop(
      0.7,
      'rgba(0,0,0,0.25)'
    );

    gradient.addColorStop(
      1,
      'rgba(0,0,0,0)'
    );

    ctx.fillStyle = gradient;

    ctx.fillRect(
      x,
      y,
      width,
      height
    );

    ctx.restore();
  }

  /**
   * Calculate a large quote font that still fits.
   */
  private static getQuoteFontSize(
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number
  ): number {
    const preferredSize = 58;
    const minimumSize = 34;

    for (
      let size = preferredSize;
      size >= minimumSize;
      size -= 2
    ) {
      ctx.font = `bold ${size}px Roboto`;

      const lines = this.wrapText(
        ctx,
        `"${text}"`,
        maxWidth
      );

      if (lines.length <= 3) {
        return size;
      }
    }

    return minimumSize;
  }

  /**
   * Get wrapped quote lines.
   */
  private static getQuoteLines(
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number,
    fontSize?: number
  ): string[] {
    ctx.font = `bold ${fontSize ?? 58}px Roboto`;

    return this.wrapText(
      ctx,
      `"${text}"`,
      maxWidth
    );
  }

  /**
   * Draw username.
   */
  private static drawUsername(
    ctx: SKRSContext2D,
    username: string,
    x: number,
    y: number,
    isProminent: boolean = false,
    align: 'left' | 'right' | 'center' = 'left'
  ): void {
    const fontSize = isProminent ? 34 : 32;

    ctx.save();

    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.font = `bold ${fontSize}px Roboto`;

    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = '#9A9A9A';

    ctx.fillText(
      `— ${username}`,
      x,
      y
    );

    ctx.restore();
  }

  /**
   * Draw quote text.
   */
  private static drawQuoteText(
    ctx: SKRSContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    align: 'left' | 'right' | 'center' = 'left',
    fontSize: number = 58
  ): void {
    const lineHeight = fontSize * 1.25;

    ctx.save();

    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.font = `bold ${fontSize}px Roboto`;

    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;

    const lines = this.wrapText(
      ctx,
      `"${text}"`,
      maxWidth
    );

    lines.forEach((line, index) => {
      ctx.fillStyle = '#FFFFFF';

      ctx.fillText(
        line,
        x,
        y + index * lineHeight
      );
    });

    ctx.restore();
  }

  /**
   * Word wrapping.
   */
  private static wrapText(
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number
  ): string[] {
    if (!text || !text.trim()) {
      return ['""'];
    }

    const words = text.split(/\s+/);
    const lines: string[] = [];

    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const testLine =
        currentLine + ' ' + words[i];

      if (
        ctx.measureText(testLine).width <= maxWidth
      ) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = words[i];
      }
    }

    lines.push(currentLine);

    return lines;
  }

  /**
   * Draw image with cover cropping.
   */
  private static drawCoverImage(
    ctx: SKRSContext2D,
    image: any,
    destX: number,
    destY: number,
    destWidth: number,
    destHeight: number
  ): void {
    const imgRatio =
      image.width / image.height;

    const destRatio =
      destWidth / destHeight;

    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.width;
    let sourceHeight = image.height;

    if (imgRatio > destRatio) {
      sourceWidth =
        image.height * destRatio;

      sourceX =
        (image.width - sourceWidth) / 2;
    } else {
      sourceHeight =
        image.width / destRatio;

      sourceY =
        (image.height - sourceHeight) / 2;
    }

    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      destX,
      destY,
      destWidth,
      destHeight
    );
  }

  /**
   * Download image from URL to Buffer.
   */
  static async downloadImage(
    url: string
  ): Promise<Buffer> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to download image: ${response.status} ${response.statusText}`
      );
    }

    const arrayBuffer =
      await response.arrayBuffer();

    return Buffer.from(arrayBuffer);
  }
}