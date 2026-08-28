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

const butlerFontPath = join(
  PROJECT_ROOT,
  'assets',
  'fonts',
  'Butler-Free-Bd.otf'
);

const emojiFontPath = join(
  PROJECT_ROOT,
  'assets',
  'fonts',
  'NotoColorEmoji.ttf'
);

let fontLoaded = false;
let emojiFontLoaded = false;

try {
  if (existsSync(butlerFontPath)) {
    const success = GlobalFonts.registerFromPath(
      butlerFontPath,
      'Butler'
    );

    if (success) {
      fontLoaded = true;
      console.log(
        '[QuoteImageGenerator] Font loaded: assets/fonts/Butler-Free-Bd.otf'
      );
    } else {
      console.error(
        '[QuoteImageGenerator] Butler font registration failed'
      );
    }
  } else {
    console.error(
      '[QuoteImageGenerator] Butler font file not found: assets/fonts/Butler-Free-Bd.otf'
    );
  }
} catch (error) {
  console.error(
    '[QuoteImageGenerator] Failed to load Butler font:',
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
  url: string;
}

export interface QuoteTextPart {
  type: 'text' | 'unicodeEmoji' | 'customEmoji';
  value: string;
  buffer?: Buffer;
  width?: number;
  height?: number;
}

export interface QuoteMessageData {
  username: string;
  handle: string;
  userId: string;
  avatarBuffer: Buffer;
  textParts: QuoteTextPart[];
  media: QuoteMedia[];
  hasText: boolean;
}

export interface QuoteImageData {
  message1: QuoteMessageData;
  message2?: QuoteMessageData;
  style: 'color' | 'bw';
  gradient?: GradientPresetId;
  effect?: EffectPresetId;
}

// ============================================================
// GRADIENT PRESETS
// ============================================================

export interface GradientPreset {
  label: string;
  description: string;
  color: [number, number, number];
}

export const GRADIENT_PRESETS = {
  classic: {
    label: 'Classic',
    description: 'The original black fade',
    color: [0, 0, 0],
  },

  sunset: {
    label: 'Sunset',
    description: 'Warm orange & pink glow',
    color: [255, 94, 58],
  },

  ocean: {
    label: 'Ocean',
    description: 'Deep blue & teal',
    color: [0, 90, 140],
  },

  purple: {
    label: 'Purple Haze',
    description: 'Rich violet glow',
    color: [110, 30, 160],
  },

  fire: {
    label: 'Fire',
    description: 'Hot red & amber',
    color: [200, 30, 10],
  },

  midnight: {
    label: 'Midnight',
    description: 'Deep indigo night',
    color: [15, 15, 60],
  },

  neon: {
    label: 'Neon',
    description: 'Electric pink & cyan',
    color: [255, 0, 170],
  },
} as const satisfies Record<string, GradientPreset>;

export type GradientPresetId = keyof typeof GRADIENT_PRESETS;

export const DEFAULT_GRADIENT: GradientPresetId = 'classic';

export const EFFECT_PRESETS = {
  none: {
    label: 'None',
    description: 'No overlay effect',
  },

  blackFog: {
    label: 'Black Fog',
    description: 'Soft black fog and smoke overlay',
  },
} as const;

export type EffectPresetId = keyof typeof EFFECT_PRESETS;

export const DEFAULT_EFFECT: EffectPresetId = 'none';

const EFFECT_ASSET_PATHS: Partial<Record<EffectPresetId, string>> = {
  blackFog: join(
    PROJECT_ROOT,
    'assets',
    'effects',
    'vecteezy_black-fog-smoke-overlay_75582803.png'
  ),
};

// ============================================================
// GENERATOR
// ============================================================

export class QuoteImageGenerator {
  private static readonly IMAGE_WIDTH = 1200;
  private static readonly IMAGE_HEIGHT = 630;

  /*
   * SINGLE-MESSAGE QUARTER-CIRCLE
   *
   * IMPORTANT: The 50/50 layout is preserved.
   *
   * The canvas is 1200px wide, split evenly:
   * - Left 0-600px: PFP region
   * - Right 600-1200px: Text region
   *
   * The ONLY background element is a quarter-circle gradient that serves as
   * the transition between PFP and text. The circle's center is positioned
   * toward the right side so only one quarter is visible across the PFP→text
   * boundary.
   *
   * The quarter-circle overlaps the PFP by ~10-20% (60-120px) at its deepest
   * point, creating a smooth circular arc transition without changing the
   * actual layout geometry.
   *
   * QUARTER_CIRCLE_RADIUS: Size of the circle (controls curve depth)
   * QUARTER_CIRCLE_CENTER_X: Center position (controls overlap amount)
   * QUARTER_CIRCLE_CENTER_Y: Vertical center of the circle
   */
  private static readonly QUARTER_CIRCLE_RADIUS = 450;
  private static readonly QUARTER_CIRCLE_CENTER_X = 600 + 90; // 690 - overlaps PFP by 90px (15%)
  private static readonly QUARTER_CIRCLE_CENTER_Y = 315; // Vertical center of 630px canvas

  private static readonly SINGLE_PFP = {
    x: 0,
    y: 0,
    width: 600,  // Pure 50/50 split - curve is visual only
    height: 630,
  };

  private static readonly SINGLE_NO_MEDIA = {
    quoteBox: {
      x: 610,
      y: 36,
      width: 552,
      height: 490,
    },

    barY: 546,
    usernameY: 566,
    barWidth: 140,
  };

  private static readonly SINGLE_WITH_MEDIA = {
    mediaBox: {
      x: 610,
      y: 20,
      width: 580,
      height: 590,
    },

    captionHeight: 160,
  };

  private static readonly DOUBLE_PFP = {
    width: 300,
    height: 315,
  };

  private static readonly DOUBLE_GAP = 24;

  private static readonly DOUBLE_TOP_NO_MEDIA = {
    quoteBox: {
      x: 300 + 24,
      y: 20,
      width: 1200 - 24 - (300 + 24),
      height: 225,
    },

    barY: 260,
    usernameY: 276,
    barWidth: 100,
  };

  private static readonly DOUBLE_TOP_WITH_MEDIA = {
    mediaBox: {
      x: 300 + 24,
      y: 15,
      width: 1200 - 24 - (300 + 24),
      height: 85,
    },

    quoteBox: {
      x: 300 + 24,
      y: 110,
      width: 1200 - 24 - (300 + 24),
      height: 135,
    },

    barY: 260,
    usernameY: 276,
    barWidth: 100,
  };

  private static readonly DOUBLE_BOTTOM_NO_MEDIA = {
    quoteBox: {
      x: 30,
      y: 335,
      width: 900 - 24 - 30,
      height: 225,
    },

    barY: 575,
    usernameY: 591,
    barWidth: 100,
  };

  private static readonly DOUBLE_BOTTOM_WITH_MEDIA = {
    mediaBox: {
      x: 30,
      y: 330,
      width: 900 - 24 - 30,
      height: 85,
    },

    quoteBox: {
      x: 30,
      y: 425,
      width: 900 - 24 - 30,
      height: 135,
    },

    barY: 575,
    usernameY: 591,
    barWidth: 100,
  };

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
      gradient = DEFAULT_GRADIENT,
      effect = DEFAULT_EFFECT,
    } = data;

    const isTwoMessage = !!message2;

    const canvas = createCanvas(
      this.IMAGE_WIDTH,
      this.IMAGE_HEIGHT
    );

    const ctx = canvas.getContext('2d');

    const avatar1 = await loadImage(
      message1.avatarBuffer
    );

    const avatar2 = message2
      ? await loadImage(message2.avatarBuffer)
      : null;

    this.drawBackground(
      ctx,
      gradient,
      isTwoMessage
    );

    if (isTwoMessage && avatar2) {
      await this.drawTwoMessageLayout(
        ctx,
        avatar1,
        avatar2,
        message1,
        message2,
        style,
        gradient
      );
    } else {
      await this.drawSingleMessageLayout(
        ctx,
        avatar1,
        message1,
        style,
        gradient
      );
    }

    await this.drawEffect(
      ctx,
      effect
    );

    return canvas.toBuffer('image/png');
  }

  // ==========================================================
  // BACKGROUND
  // ==========================================================

  private static drawBackground(
    ctx: SKRSContext2D,
    gradient: GradientPresetId = DEFAULT_GRADIENT,
    isTwoMessage: boolean = false
  ): void {
    ctx.save();

    // Always start with a completely black background.
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);

    if (isTwoMessage) {
      // Double-message layout:
      // Use the SAME preset color as the avatar fades and text panels so the
      // whole canvas reads as one consistent gradient instead of a black
      // backdrop with colored patches only behind the text.
      const [r, g, b] = GRADIENT_PRESETS[gradient].color;

      const fadeGradient = ctx.createLinearGradient(
        0,
        0,
        this.IMAGE_WIDTH,
        0
      );

      fadeGradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
      fadeGradient.addColorStop(0.55, `rgba(${r},${g},${b},0.3)`);
      fadeGradient.addColorStop(1, `rgba(${r},${g},${b},0.8)`);

      ctx.fillStyle = fadeGradient;
      ctx.fillRect(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
    }

    ctx.restore();
  }

  // ==========================================================
  // QUARTER-CIRCLE GRADIENT
  // ==========================================================

  /**
   * Draws a quarter-circle gradient as the ONLY background transition.
   *
   * The circle's center is positioned toward the right side so only one
   * quarter is visible across the PFP→text boundary. The gradient is
   * contained entirely within this quarter-circle.
   *
   * This is the single unified approach for ALL gradient presets - only the
   * colors change based on the preset.
   */
  private static drawQuarterCircleGradient(
    ctx: SKRSContext2D,
    gradient: GradientPresetId = DEFAULT_GRADIENT
  ): void {
    const [r, g, b] = GRADIENT_PRESETS[gradient].color;

    const centerX = this.QUARTER_CIRCLE_CENTER_X;
    const centerY = this.QUARTER_CIRCLE_CENTER_Y;
    const radius = this.QUARTER_CIRCLE_RADIUS;

    ctx.save();

    // Create a radial gradient from the circle center outward
    const radialGradient = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      radius
    );

    // Smooth multi-stop gradient: 100% → 90% → 75% → 60% → 45% → 30% → 15% → 0%
    radialGradient.addColorStop(0, `rgba(${r},${g},${b},1.0)`);
    radialGradient.addColorStop(0.15, `rgba(${r},${g},${b},0.9)`);
    radialGradient.addColorStop(0.3, `rgba(${r},${g},${b},0.75)`);
    radialGradient.addColorStop(0.45, `rgba(${r},${g},${b},0.6)`);
    radialGradient.addColorStop(0.6, `rgba(${r},${g},${b},0.45)`);
    radialGradient.addColorStop(0.75, `rgba(${r},${g},${b},0.3)`);
    radialGradient.addColorStop(0.9, `rgba(${r},${g},${b},0.15)`);
    radialGradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

    // Clip to the quarter-circle region (the arc that spans from top to bottom)
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, Math.PI / 2, false);
    ctx.lineTo(centerX, this.IMAGE_HEIGHT);
    ctx.closePath();
    ctx.clip();

    // Fill the clipped region with the radial gradient
    ctx.fillStyle = radialGradient;
    ctx.fillRect(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);

    ctx.restore();
  }

  // ==========================================================
  // EFFECT OVERLAY
  // ==========================================================

  private static async drawEffect(
    ctx: SKRSContext2D,
    effect: EffectPresetId
  ): Promise<void> {
    if (effect === 'none') {
      return;
    }

    const effectPath = EFFECT_ASSET_PATHS[effect];

    if (!effectPath || !existsSync(effectPath)) {
      console.warn(
        `[QuoteImageGenerator] Effect asset not found for "${effect}": ${effectPath ?? 'unknown'
        }`
      );

      return;
    }

    const effectImage = await loadImage(
      effectPath
    );

    ctx.save();

    ctx.globalAlpha = 0.42;

    this.drawCoverImage(
      ctx,
      effectImage,
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
      const item = media[0];

      const image =
        await this.loadImageFromBuffer(
          item.buffer
        );

      const fillAmount =
        item.type === 'sticker'
          ? 0
          : this.IMAGE_FILL_AMOUNT;

      this.drawBoxFitImage(
        ctx,
        image,
        x,
        y,
        maxWidth,
        maxHeight,
        fillAmount
      );
    } else {
      const cols = Math.ceil(
        Math.sqrt(mediaCount)
      );

      const rows = Math.ceil(
        mediaCount / cols
      );

      const cellWidth =
        maxWidth / cols;

      const cellHeight =
        maxHeight / rows;

      for (
        const [index, item]
        of media.entries()
      ) {
        const col = index % cols;
        const row = Math.floor(
          index / cols
        );

        const cellX =
          x + col * cellWidth;

        const cellY =
          y + row * cellHeight;

        const image =
          await this.loadImageFromBuffer(
            item.buffer
          );

        const fillAmount =
          item.type === 'sticker'
            ? 0
            : this.IMAGE_FILL_AMOUNT;

        this.drawBoxFitImage(
          ctx,
          image,
          cellX + 4,
          cellY + 4,
          cellWidth - 8,
          cellHeight - 8,
          fillAmount
        );
      }
    }
  }

  // ==========================================================
  // IMAGE HELPERS
  // ==========================================================

  private static fitWithinBounds(
    width: number,
    height: number,
    maxWidth: number,
    maxHeight: number
  ): {
    width: number;
    height: number;
  } {
    const ratio = Math.min(
      maxWidth / width,
      maxHeight / height
    );

    return {
      width: width * ratio,
      height: height * ratio,
    };
  }

  private static async loadImageFromBuffer(
    buffer: Buffer
  ): Promise<any> {
    return await loadImage(buffer);
  }

  private static readonly IMAGE_FILL_AMOUNT = 0.8;

  private static drawBoxFitImage(
    ctx: SKRSContext2D,
    image: any,
    x: number,
    y: number,
    maxWidth: number,
    maxHeight: number,
    fillAmount: number = this.IMAGE_FILL_AMOUNT
  ): void {
    if (
      maxWidth <= 0 ||
      maxHeight <= 0 ||
      !image.width ||
      !image.height
    ) {
      return;
    }

    const containScale = Math.min(
      maxWidth / image.width,
      maxHeight / image.height
    );

    const coverScale = Math.max(
      maxWidth / image.width,
      maxHeight / image.height
    );

    let scale =
      containScale +
      (coverScale - containScale) *
      fillAmount;

    const MAX_CROP_FRACTION = 0.2;

    const srcWidthAtScale =
      Math.min(
        image.width,
        maxWidth / scale
      );

    const srcHeightAtScale =
      Math.min(
        image.height,
        maxHeight / scale
      );

    const cropFractionW =
      1 -
      srcWidthAtScale /
      image.width;

    const cropFractionH =
      1 -
      srcHeightAtScale /
      image.height;

    if (
      Math.max(
        cropFractionW,
        cropFractionH
      ) > MAX_CROP_FRACTION
    ) {
      scale = containScale;
    }

    const srcWidth =
      Math.min(
        image.width,
        maxWidth / scale
      );

    const srcHeight =
      Math.min(
        image.height,
        maxHeight / scale
      );

    const srcX =
      (image.width - srcWidth) / 2;

    const srcY =
      (image.height - srcHeight) / 2;

    const destWidth =
      srcWidth * scale;

    const destHeight =
      srcHeight * scale;

    ctx.drawImage(
      image,
      srcX,
      srcY,
      srcWidth,
      srcHeight,
      x +
      (maxWidth - destWidth) / 2,
      y +
      (maxHeight - destHeight) / 2,
      destWidth,
      destHeight
    );
  }

  // ==========================================================
  // SINGLE MESSAGE QUOTE
  // ==========================================================

  private static async drawSingleMessageLayout(
    ctx: SKRSContext2D,
    avatar: any,
    message: QuoteMessageData,
    style: 'color' | 'bw',
    gradient: GradientPresetId = DEFAULT_GRADIENT
  ): Promise<void> {
    const pfp = this.SINGLE_PFP;

    // Draw the PFP normally with a simple linear fade (no complex curve)
    await this.drawMaskedAvatar(
      ctx,
      avatar,
      pfp.x,
      pfp.y,
      pfp.width,
      pfp.height,
      style,
      'right',
      false // No curved transition - quarter-circle handles it
    );

    // Draw the quarter-circle gradient as the ONLY background transition
    this.drawQuarterCircleGradient(ctx, gradient);

    const hasMedia =
      !!message.media?.length;

    const centerX = 900;

    if (hasMedia) {
      const mediaLayout =
        this.SINGLE_WITH_MEDIA;

      await this.drawLargeMedia(
        ctx,
        message.media,
        mediaLayout.mediaBox.x,
        mediaLayout.mediaBox.y,
        mediaLayout.mediaBox.width,
        mediaLayout.mediaBox.height
      );

      if (message.hasText) {
        const captionBox = {
          x: mediaLayout.mediaBox.x,
          y:
            mediaLayout.mediaBox.y +
            mediaLayout.mediaBox.height -
            mediaLayout.captionHeight,
          width:
            mediaLayout.mediaBox.width,
          height:
            mediaLayout.captionHeight,
        };

        const fit =
          this.fitQuoteInBox(
            ctx,
            message.textParts,
            captionBox,
            {
              preferredSize: 36,
              minimumSize: 18,
            }
          );

        this.drawTextGradient(
          ctx,
          captionBox.x,
          captionBox.y,
          captionBox.width,
          captionBox.height,
          gradient,
          'none'
        );

        const startY =
          captionBox.y +
          (captionBox.height -
            fit.blockHeight) /
          2;

        await this.drawInlineTextWithEmojis(
          ctx,
          fit.lines,
          captionBox.x +
          captionBox.width / 2,
          startY,
          fit.fontSize,
          'center'
        );
      }

      this.drawAvatarNameOverlay(
        ctx,
        message.username,
        message.handle,
        pfp.x,
        pfp.y,
        pfp.width,
        pfp.height
      );
    } else {
      const quoteLayout =
        this.SINGLE_NO_MEDIA;

      if (message.hasText) {
        const fit =
          this.fitQuoteInBox(
            ctx,
            message.textParts,
            quoteLayout.quoteBox,
            {
              preferredSize: 64,
              minimumSize: 20,
            }
          );

        this.drawTextGradient(
          ctx,
          quoteLayout.quoteBox.x,
          quoteLayout.quoteBox.y,
          quoteLayout.quoteBox.width,
          quoteLayout.quoteBox.height,
          gradient,
          'none'
        );

        const startY =
          quoteLayout.quoteBox.y +
          (quoteLayout.quoteBox.height -
            fit.blockHeight) /
          2;

        await this.drawInlineTextWithEmojis(
          ctx,
          fit.lines,
          centerX,
          startY,
          fit.fontSize,
          'center'
        );
      }

      this.drawDividerBar(
        ctx,
        centerX,
        quoteLayout.barY,
        quoteLayout.barWidth
      );

      this.drawUsername(
        ctx,
        message.username,
        centerX,
        quoteLayout.usernameY,
        true,
        'center'
      );
    }
  }

  // ==========================================================
  // AUTHOR NAME OVERLAY
  // ==========================================================

  private static drawAvatarNameOverlay(
    ctx: SKRSContext2D,
    name: string,
    handle: string,
    pfpX: number,
    pfpY: number,
    pfpWidth: number,
    pfpHeight: number
  ): void {
    const paddingX = 40;
    const paddingBottom = 56;
    const barWidth = 90;

    const handleY =
      pfpY +
      pfpHeight -
      paddingBottom;

    const barY =
      handleY - 14;

    const nameY =
      barY - 34;

    this.drawDividerBar(
      ctx,
      pfpX +
      paddingX +
      barWidth / 2,
      barY,
      barWidth
    );

    ctx.save();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.shadowColor =
      'rgba(0,0,0,0.95)';

    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.font =
      'bold 34px Butler';

    ctx.fillStyle =
      '#FFFFFF';

    ctx.fillText(
      name,
      pfpX + paddingX,
      nameY
    );

    ctx.font =
      'bold 24px Butler';

    ctx.fillStyle =
      '#A0A0A0';

    ctx.fillText(
      `@${handle}`,
      pfpX + paddingX,
      handleY
    );

    ctx.restore();
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
    style: 'color' | 'bw',
    gradient: GradientPresetId = DEFAULT_GRADIENT
  ): Promise<void> {
    const pfp = this.DOUBLE_PFP;

    await this.drawMaskedAvatar(
      ctx,
      avatar1,
      0,
      0,
      pfp.width,
      pfp.height,
      style,
      'right',
      false
    );

    const pfp2X =
      this.IMAGE_WIDTH -
      pfp.width;

    const pfp2Y =
      this.IMAGE_HEIGHT -
      pfp.height;

    await this.drawMaskedAvatar(
      ctx,
      avatar2,
      pfp2X,
      pfp2Y,
      pfp.width,
      pfp.height,
      style,
      'left',
      false
    );

    const topLayout =
      message1.media?.length
        ? this.DOUBLE_TOP_WITH_MEDIA
        : this.DOUBLE_TOP_NO_MEDIA;

    const topCenterX =
      topLayout.quoteBox.x +
      topLayout.quoteBox.width / 2;

    await this.drawDoubleTextRegion(
      ctx,
      message1,
      topCenterX,
      topLayout,
      gradient,
      'left'
    );

    const bottomLayout =
      message2.media?.length
        ? this.DOUBLE_BOTTOM_WITH_MEDIA
        : this.DOUBLE_BOTTOM_NO_MEDIA;

    const bottomCenterX =
      bottomLayout.quoteBox.x +
      bottomLayout.quoteBox.width / 2;

    await this.drawDoubleTextRegion(
      ctx,
      message2,
      bottomCenterX,
      bottomLayout,
      gradient,
      'right'
    );
  }

  private static async drawDoubleTextRegion(
    ctx: SKRSContext2D,
    message: QuoteMessageData,
    centerX: number,
    layout: {
      quoteBox: {
        x: number;
        y: number;
        width: number;
        height: number;
      };

      barY: number;
      usernameY: number;
      barWidth: number;

      mediaBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    },
    gradient: GradientPresetId = DEFAULT_GRADIENT,
    pfpEdge:
      | 'left'
      | 'right'
      | 'none' = 'none'
  ): Promise<void> {
    if (layout.mediaBox) {
      await this.drawLargeMedia(
        ctx,
        message.media,
        layout.mediaBox.x,
        layout.mediaBox.y,
        layout.mediaBox.width,
        layout.mediaBox.height
      );
    }

    if (message.hasText) {
      const fit =
        this.fitQuoteInBox(
          ctx,
          message.textParts,
          layout.quoteBox,
          {
            preferredSize: 50,
            minimumSize: 16,
          }
        );

      this.drawTextGradient(
        ctx,
        layout.quoteBox.x,
        layout.quoteBox.y,
        layout.quoteBox.width,
        layout.quoteBox.height,
        gradient,
        'none'
      );

      const startY =
        layout.quoteBox.y +
        (layout.quoteBox.height -
          fit.blockHeight) /
        2;

      await this.drawInlineTextWithEmojis(
        ctx,
        fit.lines,
        centerX,
        startY,
        fit.fontSize,
        'center'
      );
    }

    this.drawDividerBar(
      ctx,
      centerX,
      layout.barY,
      layout.barWidth
    );

    this.drawUsername(
      ctx,
      message.username,
      centerX,
      layout.usernameY,
      true,
      'center'
    );
  }

  // ==========================================================
  // CURVED AVATAR TRANSITION
  // ==========================================================

  private static async drawMaskedAvatar(
    ctx: SKRSContext2D,
    image: any,
    x: number,
    y: number,
    width: number,
    height: number,
    style: 'color' | 'bw',
    fadeEdge: 'left' | 'right',
    curvedTransition: boolean = false
  ): Promise<void> {
    if (
      width <= 0 ||
      height <= 0
    ) {
      return;
    }

    /*
     * Render the avatar to an isolated canvas first.
     *
     * This prevents destination-in from modifying the black background
     * underneath the avatar.
     */
    const offCanvas =
      createCanvas(width, height);

    const offCtx =
      offCanvas.getContext('2d');

    if (style === 'bw') {
      offCtx.filter =
        'grayscale(100%)';
    }

    this.drawCoverImage(
      offCtx,
      image,
      0,
      0,
      width,
      height
    );

    offCtx.filter = 'none';

    /*
     * The normal double-message layout keeps the old straight fade.
     *
     * The single-message layout uses the new curved transition.
     */
    if (
      curvedTransition &&
      fadeEdge === 'right'
    ) {
      this.applyCurvedRightFade(
        offCtx,
        width,
        height
      );
    } else {
      this.applyLinearFade(
        offCtx,
        width,
        height,
        fadeEdge
      );
    }

    ctx.drawImage(
      offCanvas,
      x,
      y,
      width,
      height
    );
  }

  /**
   * Simple linear fade for the PFP right edge.
   *
   * The complex curved transition is now handled by the quarter-circle
   * gradient overlay. This just provides a basic fade at the PFP edge so it
   * doesn't end abruptly.
   */
  private static applyCurvedRightFade(
    ctx: SKRSContext2D,
    width: number,
    height: number
  ): void {
    ctx.globalCompositeOperation = 'destination-in';

    const maskGradient = ctx.createLinearGradient(
      0,
      0,
      width,
      0
    );

    // Simple linear fade: fully opaque on left, semi-transparent on right
    maskGradient.addColorStop(0, 'rgba(0,0,0,1)');
    maskGradient.addColorStop(0.7, 'rgba(0,0,0,1)');
    maskGradient.addColorStop(0.85, 'rgba(0,0,0,0.7)');
    maskGradient.addColorStop(1, 'rgba(0,0,0,0.4)');

    ctx.fillStyle = maskGradient;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Original straight fade used by the two-message layout.
   */
  private static applyLinearFade(
    ctx: SKRSContext2D,
    width: number,
    height: number,
    fadeEdge: 'left' | 'right'
  ): void {
    ctx.globalCompositeOperation = 'destination-in';

    const maskGradient =
      fadeEdge === 'right'
        ? ctx.createLinearGradient(
            0,
            0,
            width,
            0
          )
        : ctx.createLinearGradient(
            0,
            0,
            width,
            0
          );

    // Floor kept well above 0 - the old stops erased the outer ~30% of the
    // avatar down to fully transparent, which is what made the PFP look
    // like it vanished. Now it only dims toward the gradient color that's
    // painted on top, same as the reference look.
    const MIN_ALPHA = 0.5;

    if (fadeEdge === 'right') {
      maskGradient.addColorStop(0, 'rgba(0,0,0,1)');
      maskGradient.addColorStop(0.6, 'rgba(0,0,0,1)');
      maskGradient.addColorStop(0.8, 'rgba(0,0,0,0.8)');
      maskGradient.addColorStop(1, `rgba(0,0,0,${MIN_ALPHA})`);
    } else {
      maskGradient.addColorStop(0, `rgba(0,0,0,${MIN_ALPHA})`);
      maskGradient.addColorStop(0.2, 'rgba(0,0,0,0.8)');
      maskGradient.addColorStop(0.4, 'rgba(0,0,0,1)');
      maskGradient.addColorStop(1, 'rgba(0,0,0,1)');
    }

    ctx.fillStyle = maskGradient;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'source-over';
  }

  // ==========================================================
  // TEXT GRADIENT
  // ==========================================================

  private static readonly PANEL_FEATHER = 34;

  private static drawTextGradient(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    gradient: GradientPresetId = DEFAULT_GRADIENT,
    pfpEdge:
      | 'left'
      | 'right'
      | 'none' = 'none'
  ): void {
    ctx.save();

    const [r, g, b] =
      GRADIENT_PRESETS[
        gradient
      ].color;

    const feather =
      this.PANEL_FEATHER;

    /*
     * The curved transition is now handled by the quarter-circle gradient.
     * This panel uses a simple soft-edged rectangle - no complex curves.
     */
    ctx.filter =
      `blur(${feather}px)`;

    ctx.beginPath();

    // Simple rectangle for all cases - curve is in PFP mask only
    ctx.rect(
      x + feather,
      y + feather,
      Math.max(
        0,
        width - feather * 2
      ),
      Math.max(
        0,
        height - feather * 2
      )
    );

    ctx.closePath();

    ctx.fillStyle =
      `rgba(${r},${g},${b},0.55)`;

    ctx.fill();

    const centerX =
      x + width / 2;

    const centerY =
      y + height / 2;

    const radius =
      Math.max(
        width,
        height
      ) * 0.85;

    const radialGradient =
      ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        radius
      );

    radialGradient.addColorStop(
      0,
      `rgba(${r},${g},${b},0.4)`
    );

    radialGradient.addColorStop(
      0.5,
      `rgba(${r},${g},${b},0.2)`
    );

    radialGradient.addColorStop(
      1,
      `rgba(${r},${g},${b},0)`
    );

    ctx.fillStyle =
      radialGradient;

    ctx.fill();

    ctx.filter = 'none';

    ctx.restore();
  }

  // ==========================================================
  // FONT SIZE / QUOTE FITTING
  // ==========================================================

  private static fitQuoteInBox(
    ctx: SKRSContext2D,
    textParts: QuoteTextPart[],
    box: {
      width: number;
      height: number;
    },
    options: {
      preferredSize: number;
      minimumSize: number;
    }
  ): {
    lines: QuoteTextPart[][];
    fontSize: number;
    blockHeight: number;
  } {
    const lineHeightRatio =
      1.2;

    for (
      let size =
        options.preferredSize;
      size >=
      options.minimumSize;
      size -= 2
    ) {
      const emojiSize =
        size * 1.05;

      ctx.font =
        `bold ${size}px Butler`;

      const lines =
        this.buildLinesWithEmojis(
          ctx,
          textParts,
          box.width,
          size,
          emojiSize
        );

      const lineHeight =
        size *
        lineHeightRatio;

      const blockHeight =
        lines.length *
        lineHeight;

      const fits =
        lines.every(
          line =>
            this.measureLineWidth(
              ctx,
              line,
              size,
              emojiSize
            ) <=
            box.width + 0.01
        );

      if (
        fits &&
        blockHeight <=
        box.height + 0.01
      ) {
        return {
          lines,
          fontSize: size,
          blockHeight,
        };
      }
    }

    const size =
      options.minimumSize;

    const emojiSize =
      size * 1.05;

    ctx.font =
      `bold ${size}px Butler`;

    const lines =
      this.buildLinesWithEmojis(
        ctx,
        textParts,
        box.width,
        size,
        emojiSize
      );

    return {
      lines,
      fontSize: size,
      blockHeight:
        lines.length *
        size *
        lineHeightRatio,
    };
  }

  private static getQuoteFontSize(
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number,
    maxHeight: number = 400
  ): number {
    const parts: QuoteTextPart[] = [
      {
        type: 'text',
        value: text,
      },
    ];

    return this.fitQuoteInBox(
      ctx,
      parts,
      {
        width: maxWidth,
        height: maxHeight,
      },
      {
        preferredSize: 64,
        minimumSize: 20,
      }
    ).fontSize;
  }

  private static getQuoteLines(
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number,
    fontSize: number = 58
  ): string[] {
    ctx.font =
      `bold ${fontSize}px Butler`;

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
        ? 29
        : 26;

    ctx.save();

    ctx.textAlign =
      align;

    ctx.textBaseline =
      'top';

    ctx.font =
      `bold ${fontSize}px Butler`;

    ctx.shadowColor =
      'rgba(0,0,0,0.95)';

    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle =
      '#A0A0A0';

    ctx.fillText(
      `${username}`,
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

    ctx.strokeStyle =
      '#FFFFFF';

    ctx.lineWidth = 1;

    ctx.beginPath();

    ctx.moveTo(
      centerX - width / 2,
      y
    );

    ctx.lineTo(
      centerX + width / 2,
      y
    );

    ctx.stroke();

    ctx.restore();
  }

  // ==========================================================
  // INLINE TEXT + EMOJI RENDERER
  // ==========================================================

  private static async drawInlineTextWithEmojis(
    ctx: SKRSContext2D,
    lines: QuoteTextPart[][],
    x: number,
    y: number,
    fontSize: number,
    align:
      | 'left'
      | 'right'
      | 'center' = 'left'
  ): Promise<void> {
    const lineHeight =
      fontSize * 1.2;

    const emojiSize =
      fontSize * 1.05;

    ctx.save();

    ctx.textAlign =
      'left';

    ctx.textBaseline =
      'top';

    ctx.font =
      `bold ${fontSize}px Butler`;

    ctx.shadowColor =
      'rgba(0,0,0,0.95)';

    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;

    ctx.fillStyle =
      '#FFFFFF';

    for (
      const [lineIndex, line]
      of lines.entries()
    ) {
      const lineY =
        y +
        lineIndex *
        lineHeight;

      const lineWidth =
        this.measureLineWidth(
          ctx,
          line,
          fontSize,
          emojiSize
        );

      let currentX =
        align === 'center'
          ? x - lineWidth / 2
          : align === 'right'
            ? x - lineWidth
            : x;

      for (
        const part
        of line
      ) {
        if (
          part.type === 'text'
        ) {
          ctx.fillText(
            part.value,
            currentX,
            lineY
          );

          currentX +=
            ctx.measureText(
              part.value
            ).width;
        } else if (
          part.buffer
        ) {
          const scaled =
            this.fitWithinBounds(
              part.width ||
              emojiSize,
              part.height ||
              emojiSize,
              emojiSize,
              emojiSize
            );

          const image =
            await this.loadImageFromBuffer(
              part.buffer
            );

          ctx.drawImage(
            image,
            currentX,
            lineY +
            (lineHeight -
              scaled.height) /
            2,
            scaled.width,
            scaled.height
          );

          currentX +=
            scaled.width;
        } else if (
          part.value
        ) {
          ctx.save();

          ctx.font =
            `${fontSize}px NotoColorEmoji, Butler`;

          ctx.fillText(
            part.value,
            currentX,
            lineY
          );

          const fallbackWidth =
            ctx.measureText(
              part.value
            ).width ||
            emojiSize;

          ctx.restore();

          currentX +=
            fallbackWidth;
        }
      }
    }

    ctx.restore();
  }

  private static buildLinesWithEmojis(
    ctx: SKRSContext2D,
    textParts: QuoteTextPart[],
    maxWidth: number,
    fontSize: number,
    emojiSize: number
  ): QuoteTextPart[][] {
    const lines: QuoteTextPart[][] =
      [];

    let currentLine:
      QuoteTextPart[] = [];

    let currentWidth = 0;

    const pushLine = () => {
      if (
        currentLine.length > 0
      ) {
        lines.push(
          currentLine
        );
      }

      currentLine = [];
      currentWidth = 0;
    };

    const addTextToken = (
      token: string
    ) => {
      if (!token) {
        return;
      }

      const width =
        ctx.measureText(
          token
        ).width;

      if (
        currentWidth +
        width <=
        maxWidth
      ) {
        currentLine.push({
          type: 'text',
          value: token,
        });

        currentWidth +=
          width;

        return;
      }

      if (
        /^\s+$/.test(token)
      ) {
        return;
      }

      if (
        currentLine.length > 0
      ) {
        pushLine();
      }

      if (
        width >
        maxWidth
      ) {
        let chunk = '';

        for (
          const char
          of Array.from(token)
        ) {
          const test =
            chunk + char;

          if (
            ctx.measureText(
              test
            ).width <=
            maxWidth
          ) {
            chunk = test;
          } else {
            if (chunk) {
              lines.push([
                {
                  type: 'text',
                  value: chunk,
                },
              ]);
            }

            chunk = char;
          }
        }

        if (chunk) {
          currentLine = [
            {
              type: 'text',
              value: chunk,
            },
          ];

          currentWidth =
            ctx.measureText(
              chunk
            ).width;
        }
      } else {
        currentLine.push({
          type: 'text',
          value: token,
        });

        currentWidth =
          width;
      }
    };

    for (
      const part
      of textParts
    ) {
      if (
        part.type === 'text'
      ) {
        const normalized =
          part.value
            .replace(
              /\r\n/g,
              '\n'
            )
            .replace(
              /\r/g,
              '\n'
            );

        const pieces =
          normalized.split(
            /(\n|\s+)/
          );

        for (
          const piece
          of pieces
        ) {
          if (!piece) {
            continue;
          }

          if (
            piece === '\n'
          ) {
            pushLine();
            continue;
          }

          addTextToken(
            piece
          );
        }
      } else {
        if (
          currentWidth +
          emojiSize >
          maxWidth &&
          currentLine.length >
          0
        ) {
          pushLine();
        }

        currentLine.push(
          part
        );

        currentWidth +=
          emojiSize;
      }
    }

    pushLine();

    if (
      lines.length === 0
    ) {
      return [
        [
          {
            type: 'text',
            value: '""',
          },
        ],
      ];
    }

    return lines;
  }

  private static measureLineWidth(
    ctx: SKRSContext2D,
    line: QuoteTextPart[],
    _fontSize: number,
    emojiSize: number
  ): number {
    let width = 0;

    for (
      const part
      of line
    ) {
      if (
        part.type === 'text'
      ) {
        width +=
          ctx.measureText(
            part.value
          ).width;
      } else {
        width +=
          emojiSize;
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

    ctx.textAlign =
      align;

    ctx.textBaseline =
      'top';

    ctx.font =
      `bold ${fontSize}px Butler`;

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
          y +
          index *
          lineHeight
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
    if (
      !text ||
      !text.trim()
    ) {
      return ['""'];
    }

    const words =
      text
        .trim()
        .split(/\s+/);

    const lines: string[] =
      [];

    for (
      const word
      of words
    ) {
      if (
        ctx.measureText(
          word
        ).width >
        maxWidth
      ) {
        const charLines =
          this.splitLongWord(
            ctx,
            word,
            maxWidth
          );

        lines.push(
          ...charLines
        );
      } else {
        if (
          lines.length === 0
        ) {
          lines.push(
            word
          );
        } else {
          const lastLine =
            lines[
            lines.length - 1
            ];

          const testLine =
            lastLine +
            ' ' +
            word;

          if (
            ctx.measureText(
              testLine
            ).width <=
            maxWidth
          ) {
            lines[
              lines.length - 1
            ] = testLine;
          } else {
            lines.push(
              word
            );
          }
        }
      }
    }

    return lines;
  }

  private static splitLongWord(
    ctx: SKRSContext2D,
    word: string,
    maxWidth: number
  ): string[] {
    const lines: string[] =
      [];

    let currentLine = '';

    for (
      const char
      of word
    ) {
      const testLine =
        currentLine +
        char;

      if (
        ctx.measureText(
          testLine
        ).width <=
        maxWidth
      ) {
        currentLine =
          testLine;
      } else {
        if (
          currentLine
        ) {
          lines.push(
            currentLine
          );
        }

        currentLine =
          char;
      }
    }

    if (
      currentLine
    ) {
      lines.push(
        currentLine
      );
    }

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
      imgRatio >
      destRatio
    ) {
      sourceWidth =
        image.height *
        destRatio;

      sourceX =
        (image.width -
          sourceWidth) /
        2;
    } else {
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