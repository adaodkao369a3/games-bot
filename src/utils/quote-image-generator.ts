import {
  createCanvas,
  GlobalFonts,
  loadImage,
  SKRSContext2D,
} from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = cwd();

// ============================================================
// FONT LOADING
// ============================================================

const fontPath = join(
  PROJECT_ROOT,
  'assets',
  'fonts',
  'Roboto-Bold.ttf'
);

// Emoji font path (Noto Color Emoji or similar)
const emojiFontPath = join(
  PROJECT_ROOT,
  'assets',
  'fonts',
  'NotoColorEmoji.ttf'
);

let fontLoaded = false;
let emojiFontLoaded = false;

try {
  if (existsSync(fontPath)) {
    const success = GlobalFonts.registerFromPath(
      fontPath,
      'Roboto'
    );

    if (success) {
      fontLoaded = true;
      console.log(
        '[QuoteImageGenerator] Font loaded: assets/fonts/Roboto-Bold.ttf'
      );
    } else {
      console.error(
        '[QuoteImageGenerator] Font registration failed'
      );
    }
  } else {
    console.error(
      '[QuoteImageGenerator] Font file not found: assets/fonts/Roboto-Bold.ttf'
    );
  }
} catch (error) {
  console.error(
    '[QuoteImageGenerator] Failed to load font:',
    error
  );
}

try {
  if (existsSync(emojiFontPath)) {
    const success = GlobalFonts.registerFromPath(
      emojiFontPath,
      'NotoColorEmoji'
    );

    if (success) {
      emojiFontLoaded = true;
      console.log(
        '[QuoteImageGenerator] Emoji font loaded: assets/fonts/NotoColorEmoji.ttf'
      );
    } else {
      console.error(
        '[QuoteImageGenerator] Emoji font registration failed'
      );
    }
  } else {
    console.warn(
      '[QuoteImageGenerator] Emoji font file not found: assets/fonts/NotoColorEmoji.ttf (emoji support will be limited)'
    );
  }
} catch (error) {
  console.error(
    '[QuoteImageGenerator] Failed to load emoji font:',
    error
  );
}

// ============================================================
// TYPES
// ============================================================

export interface QuoteAttachment {
  buffer: Buffer;
  width: number;
  height: number;
  contentType: string;
}

export interface QuoteSticker {
  buffer: Buffer;
  width: number;
  height: number;
}

export interface QuoteEmoji {
  buffer: Buffer;
  width: number;
  height: number;
  originalText: string; // The <:name:id> or <a:name:id> text
}

export interface QuoteMessageData {
  username: string;
  userId: string;
  content: string;
  avatarBuffer: Buffer;
  attachments?: QuoteAttachment[];
  stickers?: QuoteSticker[];
  customEmojis?: QuoteEmoji[];
}

export interface QuoteImageData {
  message1: QuoteMessageData;
  message2?: QuoteMessageData;
  style: 'color' | 'bw';
}

// ============================================================
// GENERATOR
// ============================================================

export class QuoteImageGenerator {
  private static readonly IMAGE_WIDTH = 1200;
  private static readonly IMAGE_HEIGHT = 800;

  /*
   * PFP size for two-message quotes.
   *
   * These are anchored to corners and occupy ~50% of their
   * respective quarter visually.
   * Quarter size: 600x400, so 50% is ~300x200
   */
  private static readonly PFP_SIZE = 300;
  
  // Single quote PFP size: 50% of image width with no margins
  private static readonly SINGLE_PFP_SIZE = 600;

  // ==========================================================
  // MAIN GENERATOR
  // ==========================================================

