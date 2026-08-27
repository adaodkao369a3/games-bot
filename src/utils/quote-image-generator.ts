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
  handle: string; // raw @handle, shown alongside the display name
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
  gradient?: GradientPresetId;
  effect?: EffectPresetId;
}

// ============================================================
// GRADIENT PRESETS
// ============================================================
// Each preset defines the tint used for the PFP fade and the
// backing gradient behind quote text. "classic" reproduces the
// original pure-black fade exactly (default, unchanged look).

export interface GradientPreset {
  label: string;
  description: string;
  color: [number, number, number]; // RGB tint used for fades/glow
}

export const GRADIENT_PRESETS = {
  classic: { label: 'Classic', description: 'The original black fade', color: [0, 0, 0] },
  sunset: { label: 'Sunset', description: 'Warm orange & pink glow', color: [255, 94, 58] },
  ocean: { label: 'Ocean', description: 'Deep blue & teal', color: [0, 90, 140] },
  purple: { label: 'Purple Haze', description: 'Rich violet glow', color: [110, 30, 160] },
  fire: { label: 'Fire', description: 'Hot red & amber', color: [200, 30, 10] },
  midnight: { label: 'Midnight', description: 'Deep indigo night', color: [15, 15, 60] },
  neon: { label: 'Neon', description: 'Electric pink & cyan', color: [255, 0, 170] },
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

  // Fixed visual regions. Content is allowed to resize only INSIDE
  // its own quote box; the PFP, divider bar, and username never move.
  // Margins are kept tight and, critically, EQUAL on both sides of the
  // box's own half so the box reads as centered fill rather than
  // arbitrarily offset padding.
  private static readonly SINGLE_PFP = { x: 0, y: 0, width: 600, height: 630 };
  // Right half spans x=600..1200 (600px wide). A 24px margin on both
  // sides keeps the box symmetric while claiming as much width as possible.
  private static readonly SINGLE_NO_MEDIA = {
    quoteBox: { x: 624, y: 36, width: 552, height: 490 },
    barY: 546,
    usernameY: 566,
    barWidth: 140,
  };
  // When the quoted message includes media, the entire right half is
  // handed over to the image/gif/sticker - no quote box, no divider bar,
  // no username row competing for space on that side. A caption (if the
  // message also has text) is overlaid directly on the media instead of
  // taking its own box, and the author name/handle move onto the PFP.
  private static readonly SINGLE_WITH_MEDIA = {
    mediaBox: { x: 610, y: 20, width: 580, height: 590 },
    captionHeight: 160,
  };

  // Each half of a two-message quote is 600x315. The PFP is exactly
  // half of its half: 300px wide, full 315px height, pinned to the
  // outer corner so it does not leave the unwanted gap underneath.
  // The quote box on the OTHER side of that same half must start right
  // where the PFP ends (plus a small breathing-room gap) and run all the
  // way to the outer edge - otherwise a dead strip of bare background
  // opens up between the avatar card and the text box, which is exactly
  // what makes the box look like it's floating, detached, in its own
  // little island. GAP is that breathing room; it's small and identical
  // on both the PFP side and the outer-edge side.
  private static readonly DOUBLE_PFP = { width: 300, height: 315 };
  private static readonly DOUBLE_GAP = 24;
  private static readonly DOUBLE_TOP_NO_MEDIA = {
    // Avatar1 occupies x:0-300, so the box starts right after it.
    quoteBox: { x: 300 + 24, y: 20, width: 1200 - 24 - (300 + 24), height: 225 },
    barY: 260,
    usernameY: 276,
    barWidth: 100,
  };
  private static readonly DOUBLE_TOP_WITH_MEDIA = {
    mediaBox: { x: 300 + 24, y: 15, width: 1200 - 24 - (300 + 24), height: 85 },
    quoteBox: { x: 300 + 24, y: 110, width: 1200 - 24 - (300 + 24), height: 135 },
    barY: 260,
    usernameY: 276,
    barWidth: 100,
  };
  private static readonly DOUBLE_BOTTOM_NO_MEDIA = {
    // Avatar2 occupies x:900-1200, so the box ends right before it.
    quoteBox: { x: 30, y: 335, width: 900 - 24 - 30, height: 225 },
    barY: 575,
    usernameY: 591,
    barWidth: 100,
  };
  private static readonly DOUBLE_BOTTOM_WITH_MEDIA = {
    mediaBox: { x: 30, y: 330, width: 900 - 24 - 30, height: 85 },
    quoteBox: { x: 30, y: 425, width: 900 - 24 - 30, height: 135 },
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

    // Load avatars
    const avatar1 = await loadImage(
      message1.avatarBuffer
    );

    const avatar2 = message2
      ? await loadImage(message2.avatarBuffer)
      : null;

    // Base backdrop reflects the chosen gradient's mood instead of always
    // being flat black - only "classic" stays pure black.
    this.drawBackground(ctx, gradient);

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

    // Effects are deliberately applied last so the selected PNG overlays
    // the complete finished quote card, including the avatar, text, and
    // gradient wash.
    await this.drawEffect(ctx, effect);

    return canvas.toBuffer('image/png');
  }

  // ==========================================================
  // BACKGROUND
  // ==========================================================

  private static drawBackground(
    ctx: SKRSContext2D,
    gradient: GradientPresetId = DEFAULT_GRADIENT
  ): void {
    ctx.save();

    // One continuous base color across the entire canvas. This is important:
    // when an avatar is alpha-masked, this exact color shows through instead
    // of exposing a different-colored/black region on the right side.
    const BASE_BLUE = '#0a3d62';
    ctx.fillStyle = BASE_BLUE;
    ctx.fillRect(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);

    const [r, g, b] = GRADIENT_PRESETS[gradient].color;

    // Keep the gradient tint as a translucent wash over the same base blue.
    // "Classic" simply leaves the unified blue untouched.
    if (gradient !== 'classic') {
      ctx.fillStyle = `rgba(${r},${g},${b},0.35)`;
      ctx.fillRect(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);

      const wash = ctx.createRadialGradient(
        this.IMAGE_WIDTH / 2,
        this.IMAGE_HEIGHT / 2,
        0,
        this.IMAGE_WIDTH / 2,
        this.IMAGE_HEIGHT / 2,
        Math.max(this.IMAGE_WIDTH, this.IMAGE_HEIGHT) * 0.75
      );

      wash.addColorStop(0, `rgba(${r},${g},${b},0.24)`);
      wash.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
    }

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
        `[QuoteImageGenerator] Effect asset not found for "${effect}": ${effectPath ?? 'unknown'}`
      );
      return;
    }

    const effectImage = await loadImage(effectPath);

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
      // Single image: fill ~80% of the way from "contain" to "cover" so it
      // reads as big and prominent, while never spilling outside its box.
      // Stickers are always shown fully "contain" instead - they're small
      // graphics (often with transparent padding baked in) where cropping
      // any edge cuts off part of the actual artwork.
      const item = media[0];
      const image = await this.loadImageFromBuffer(item.buffer);
      const fillAmount = item.type === 'sticker' ? 0 : this.IMAGE_FILL_AMOUNT;
      this.drawBoxFitImage(ctx, image, x, y, maxWidth, maxHeight, fillAmount);
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

        const image = await this.loadImageFromBuffer(item.buffer);
        const fillAmount = item.type === 'sticker' ? 0 : this.IMAGE_FILL_AMOUNT;
        this.drawBoxFitImage(
          ctx,
          image,
          cellX + 4,
          cellY + 4,
          cellWidth - 8, // Padding
          cellHeight - 8,
          fillAmount
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
  // BOX-FIT IMAGE (bigger images without spilling into other areas)
  // ==========================================================
  // Plain "contain" fit (the old behavior) can leave large empty gaps when
  // an image's aspect ratio doesn't match its box, making it look small.
  // This blends 80% of the way from "contain" (fully visible, may
  // letterbox) to "cover" (fills the box completely, may crop) so images
  // read as big and intentional. It never draws outside [x, y, maxWidth,
  // maxHeight] - the box next to it is never touched.
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
    if (maxWidth <= 0 || maxHeight <= 0 || !image.width || !image.height) {
      return;
    }

    const containScale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const coverScale = Math.max(maxWidth / image.width, maxHeight / image.height);
    let scale = containScale + (coverScale - containScale) * fillAmount;

    // Cap how much of the source image the "cover" blend is allowed to
    // crop away. When the box's aspect ratio is very different from the
    // image's own (e.g. a wide 1200x630 quote card getting embedded into a
    // squarer box), blending 80% toward cover would slice off a big chunk
    // of the image - it visibly "runs out of frame". If the crop implied
    // by the current scale would exceed that budget, fall back toward
    // "contain" instead so the whole image stays visible.
    const MAX_CROP_FRACTION = 0.2;
    const srcWidthAtScale = Math.min(image.width, maxWidth / scale);
    const srcHeightAtScale = Math.min(image.height, maxHeight / scale);
    const cropFractionW = 1 - srcWidthAtScale / image.width;
    const cropFractionH = 1 - srcHeightAtScale / image.height;
    if (Math.max(cropFractionW, cropFractionH) > MAX_CROP_FRACTION) {
      scale = containScale;
    }

    // Source crop needed so the scaled result never exceeds the box.
    const srcWidth = Math.min(image.width, maxWidth / scale);
    const srcHeight = Math.min(image.height, maxHeight / scale);
    const srcX = (image.width - srcWidth) / 2;
    const srcY = (image.height - srcHeight) / 2;

    const destWidth = srcWidth * scale;
    const destHeight = srcHeight * scale;

    ctx.drawImage(
      image,
      srcX,
      srcY,
      srcWidth,
      srcHeight,
      x + (maxWidth - destWidth) / 2,
      y + (maxHeight - destHeight) / 2,
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
    // LEFT HALF: permanently reserved for the PFP.
    const pfp = this.SINGLE_PFP;
    await this.drawMaskedAvatar(
      ctx,
      avatar,
      pfp.x,
      pfp.y,
      pfp.width,
      pfp.height,
      style,
      'right'
    );

    const hasMedia = !!message.media?.length;
    const centerX = 900;

    if (hasMedia) {
      // RIGHT HALF: handed entirely to the media - no quote box splitting
      // the space. Caption text (if any) overlays the bottom of the image
      // instead of taking its own row, and the author name/handle sit on
      // the PFP instead of the right side.
      const mediaLayout = this.SINGLE_WITH_MEDIA;
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
          y: mediaLayout.mediaBox.y + mediaLayout.mediaBox.height - mediaLayout.captionHeight,
          width: mediaLayout.mediaBox.width,
          height: mediaLayout.captionHeight,
        };

        const fit = this.fitQuoteInBox(
          ctx,
          message.textParts,
          captionBox,
          { preferredSize: 36, minimumSize: 18 }
        );

        this.drawTextGradient(ctx, captionBox.x, captionBox.y, captionBox.width, captionBox.height, gradient);

        const startY = captionBox.y + (captionBox.height - fit.blockHeight) / 2;

        await this.drawInlineTextWithEmojis(
          ctx,
          fit.lines,
          captionBox.x + captionBox.width / 2,
          startY,
          fit.fontSize,
          'center'
        );
      }

      // Author name + handle live on the PFP itself, near the bottom but
      // clear of the very edge so they don't feel cramped against it.
      this.drawAvatarNameOverlay(ctx, message.username, message.handle, pfp.x, pfp.y, pfp.width, pfp.height);
    } else {
      // RIGHT HALF: permanently reserved for quote + fixed author area.
      const quoteLayout = this.SINGLE_NO_MEDIA;

      if (message.hasText) {
        const fit = this.fitQuoteInBox(
          ctx,
          message.textParts,
          quoteLayout.quoteBox,
          { preferredSize: 64, minimumSize: 20 }
        );

        this.drawTextGradient(
          ctx,
          quoteLayout.quoteBox.x,
          quoteLayout.quoteBox.y,
          quoteLayout.quoteBox.width,
          quoteLayout.quoteBox.height,
          gradient
        );

        const startY =
          quoteLayout.quoteBox.y +
          (quoteLayout.quoteBox.height - fit.blockHeight) / 2;

        await this.drawInlineTextWithEmojis(
          ctx,
          fit.lines,
          centerX,
          startY,
          fit.fontSize,
          'center'
        );
      }

      // FIXED: this area never follows quote length.
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
  // AUTHOR NAME OVERLAY ON PFP (used when media takes the whole
  // opposite half, so the author's name/handle move onto the avatar)
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
    // Kept clear of the very bottom edge rather than flush against it.
    const paddingBottom = 56;
    const barWidth = 90;

    const handleY = pfpY + pfpHeight - paddingBottom;
    const barY = handleY - 14;
    const nameY = barY - 34;

    this.drawDividerBar(ctx, pfpX + paddingX + barWidth / 2, barY, barWidth);

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.font = 'bold 34px Butler';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(name, pfpX + paddingX, nameY);

    ctx.font = 'bold 24px Butler';
    ctx.fillStyle = '#A0A0A0';
    ctx.fillText(`@${handle}`, pfpX + paddingX, handleY);

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

    // TOP-LEFT PFP: 50% of the top half, full height, pinned to top-left.
    await this.drawMaskedAvatar(
      ctx,
      avatar1,
      0,
      0,
      pfp.width,
      pfp.height,
      style,
      'right'
    );

    // BOTTOM-RIGHT PFP: 50% of the bottom half, full height, pinned to bottom-right.
    const pfp2X = this.IMAGE_WIDTH - pfp.width;
    const pfp2Y = this.IMAGE_HEIGHT - pfp.height;
    await this.drawMaskedAvatar(
      ctx,
      avatar2,
      pfp2X,
      pfp2Y,
      pfp.width,
      pfp.height,
      style,
      'left'
    );

    // Center each text region on its OWN quote box (not a fixed constant) -
    // the box width/position now varies to hug the avatar and fill the
    // rest of its half, so the horizontal center moves with it.
    const topLayout = message1.media?.length ? this.DOUBLE_TOP_WITH_MEDIA : this.DOUBLE_TOP_NO_MEDIA;
    const topCenterX = topLayout.quoteBox.x + topLayout.quoteBox.width / 2;

    await this.drawDoubleTextRegion(
      ctx, message1, topCenterX,
      topLayout,
      gradient
    );

    const bottomLayout = message2.media?.length ? this.DOUBLE_BOTTOM_WITH_MEDIA : this.DOUBLE_BOTTOM_NO_MEDIA;
    const bottomCenterX = bottomLayout.quoteBox.x + bottomLayout.quoteBox.width / 2;

    await this.drawDoubleTextRegion(
      ctx, message2, bottomCenterX,
      bottomLayout,
      gradient
    );
  }

  private static async drawDoubleTextRegion(
    ctx: SKRSContext2D,
    message: QuoteMessageData,
    centerX: number,
    layout: {
      quoteBox: { x: number; y: number; width: number; height: number };
      barY: number;
      usernameY: number;
      barWidth: number;
      mediaBox?: { x: number; y: number; width: number; height: number };
    },
    gradient: GradientPresetId = DEFAULT_GRADIENT
  ): Promise<void> {
    if (layout.mediaBox) {
      await this.drawLargeMedia(
        ctx, message.media,
        layout.mediaBox.x, layout.mediaBox.y,
        layout.mediaBox.width, layout.mediaBox.height
      );
    }

    if (message.hasText) {
      const fit = this.fitQuoteInBox(
        ctx,
        message.textParts,
        layout.quoteBox,
        { preferredSize: 50, minimumSize: 16 }
      );

      this.drawTextGradient(
        ctx,
        layout.quoteBox.x, layout.quoteBox.y,
        layout.quoteBox.width, layout.quoteBox.height,
        gradient
      );

      const startY = layout.quoteBox.y + (layout.quoteBox.height - fit.blockHeight) / 2;
      await this.drawInlineTextWithEmojis(
        ctx, fit.lines, centerX, startY, fit.fontSize, 'center'
      );
    }

    // FIXED author area. It is never pushed up/down by text length.
    this.drawDividerBar(ctx, centerX, layout.barY, layout.barWidth);
    this.drawUsername(ctx, message.username, centerX, layout.usernameY, true, 'center');
  }

  // ==========================================================
  // DIRECTIONAL IMAGE FADE
  // ==========================================================

  private static async drawMaskedAvatar(
    ctx: SKRSContext2D,
    image: any,
    x: number,
    y: number,
    width: number,
    height: number,
    style: 'color' | 'bw',
    fadeEdge: 'left' | 'right'
  ): Promise<void> {
    if (width <= 0 || height <= 0) {
      return;
    }

    // Render the cropped avatar onto an off-screen canvas first. The alpha
    // mask is then applied to that image only, so destination-in can never
    // erase the unified background beneath it.
    const offCanvas = createCanvas(width, height);
    const offCtx = offCanvas.getContext('2d');

    if (style === 'bw') {
      offCtx.filter = 'grayscale(100%)';
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
    offCtx.globalCompositeOperation = 'destination-in';

    const fadeStart = width * 0.5;
    const maskGradient = fadeEdge === 'right'
      ? offCtx.createLinearGradient(fadeStart, 0, width, 0)
      : offCtx.createLinearGradient(0, 0, width - fadeStart, 0);

    if (fadeEdge === 'right') {
      maskGradient.addColorStop(0, 'rgba(0,0,0,1)');
      maskGradient.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      maskGradient.addColorStop(0, 'rgba(0,0,0,0)');
      maskGradient.addColorStop(1, 'rgba(0,0,0,1)');
    }

    offCtx.fillStyle = maskGradient;
    offCtx.fillRect(0, 0, width, height);

    ctx.drawImage(offCanvas, x, y, width, height);
  }

  // ==========================================================
  // TEXT GRADIENT
  // ==========================================================

  // Feather radius for the text panel's edges. Blurring the fill instead
  // of hard-cutting it at [x, y, width, height] is what makes the panel
  // dissolve into the surrounding background wash instead of reading as
  // a floating card with a visible seam/border - "seamless" comes from
  // the edge literally being soft, not from color-matching alone.
  private static readonly PANEL_FEATHER = 34;

  private static drawTextGradient(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    gradient: GradientPresetId = DEFAULT_GRADIENT
  ): void {
    ctx.save();

    const [r, g, b] = GRADIENT_PRESETS[gradient].color;
    const feather = this.PANEL_FEATHER;

    // Inset the actual fill so that after blurring, the flat/opaque part
    // of the panel still roughly matches the intended box footprint,
    // with the blur radius spreading softly beyond it into the
    // background rather than eating into the box's usable interior.
    ctx.filter = `blur(${feather}px)`;

    // Solid color base first, so the WHOLE box - corners included - reads
    // as the chosen gradient's color. Without this, the radial highlight
    // below fades all the way to transparent at the box edges/corners,
    // which lets the near-black canvas underneath show through and makes
    // every gradient look like a black box instead of its own color.
    ctx.fillStyle = `rgba(${r},${g},${b},0.55)`;
    ctx.fillRect(
      x + feather,
      y + feather,
      Math.max(0, width - feather * 2),
      Math.max(0, height - feather * 2)
    );

    // Soft radial highlight on top for a bit of depth in the center.
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const radius = Math.max(width, height) * 0.85;

    const radialGradient = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      radius
    );

    radialGradient.addColorStop(0, `rgba(${r},${g},${b},0.4)`);
    radialGradient.addColorStop(0.5, `rgba(${r},${g},${b},0.2)`);
    radialGradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

    ctx.fillStyle =
      radialGradient;

    ctx.fillRect(
      x + feather,
      y + feather,
      Math.max(0, width - feather * 2),
      Math.max(0, height - feather * 2)
    );

    ctx.filter = 'none';
    ctx.restore();
  }

  // ==========================================================
  // FONT SIZE / QUOTE FITTING
  // ==========================================================

  private static fitQuoteInBox(
    ctx: SKRSContext2D,
    textParts: QuoteTextPart[],
    box: { width: number; height: number },
    options: { preferredSize: number; minimumSize: number }
  ): { lines: QuoteTextPart[][]; fontSize: number; blockHeight: number } {
    const lineHeightRatio = 1.2;

    for (let size = options.preferredSize; size >= options.minimumSize; size -= 2) {
      const emojiSize = size * 1.05;
      ctx.font = `bold ${size}px Butler`;
      const lines = this.buildLinesWithEmojis(ctx, textParts, box.width, size, emojiSize);
      const lineHeight = size * lineHeightRatio;
      const blockHeight = lines.length * lineHeight;

      const fits = lines.every(line =>
        this.measureLineWidth(ctx, line, size, emojiSize) <= box.width + 0.01
      );

      if (fits && blockHeight <= box.height + 0.01) {
        return { lines, fontSize: size, blockHeight };
      }
    }

    // The wrapper splits overlong words, so the minimum size should normally fit.
    const size = options.minimumSize;
    const emojiSize = size * 1.05;
    ctx.font = `bold ${size}px Butler`;
    const lines = this.buildLinesWithEmojis(ctx, textParts, box.width, size, emojiSize);
    return { lines, fontSize: size, blockHeight: lines.length * size * lineHeightRatio };
  }

  private static getQuoteFontSize(
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number,
    maxHeight: number = 400
  ): number {
    // Kept for compatibility with any external/internal callers.
    const parts: QuoteTextPart[] = [{ type: 'text', value: text }];
    return this.fitQuoteInBox(
      ctx, parts, { width: maxWidth, height: maxHeight },
      { preferredSize: 64, minimumSize: 20 }
    ).fontSize;
  }

  private static getQuoteLines(
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number,
    fontSize: number = 58
  ): string[] {
    ctx.font = `bold ${fontSize}px Butler`;
    return this.wrapText(ctx, text, maxWidth);
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
    // 20% smaller than the original 36 / 32px sizes.
    const fontSize =
      isProminent
        ? 29
        : 26;

    ctx.save();

    ctx.textAlign = align;
    ctx.textBaseline = 'top';

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
    lines: QuoteTextPart[][],
    x: number,
    y: number,
    fontSize: number,
    align: 'left' | 'right' | 'center' = 'left'
  ): Promise<void> {
    const lineHeight = fontSize * 1.2;
    const emojiSize = fontSize * 1.05;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${fontSize}px Butler`;
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#FFFFFF';

    for (const [lineIndex, line] of lines.entries()) {
      const lineY = y + lineIndex * lineHeight;
      const lineWidth = this.measureLineWidth(ctx, line, fontSize, emojiSize);
      let currentX = align === 'center' ? x - lineWidth / 2 : align === 'right' ? x - lineWidth : x;

      for (const part of line) {
        if (part.type === 'text') {
          ctx.fillText(part.value, currentX, lineY);
          currentX += ctx.measureText(part.value).width;
        } else if (part.buffer) {
          const scaled = this.fitWithinBounds(
            part.width || emojiSize, part.height || emojiSize,
            emojiSize, emojiSize
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
        } else if (part.value) {
          // Fallback: we couldn't fetch an image for this emoji (network
          // failure, unrecognized codepoint, etc). Render the raw glyph
          // with the bundled emoji font instead of silently dropping it.
          ctx.save();
          ctx.font = `${fontSize}px NotoColorEmoji, Butler`;
          ctx.fillText(part.value, currentX, lineY);
          const fallbackWidth = ctx.measureText(part.value).width || emojiSize;
          ctx.restore();
          currentX += fallbackWidth;
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
    const lines: QuoteTextPart[][] = [];
    let currentLine: QuoteTextPart[] = [];
    let currentWidth = 0;

    const pushLine = () => {
      // Do not emit whitespace-only lines.
      if (currentLine.length > 0) {
        lines.push(currentLine);
      }
      currentLine = [];
      currentWidth = 0;
    };

    const addTextToken = (token: string) => {
      if (!token) return;
      const width = ctx.measureText(token).width;

      if (currentWidth + width <= maxWidth) {
        currentLine.push({ type: 'text', value: token });
        currentWidth += width;
        return;
      }

      // Whitespace belongs to the following word only when there is room.
      if (/^\s+$/.test(token)) return;

      if (currentLine.length > 0) pushLine();

      // A single giant word must also be split character-by-character.
      if (width > maxWidth) {
        let chunk = '';
        for (const char of Array.from(token)) {
          const test = chunk + char;
          if (ctx.measureText(test).width <= maxWidth) {
            chunk = test;
          } else {
            if (chunk) lines.push([{ type: 'text', value: chunk }]);
            chunk = char;
          }
        }
        if (chunk) {
          currentLine = [{ type: 'text', value: chunk }];
          currentWidth = ctx.measureText(chunk).width;
        }
      } else {
        currentLine.push({ type: 'text', value: token });
        currentWidth = width;
      }
    };

    for (const part of textParts) {
      if (part.type === 'text') {
        const normalized = part.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const pieces = normalized.split(/(\n|\s+)/);

        for (const piece of pieces) {
          if (!piece) continue;
          if (piece === '\n') {
            pushLine();
            continue;
          }
          addTextToken(piece);
        }
      } else {
        if (currentWidth + emojiSize > maxWidth && currentLine.length > 0) {
          pushLine();
        }
        currentLine.push(part);
        currentWidth += emojiSize;
      }
    }

    pushLine();

    if (lines.length === 0) {
      return [[{ type: 'text', value: '""' }]];
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
    for (const part of line) {
      if (part.type === 'text') {
        width += ctx.measureText(part.value).width;
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

    for (const word of words) {
      // Check if the word itself is wider than maxWidth
      if (ctx.measureText(word).width > maxWidth) {
        // Split the word character by character
        const charLines = this.splitLongWord(ctx, word, maxWidth);
        lines.push(...charLines);
      } else {
        // Normal word wrapping
        if (lines.length === 0) {
          lines.push(word);
        } else {
          const lastLine = lines[lines.length - 1];
          const testLine = lastLine + ' ' + word;

          if (ctx.measureText(testLine).width <= maxWidth) {
            lines[lines.length - 1] = testLine;
          } else {
            lines.push(word);
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
    const lines: string[] = [];
    let currentLine = '';

    for (const char of word) {
      const testLine = currentLine + char;

      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = char;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
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