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

export interface QuoteMedia {
  type: 'image' | 'gif' | 'sticker';
  buffer: Buffer;
  width: number;
  height: number;
  url: string; // For deduplication
}

export interface QuoteTextPart {
  type: 'text' | 'unicodeEmoji' | 'customEmoji';
  value: string;
  buffer?: Buffer; // For emoji images
  width?: number;
  height?: number;
}

export interface QuoteMessageData {
  username: string;
  userId: string;
  avatarBuffer: Buffer;
  
  // Text content broken into parts (text, unicode emojis, custom emojis)
  textParts: QuoteTextPart[];
  
  // Media attachments (images, gifs, stickers)
  media: QuoteMedia[];
  
  // Whether the message has actual text content
  hasText: boolean;
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
  private static readonly IMAGE_HEIGHT = 630;

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
  // LARGE MEDIA RENDERING
  // ==========================================================

  private static async drawLargeMedia(
    ctx: SKRSContext2D,
    media: QuoteMedia[],
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
      // Single image: fit within bounds with object-fit: contain behavior
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
      // Multiple images: create a grid
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
          cellWidth - 8, // Padding
          cellHeight - 8
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

  // ==========================================================
  // CUSTOM EMOJI RENDERING (REMOVED - will be handled in text parts)
  // ==========================================================

  // ==========================================================
  // EMBEDDED MEDIA RENDERING (REMOVED - will be handled with new media system)
  // ==========================================================

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
  // SINGLE MESSAGE QUOTE
  // ==========================================================

  private static async drawSingleMessageLayout(
    ctx: SKRSContext2D,
    avatar: any,
    message: QuoteMessageData,
    style: 'color' | 'bw'
  ): Promise<void> {
    // ========================================================
    // PFP - Full height, anchored at top-left
    // ========================================================

    /*
     * PFP touches:
     * - top edge (y = 0)
     * - left edge (x = 0)
     * - bottom edge (extends to IMAGE_HEIGHT)
     * Takes up 50% of the image width
     */
    const pfpX = 0;
    const pfpY = 0;
    const pfpWidth = this.IMAGE_WIDTH * 0.5;
    const pfpHeight = this.IMAGE_HEIGHT;

    ctx.save();

    if (style === 'bw') {
      ctx.filter = 'grayscale(100%)';
    }

    this.drawCoverImage(
      ctx,
      avatar,
      pfpX,
      pfpY,
      pfpWidth,
      pfpHeight
    );

    ctx.restore();

    /*
     * PFP fades ONLY toward:
     * - right
     * - bottom
     *
     * Its top-left corner stays fully visible.
     */
    this.drawDirectionalFade(
      ctx,
      pfpX,
      pfpY,
      pfpWidth,
      pfpHeight,
      'right-bottom'
    );

    // ========================================================
    // TEXT - Full right half vertically
    // ========================================================

    // Right half region: x = 50% → 100%, y = 0% → 100%
    const textRegionX = this.IMAGE_WIDTH * 0.5;
    const textRegionWidth = this.IMAGE_WIDTH * 0.5;
    const textRegionCenterX = textRegionX + textRegionWidth / 2;
    const textRegionCenterY = this.IMAGE_HEIGHT * 0.5;

    // Build text content from text parts
    const textContent = message.textParts
      .filter(part => part.type === 'text')
      .map(part => part.value)
      .join('');

    // Only render text if there's actual text or emoji content
    const shouldRenderText = message.hasText;
    
    // Calculate content height based on what we have
    let contentHeight = 0;
    let textHeight = 0;
    let mediaHeight = 0;
    
    if (shouldRenderText) {
      const quoteFontSize = this.getQuoteFontSize(ctx, textContent, textRegionWidth - 100);
      const quoteLines = this.getQuoteLines(ctx, textContent, textRegionWidth - 100, quoteFontSize);
      const quoteLineHeight = quoteFontSize * 1.25;
      textHeight = quoteLines.length * quoteLineHeight;
      contentHeight += textHeight;
    }
    
    if (message.media && message.media.length > 0) {
      // Calculate media height (large, as primary content)
      const maxMediaHeight = 250; // Large media area
      mediaHeight = maxMediaHeight;
      if (shouldRenderText) {
        contentHeight += 20; // Spacing between text and media
      }
      contentHeight += mediaHeight;
    }
    
    const dividerHeight = 20;
    const usernameSpacing = 40;
    const usernameHeight = 42;
    const totalHeight = contentHeight + dividerHeight + usernameSpacing + usernameHeight;
    
    // Vertically center the complete content block within the right region
    const contentStartY = textRegionCenterY - totalHeight / 2;
    let currentY = contentStartY;
    
    // Draw text gradient only if we have text
    if (shouldRenderText) {
      this.drawTextGradient(
        ctx,
        textRegionX + 50,
        currentY - 20,
        textRegionWidth - 100,
        textHeight + 40
      );
      
      const quoteFontSize = this.getQuoteFontSize(ctx, textContent, textRegionWidth - 100);
      const quoteLines = this.getQuoteLines(ctx, textContent, textRegionWidth - 100, quoteFontSize);
      const quoteLineHeight = quoteFontSize * 1.25;
      
      await this.drawInlineTextWithEmojis(
        ctx,
        message.textParts,
        textRegionCenterX,
        currentY,
        textRegionWidth - 100,
        'center',
        quoteFontSize
      );
      
      currentY += textHeight + 40;
    }
    
    // Draw media as large primary content
    if (message.media && message.media.length > 0) {
      await this.drawLargeMedia(
        ctx,
        message.media,
        textRegionCenterX - (textRegionWidth - 100) / 2,
        currentY,
        textRegionWidth - 100,
        mediaHeight
      );
      currentY += mediaHeight;
    }
    
    // Draw horizontal divider bar
    if (shouldRenderText || (message.media && message.media.length > 0)) {
      this.drawDividerBar(
        ctx,
        textRegionCenterX,
        currentY + usernameSpacing,
        120
      );
    }
    
    // Draw username
    this.drawUsername(
      ctx,
      message.username,
      textRegionCenterX,
      currentY + usernameSpacing + dividerHeight,
      true,
      'center'
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

    // Build text content from text parts
    const topTextContent = message1.textParts
      .filter(part => part.type === 'text')
      .map(part => part.value)
      .join('');

    const shouldRenderTopText = message1.hasText;
    
    // Calculate content height for top message
    let topContentHeight = 0;
    let topTextHeight = 0;
    let topMediaHeight = 0;
    
    if (shouldRenderTopText) {
      const topFontSize = this.getQuoteFontSize(ctx, topTextContent, 500);
      const topLines = this.getQuoteLines(ctx, topTextContent, 500, topFontSize);
      const topLineHeight = topFontSize * 1.25;
      topTextHeight = topLines.length * topLineHeight;
      topContentHeight += topTextHeight;
    }
    
    if (message1.media && message1.media.length > 0) {
      const maxMediaHeight = 100; // Smaller for two-message layout
      topMediaHeight = maxMediaHeight;
      if (shouldRenderTopText) {
        topContentHeight += 15; // Spacing
      }
      topContentHeight += topMediaHeight;
    }
    
    const topUsernameSpacing = 25;
    const topUsernameHeight = 32;
    const topTotalHeight = topContentHeight + topUsernameSpacing + topUsernameHeight;
    
    // Center the entire block in the top-right quarter
    const topContentStartY = topTextCenterY - topTotalHeight / 2;
    let currentTopY = topContentStartY;
    
    // Draw text gradient only if we have text
    if (shouldRenderTopText) {
      this.drawTextGradient(
        ctx,
        topTextCenterX - 290,
        currentTopY - 15,
        580,
        topTextHeight + 30
      );
      
      const topFontSize = this.getQuoteFontSize(ctx, topTextContent, 500);
      const topLines = this.getQuoteLines(ctx, topTextContent, 500, topFontSize);
      
      await this.drawInlineTextWithEmojis(
        ctx,
        message1.textParts,
        topTextCenterX,
        currentTopY,
        500,
        'center',
        topFontSize
      );
      
      currentTopY += topTextHeight + 15;
    }
    
    // Draw media for top message
    if (message1.media && message1.media.length > 0) {
      await this.drawLargeMedia(
        ctx,
        message1.media,
        topTextCenterX - 240,
        currentTopY,
        480,
        topMediaHeight
      );
      currentTopY += topMediaHeight;
    }
    
    // Draw horizontal divider bar
    if (shouldRenderTopText || (message1.media && message1.media.length > 0)) {
      this.drawDividerBar(
        ctx,
        topTextCenterX,
        currentTopY + topUsernameSpacing,
        60
      );
    }
    
    // Draw username
    this.drawUsername(
      ctx,
      message1.username,
      topTextCenterX,
      currentTopY + topUsernameSpacing + 20,
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

    // Build text content from text parts
    const bottomTextContent = message2.textParts
      .filter(part => part.type === 'text')
      .map(part => part.value)
      .join('');

    const shouldRenderBottomText = message2.hasText;
    
    // Calculate content height for bottom message
    let bottomContentHeight = 0;
    let bottomTextHeight = 0;
    let bottomMediaHeight = 0;
    
    if (shouldRenderBottomText) {
      const bottomFontSize = this.getQuoteFontSize(ctx, bottomTextContent, 500);
      const bottomLines = this.getQuoteLines(ctx, bottomTextContent, 500, bottomFontSize);
      const bottomLineHeight = bottomFontSize * 1.25;
      bottomTextHeight = bottomLines.length * bottomLineHeight;
      bottomContentHeight += bottomTextHeight;
    }
    
    if (message2.media && message2.media.length > 0) {
      const maxMediaHeight = 100; // Smaller for two-message layout
      bottomMediaHeight = maxMediaHeight;
      if (shouldRenderBottomText) {
        bottomContentHeight += 15; // Spacing
      }
      bottomContentHeight += bottomMediaHeight;
    }
    
    const bottomUsernameSpacing = 25;
    const bottomUsernameHeight = 32;
    const bottomTotalHeight = bottomContentHeight + bottomUsernameSpacing + bottomUsernameHeight;
    
    // Center the complete block in the bottom-left quarter
    const bottomContentStartY = bottomTextCenterY - bottomTotalHeight / 2;
    let currentBottomY = bottomContentStartY;
    
    // Draw text gradient only if we have text
    if (shouldRenderBottomText) {
      this.drawTextGradient(
        ctx,
        bottomTextCenterX - 290,
        currentBottomY - 15,
        580,
        bottomTextHeight + 30
      );
      
      const bottomFontSize = this.getQuoteFontSize(ctx, bottomTextContent, 500);
      const bottomLines = this.getQuoteLines(ctx, bottomTextContent, 500, bottomFontSize);
      
      await this.drawInlineTextWithEmojis(
        ctx,
        message2.textParts,
        bottomTextCenterX,
        currentBottomY,
        500,
        'center',
        bottomFontSize
      );
      
      currentBottomY += bottomTextHeight + 15;
    }
    
    // Draw media for bottom message
    if (message2.media && message2.media.length > 0) {
      await this.drawLargeMedia(
        ctx,
        message2.media,
        bottomTextCenterX - 240,
        currentBottomY,
        480,
        bottomMediaHeight
      );
      currentBottomY += bottomMediaHeight;
    }
    
    // Draw horizontal divider bar
    if (shouldRenderBottomText || (message2.media && message2.media.length > 0)) {
      this.drawDividerBar(
        ctx,
        bottomTextCenterX,
        currentBottomY + bottomUsernameSpacing,
        60
      );
    }
    
    // Draw username
    this.drawUsername(
      ctx,
      message2.username,
      bottomTextCenterX,
      currentBottomY + bottomUsernameSpacing + 20,
      true,
      'center'
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
    const preferredSize = 68;
    const minimumSize = 44;

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
  // DIVIDER BAR
  // ==========================================================

  private static drawDividerBar(
    ctx: SKRSContext2D,
    centerX: number,
    y: number,
    width: number
  ): void {
    ctx.save();
    
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    ctx.moveTo(centerX - width / 2, y);
    ctx.lineTo(centerX + width / 2, y);
    ctx.stroke();
    
    ctx.restore();
  }

  // ==========================================================
  // INLINE TEXT + EMOJI RENDERER
  // ==========================================================

  private static async drawInlineTextWithEmojis(
    ctx: SKRSContext2D,
    textParts: QuoteTextPart[],
    x: number,
    y: number,
    maxWidth: number,
    align: 'left' | 'right' | 'center' = 'left',
    fontSize: number = 58
  ): Promise<void> {
    const lineHeight = fontSize * 1.25;
    const emojiSize = fontSize * 1.1; // Emojis slightly larger than text
    
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${fontSize}px Roboto`;
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#FFFFFF';
    
    // Build lines with mixed text and emoji
    const lines = await this.buildLinesWithEmojis(ctx, textParts, maxWidth, fontSize, emojiSize);
    
    // Draw each line
    for (const [lineIndex, line] of lines.entries()) {
      const lineY = y + lineIndex * lineHeight;
      let currentX = x;
      
      // Adjust X based on alignment
      if (align === 'center') {
        const lineWidth = this.measureLineWidth(line, fontSize, emojiSize);
        currentX = x - lineWidth / 2;
      } else if (align === 'right') {
        const lineWidth = this.measureLineWidth(line, fontSize, emojiSize);
        currentX = x - lineWidth;
      }
      
      // Draw each part in the line
      for (const part of line) {
        if (part.type === 'text') {
          ctx.fillText(part.value, currentX, lineY);
          currentX += ctx.measureText(part.value).width;
        } else if ((part.type === 'unicodeEmoji' || part.type === 'customEmoji') && part.buffer) {
          // Draw emoji image
          const scaled = this.fitWithinBounds(
            part.width || emojiSize,
            part.height || emojiSize,
            emojiSize,
            emojiSize
          );
          const image = await this.loadImageFromBuffer(part.buffer);
          ctx.drawImage(
            image,
            currentX,
            lineY + (lineHeight - scaled.height) / 2,
            scaled.width,
            scaled.height
          );
          currentX += scaled.width;
        }
      }
    }
    
    ctx.restore();
  }
  
  private static async buildLinesWithEmojis(
    ctx: SKRSContext2D,
    textParts: QuoteTextPart[],
    maxWidth: number,
    fontSize: number,
    emojiSize: number
  ): Promise<QuoteTextPart[][]> {
    const lines: QuoteTextPart[][] = [];
    let currentLine: QuoteTextPart[] = [];
    let currentLineWidth = 0;
    
    for (const part of textParts) {
      if (part.type === 'text') {
        const words = part.value.split(' ');
        
        for (const word of words) {
          const wordWidth = ctx.measureText(word + ' ').width;
          
          if (currentLineWidth + wordWidth <= maxWidth) {
            // Add to current line
            currentLine.push({ type: 'text', value: word + ' ' });
            currentLineWidth += wordWidth;
          } else {
            // Start new line
            if (currentLine.length > 0) {
              lines.push(currentLine);
            }
            currentLine = [{ type: 'text', value: word + ' ' }];
            currentLineWidth = wordWidth;
          }
        }
      } else if (part.type === 'unicodeEmoji' || part.type === 'customEmoji') {
        const emojiWidth = emojiSize;
        
        if (currentLineWidth + emojiWidth <= maxWidth) {
          currentLine.push(part);
          currentLineWidth += emojiWidth;
        } else {
          if (currentLine.length > 0) {
            lines.push(currentLine);
          }
          currentLine = [part];
          currentLineWidth = emojiWidth;
        }
      }
    }
    
    // Add last line
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
    
    return lines;
  }
  
  private static measureLineWidth(line: QuoteTextPart[], fontSize: number, emojiSize: number): number {
    let width = 0;
    for (const part of line) {
      if (part.type === 'text') {
        // This is approximate - would need ctx for accurate measurement
        width += part.value.length * fontSize * 0.6; // Rough estimate
      } else {
        width += emojiSize;
      }
    }
    return width;
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