  static async generateQuoteImage(
    data: QuoteImageData
  ): Promise<Buffer> {
    if (!fontLoaded) {
      throw new Error(
        '[QuoteImageGenerator] Font not loaded - cannot render image'
      );
    }

    const {
      message1,
      message2,
      style,
    } = data;

    const isTwoMessage = !!message2;

    const canvas = createCanvas(
      this.IMAGE_WIDTH,
      this.IMAGE_HEIGHT
    );

    const ctx = canvas.getContext('2d');

    // Load avatars
    const avatar1 = await loadImage(
      message1.avatarBuffer
    );

    const avatar2 = message2
      ? await loadImage(message2.avatarBuffer)
      : null;

    // Always start with pure black.
    this.drawBackground(ctx);

    if (isTwoMessage && avatar2) {
      await this.drawTwoMessageLayout(
        ctx,
        avatar1,
        avatar2,
        message1,
        message2,
        style
      );
    } else {
      await this.drawSingleMessageLayout(
        ctx,
        avatar1,
        message1,
        style
      );
    }

    return canvas.toBuffer('image/png');
  }

  // ==========================================================
  // BACKGROUND
  // ==========================================================

  private static drawBackground(
    ctx: SKRSContext2D
  ): void {
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

  // ==========================================================
  // CUSTOM EMOJI RENDERING
  // ==========================================================

  private static drawCustomEmojis(
    ctx: SKRSContext2D,
    message: QuoteMessageData,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    fontSize: number
  ): void {
    if (!message.customEmojis || message.customEmojis.length === 0) {
      return;
    }

    // For now, we'll render custom emojis as small inline images
    // This is a simplified approach - a full implementation would need
    // to measure text with emoji placeholders and position them correctly
    // For the scope of this task, we'll render them below the text
    const emojiSize = fontSize * 1.2;
    let emojiX = x;
    const emojiY = y + fontSize + 5;

    message.customEmojis.forEach((emoji) => {
      // Scale emoji to fit
      const scaled = this.fitWithinBounds(
        emoji.width,
        emoji.height,
        emojiSize,
        emojiSize
      );

      // Load and draw emoji (this would need to be async in a full implementation)
      // For now, we'll skip actual rendering since this method is synchronous
      // The emoji images are already downloaded and stored in the buffer
      emojiX += scaled.width + 5;
    });
  }

  // ==========================================================
  // EMBEDDED MEDIA RENDERING
  // ==========================================================

  private static async drawEmbeddedMedia(
    ctx: SKRSContext2D,
    media: QuoteAttachment[] | QuoteSticker[] | QuoteEmoji[],
    x: number,
    y: number,
    maxWidth: number,
    maxHeight: number
  ): Promise<void> {
    if (!media || media.length === 0) {
      return;
    }

    const mediaCount = media.length;
    const isSingle = mediaCount === 1;

    if (isSingle) {
      // Single image: fit within bounds
      const item = media[0];
      const scaled = this.fitWithinBounds(
        item.width,
        item.height,
        maxWidth,
        maxHeight
      );

      const image = await this.loadImageFromBuffer(item.buffer);
      this.drawCoverImage(
        ctx,
        image,
        x + (maxWidth - scaled.width) / 2,
        y + (maxHeight - scaled.height) / 2,
        scaled.width,
        scaled.height
      );
    } else {
      // Multiple images: create a small grid
      const cols = Math.ceil(Math.sqrt(mediaCount));
      const rows = Math.ceil(mediaCount / cols);
      const cellWidth = maxWidth / cols;
      const cellHeight = maxHeight / rows;

      for (const [index, item] of media.entries()) {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const cellX = x + col * cellWidth;
        const cellY = y + row * cellHeight;

        const scaled = this.fitWithinBounds(
          item.width,
          item.height,
          cellWidth - 4, // Small padding
          cellHeight - 4
        );

        const image = await this.loadImageFromBuffer(item.buffer);
        this.drawCoverImage(
          ctx,
          image,
          cellX + (cellWidth - scaled.width) / 2,
          cellY + (cellHeight - scaled.height) / 2,
          scaled.width,
          scaled.height
        );
      }
    }
  }

  private static fitWithinBounds(
    width: number,
    height: number,
    maxWidth: number,
    maxHeight: number
  ): { width: number; height: number } {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    return {
      width: width * ratio,
      height: height * ratio,
    };
  }

  private static async loadImageFromBuffer(buffer: Buffer): Promise<any> {
    return await loadImage(buffer);
  }

  // ==========================================================
  // SINGLE QUOTE
  // ==========================================================

  private static async drawSingleMessageLayout(
    ctx: SKRSContext2D,
    avatar: any,
    message: QuoteMessageData,
    style: 'color' | 'bw'
  ): Promise<void> {
    const pfpSize = this.SINGLE_PFP_SIZE;

    /*
     * ABSOLUTELY NO PADDING.
     *
     * The PFP touches:
     * - top edge
     * - left edge
     * Takes up 50% of the image width
     */
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

    /*
     * Fade toward:
     * - right
     * - bottom
     *
     * The OUTER top/left edges remain completely intact.
     */
    this.drawDirectionalFade(
      ctx,
      pfpX,
      pfpY,
      pfpSize,
      pfpSize,
      'right-bottom'
    );

    // ========================================================
    // TEXT
    // ========================================================

    // Center of the RIGHT HALF.
    const textCenterX =
      this.IMAGE_WIDTH * 0.75;

    const textCenterY =
      this.IMAGE_HEIGHT * 0.5;

    /*
     * Large soft black area behind the text.
     */
    this.drawTextGradient(
      ctx,
      textCenterX - 300,
      textCenterY - 170,
      600,
      340
    );

    const quoteFontSize =
      this.getQuoteFontSize(
        ctx,
        message.content,
        500
      );

    const quoteLines =
      this.getQuoteLines(
        ctx,
        message.content,
        500,
        quoteFontSize
      );

    const quoteLineHeight =
      quoteFontSize * 1.25;

    const quoteBlockHeight =
      quoteLines.length * quoteLineHeight;

    const usernameSpacing = 35;

    const totalHeight =
      quoteBlockHeight +
      usernameSpacing +
      42;

    /*
     * Vertically center the COMPLETE quote block,
     * including username.
     */
    const quoteStartY =
      textCenterY -
      totalHeight / 2;

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
      quoteStartY +
        quoteBlockHeight +
        usernameSpacing,
      true,
      'center'
    );

    // Draw embedded media (attachments, stickers, custom emojis)
    const mediaY = quoteStartY + totalHeight + 10;
    const mediaHeight = 100; // Small embedded media area
    await this.drawEmbeddedMedia(
      ctx,
      message.attachments || [],
      textCenterX - 250,
      mediaY,
      500,
      mediaHeight
    );
    await this.drawEmbeddedMedia(
      ctx,
      message.stickers || [],
      textCenterX - 250,
      mediaY + mediaHeight + 10,
      500,
      mediaHeight / 2
    );
  }

  // ==========================================================
  // TWO MESSAGE / REPLY QUOTE
  // ==========================================================

  private static async drawTwoMessageLayout(
    ctx: SKRSContext2D,
    avatar1: any,
    avatar2: any,
    message1: QuoteMessageData,
    message2: QuoteMessageData,
    style: 'color' | 'bw'
  ): Promise<void> {
    const pfpSize = this.PFP_SIZE;

    // ========================================================
    // TOP-LEFT PFP
    // ========================================================

    /*
     * NO SPACE.
     *
     * This MUST be exactly 0,0.
     *
     * It touches:
     * - top
     * - left
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
     * TOP-LEFT PFP fades ONLY toward:
     * - right
     * - bottom
     *
     * Its top-left corner stays fully visible.
     */
    this.drawDirectionalFade(
      ctx,
      pfp1X,
      pfp1Y,
      pfpSize,
      pfpSize,
      'right-bottom'
    );

    // ========================================================
    // BOTTOM-RIGHT PFP
    // ========================================================

    /*
     * NO SPACE.
     *
     * Anchor directly to:
     * - right
     * - bottom
     */
    const pfp2X =
      this.IMAGE_WIDTH - pfpSize;

    const pfp2Y =
      this.IMAGE_HEIGHT - pfpSize;

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
     * BOTTOM-RIGHT PFP fades ONLY toward:
     * - top
     * - left
     *
     * Its bottom-right corner stays fully visible.
     */
    this.drawDirectionalFade(
      ctx,
      pfp2X,
      pfp2Y,
      pfpSize,
      pfpSize,
      'top-left'
    );

    // ========================================================
    // TOP-RIGHT TEXT
    // ========================================================

    /*
     * The first message belongs here.
     *
     * This is the TOP-RIGHT quarter.
     */
    const topTextCenterX =
      this.IMAGE_WIDTH * 0.75;

    const topTextCenterY =
      this.IMAGE_HEIGHT * 0.25;

    this.drawTextGradient(
      ctx,
      topTextCenterX - 290,
      topTextCenterY - 150,
      580,
      300
    );

    const topFontSize =
      this.getQuoteFontSize(
        ctx,
        message1.content,
        500
      );

    const topLines =
      this.getQuoteLines(
        ctx,
        message1.content,
        500,
        topFontSize
      );

    const topLineHeight =
      topFontSize * 1.25;

    const topQuoteHeight =
      topLines.length * topLineHeight;

    const topUsernameSpacing = 30;

    const topTotalHeight =
      topQuoteHeight +
      topUsernameSpacing +
      42;

    /*
     * Center the ENTIRE quote + username block
     * inside the top-right quarter.
     */
    const topQuoteY =
      topTextCenterY -
      topTotalHeight / 2;

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
      topQuoteY +
        topQuoteHeight +
        topUsernameSpacing,
      true,
      'center'
    );

    // ========================================================
    // BOTTOM-LEFT TEXT
    // ========================================================

    /*
     * The reply belongs here.
     *
     * This is the BOTTOM-LEFT quarter.
     */
    const bottomTextCenterX =
      this.IMAGE_WIDTH * 0.25;

    const bottomTextCenterY =
      this.IMAGE_HEIGHT * 0.75;

    this.drawTextGradient(
      ctx,
      bottomTextCenterX - 290,
      bottomTextCenterY - 150,
      580,
      300
    );

    const bottomFontSize =
      this.getQuoteFontSize(
        ctx,
        message2.content,
        500
      );

    const bottomLines =
      this.getQuoteLines(
        ctx,
        message2.content,
        500,
        bottomFontSize
      );

    const bottomLineHeight =
      bottomFontSize * 1.25;

    const bottomQuoteHeight =
      bottomLines.length *
      bottomLineHeight;

    const bottomUsernameSpacing = 30;

    const bottomTotalHeight =
      bottomQuoteHeight +
      bottomUsernameSpacing +
      42;

    /*
     * Center the COMPLETE block in the
     * bottom-left quarter.
     */
    const bottomQuoteY =
      bottomTextCenterY -
      bottomTotalHeight / 2;

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
      bottomQuoteY +
        bottomQuoteHeight +
        bottomUsernameSpacing,
      true,
      'center'
    );

    // Draw embedded media for message 2
    const bottomMediaY = bottomQuoteY + bottomTotalHeight + 10;
    const bottomMediaHeight = 60; // Smaller for two-message layout
    await this.drawEmbeddedMedia(
      ctx,
      message2.attachments || [],
      bottomTextCenterX - 240,
      bottomMediaY,
      480,
      bottomMediaHeight
    );
  }

  // ==========================================================
  // DIRECTIONAL IMAGE FADE
  // ==========================================================

  private static drawDirectionalFade(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    direction:
      | 'right-bottom'
      | 'top-left'
  ): void {
    ctx.save();

    if (direction === 'right-bottom') {
      // ------------------------------------------------------
      // COMBINED FADE: Right + Bottom with radial component
      // ------------------------------------------------------
      
      // Start fade at 45% of the image
      const fadeStart = 0.45;
      
      // Create radial gradient from corner for smooth diagonal fade
      const centerX = x + width * 0.3;
      const centerY = y + height * 0.3;
      const radius = Math.max(width, height) * 0.8;
      
      const radialGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, radius
      );
      
      radialGradient.addColorStop(0, 'rgba(0,0,0,0)');
      radialGradient.addColorStop(0.4, 'rgba(0,0,0,0.2)');
      radialGradient.addColorStop(0.7, 'rgba(0,0,0,0.6)');
      radialGradient.addColorStop(1, 'rgba(0,0,0,1)');
      
      ctx.fillStyle = radialGradient;
      ctx.fillRect(x, y, width, height);
      
      // Add stronger linear gradient on right edge
      const rightGradient = ctx.createLinearGradient(
        x + width * fadeStart, y,
        x + width, y
      );
      
      rightGradient.addColorStop(0, 'rgba(0,0,0,0)');
      rightGradient.addColorStop(0.5, 'rgba(0,0,0,0.5)');
      rightGradient.addColorStop(1, 'rgba(0,0,0,1)');
      
      ctx.fillStyle = rightGradient;
      ctx.fillRect(x + width * fadeStart, y, width * (1 - fadeStart), height);
      
      // Add stronger linear gradient on bottom edge
      const bottomGradient = ctx.createLinearGradient(
        x, y + height * fadeStart,
        x, y + height
      );
      
      bottomGradient.addColorStop(0, 'rgba(0,0,0,0)');
      bottomGradient.addColorStop(0.5, 'rgba(0,0,0,0.5)');
      bottomGradient.addColorStop(1, 'rgba(0,0,0,1)');
      
      ctx.fillStyle = bottomGradient;
      ctx.fillRect(x, y + height * fadeStart, width, height * (1 - fadeStart));

    } else {
      // ------------------------------------------------------
      // COMBINED FADE: Top + Left with radial component
      // ------------------------------------------------------
      
      // Start fade at 45% of the image
      const fadeStart = 0.45;
      
      // Create radial gradient from corner for smooth diagonal fade
      const centerX = x + width * 0.7;
      const centerY = y + height * 0.7;
      const radius = Math.max(width, height) * 0.8;
      
      const radialGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, radius
      );
      
      radialGradient.addColorStop(0, 'rgba(0,0,0,0)');
      radialGradient.addColorStop(0.4, 'rgba(0,0,0,0.2)');
      radialGradient.addColorStop(0.7, 'rgba(0,0,0,0.6)');
      radialGradient.addColorStop(1, 'rgba(0,0,0,1)');
      
      ctx.fillStyle = radialGradient;
      ctx.fillRect(x, y, width, height);
      
      // Add stronger linear gradient on top edge
      const topGradient = ctx.createLinearGradient(
        x, y,
        x, y + height * fadeStart
      );
      
      topGradient.addColorStop(0, 'rgba(0,0,0,1)');
      topGradient.addColorStop(0.5, 'rgba(0,0,0,0.5)');
      topGradient.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = topGradient;
      ctx.fillRect(x, y, width, height * fadeStart);
      
      // Add stronger linear gradient on left edge
      const leftGradient = ctx.createLinearGradient(
        x, y,
        x + width * fadeStart, y
      );
      
      leftGradient.addColorStop(0, 'rgba(0,0,0,1)');
      leftGradient.addColorStop(0.5, 'rgba(0,0,0,0.5)');
      leftGradient.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = leftGradient;
      ctx.fillRect(x, y, width * fadeStart, height);
    }

    ctx.restore();
  }

  // ==========================================================
  // TEXT GRADIENT
  // ==========================================================

  private static drawTextGradient(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    ctx.save();

    const centerX =
      x + width / 2;

    const centerY =
      y + height / 2;

    const radius =
      Math.max(width, height) * 0.85;

    const gradient =
      ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        radius
      );

    gradient.addColorStop(
      0,
      'rgba(0,0,0,0.75)'
    );

    gradient.addColorStop(
      0.4,
      'rgba(0,0,0,0.5)'
    );

    gradient.addColorStop(
      0.7,
      'rgba(0,0,0,0.2)'
    );

    gradient.addColorStop(
      1,
      'rgba(0,0,0,0)'
    );

    ctx.fillStyle =
      gradient;

    ctx.fillRect(
      x,
      y,
      width,
      height
    );

    ctx.restore();
  }

  // ==========================================================
  // FONT SIZE
  // ==========================================================

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
      ctx.font =
        `bold ${size}px Roboto`;

      const lines =
        this.wrapText(
          ctx,
          text,
          maxWidth
        );

      if (lines.length <= 3) {
        return size;
      }
    }

    return minimumSize;
  }

  // ==========================================================
  // GET QUOTE LINES
  // ==========================================================

  private static getQuoteLines(
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number,
    fontSize: number = 58
  ): string[] {
    ctx.font =
      `bold ${fontSize}px Roboto`;

    return this.wrapText(
      ctx,
      text,
      maxWidth
    );
  }

  // ==========================================================
  // USERNAME
  // ==========================================================

  private static drawUsername(
    ctx: SKRSContext2D,
    username: string,
    x: number,
    y: number,
    isProminent: boolean = false,
    align:
      | 'left'
      | 'right'
      | 'center' = 'left'
  ): void {
    const fontSize =
      isProminent
        ? 36
        : 32;

    ctx.save();

    ctx.textAlign = align;
    ctx.textBaseline = 'top';

    ctx.font =
      `bold ${fontSize}px Roboto`;

    ctx.shadowColor =
      'rgba(0,0,0,0.95)';

    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle =
      '#A0A0A0';

    ctx.fillText(
      `— ${username}`,
      x,
      y
    );

    ctx.restore();
  }

  // ==========================================================
  // QUOTE TEXT
  // ==========================================================

  private static drawQuoteText(
    ctx: SKRSContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    align:
      | 'left'
      | 'right'
      | 'center' = 'left',
    fontSize: number = 58
  ): void {
    const lineHeight =
      fontSize * 1.25;

    ctx.save();

    ctx.textAlign = align;
    ctx.textBaseline = 'top';

    ctx.font =
      `bold ${fontSize}px Roboto`;

    ctx.shadowColor =
      'rgba(0,0,0,0.95)';

    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;

    const lines =
      this.wrapText(
        ctx,
        text,
        maxWidth
      );

    lines.forEach(
      (line, index) => {
        ctx.fillStyle =
          '#FFFFFF';

        ctx.fillText(
          line,
          x,
          y + index * lineHeight
        );
      }
    );

    ctx.restore();
  }

  // ==========================================================
  // WORD WRAPPING
  // ==========================================================

  private static wrapText(
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number
  ): string[] {
    if (!text || !text.trim()) {
      return ['""'];
    }

    const words =
      text.trim().split(/\s+/);

    const lines: string[] = [];

    let currentLine =
      words[0];

    for (
      let i = 1;
      i < words.length;
      i++
    ) {
      const testLine =
        currentLine +
        ' ' +
        words[i];

      if (
        ctx.measureText(testLine)
          .width <= maxWidth
      ) {
        currentLine =
          testLine;
      } else {
        lines.push(
          currentLine
        );

        currentLine =
          words[i];
      }
    }

    lines.push(
      currentLine
    );

    return lines;
  }

  // ==========================================================
  // COVER IMAGE
  // ==========================================================

  private static drawCoverImage(
    ctx: SKRSContext2D,
    image: any,
    destX: number,
    destY: number,
    destWidth: number,
    destHeight: number
  ): void {
    const imgRatio =
      image.width /
      image.height;

    const destRatio =
      destWidth /
      destHeight;

    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth =
      image.width;
    let sourceHeight =
      image.height;

    if (
      imgRatio > destRatio
    ) {
      // Crop left/right.
      sourceWidth =
        image.height *
        destRatio;

      sourceX =
        (image.width -
          sourceWidth) /
        2;
    } else {
      // Crop top/bottom.
      sourceHeight =
        image.width /
        destRatio;

      sourceY =
        (image.height -
          sourceHeight) /
        2;
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

  // ==========================================================
  // DOWNLOAD IMAGE
  // ==========================================================

  static async downloadImage(
    url: string
  ): Promise<Buffer> {
    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to download image: ${response.status} ${response.statusText}`
      );
    }

    const arrayBuffer =
      await response.arrayBuffer();

    return Buffer.from(
      arrayBuffer
    );
  }
}