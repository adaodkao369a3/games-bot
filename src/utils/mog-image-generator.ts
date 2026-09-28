import { createCanvas, GlobalFonts, loadImage, Image, SKRSContext2D } from '@napi-rs/canvas';
import { join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';

// Font loading using GlobalFonts (same approach as other generators)
const fontPath = join(cwd(), 'assets', 'fonts', 'Roboto-Bold.ttf');
let fontLoaded = false;

// Cache for star emoji images to avoid refetching (following quote renderer pattern)
const starEmojiCache = new Map<string, Image>();

// Discord emoji IDs for stars
const FULLSTAR_EMOJI_ID = '1553909316581593228';
const EMPTYSTAR_EMOJI_ID = '1553909314463473704';

try {
  if (existsSync(fontPath)) {
    const success = GlobalFonts.registerFromPath(fontPath, 'Roboto');
    if (success) {
      fontLoaded = true;
      console.log('[MogImageGenerator] Font loaded: assets/fonts/Roboto-Bold.ttf');
    } else {
      console.error('[MogImageGenerator] Font registration failed');
    }
  } else {
    console.error('[MogImageGenerator] Font file not found: assets/fonts/Roboto-Bold.ttf');
  }
} catch (error) {
  console.error('[MogImageGenerator] Failed to load font:', error);
}

export interface MogRankData {
  rank: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';
  classification: string;
  stars: number;
  title: string;
  description: string;
  theme_color: string;
  attributes: { [key: string]: number };
  analysis_attributes: string[];
}

export interface MogImageData {
  username: string;
  displayName: string;
  avatarBuffer: Buffer;
  rankData: MogRankData;
}

// Rank definitions with colors
const RANK_CONFIG = {
  'D': { classification: 'ROOKIE', color: '#2196F3', glowColor: '#64B5F6' },
  'C': { classification: 'STANDARD', color: '#0D47A1', glowColor: '#1976D2' },
  'B': { classification: 'ADVANCED', color: '#FFEB00', glowColor: '#FFF176' },
  'A': { classification: 'ELITE', color: '#FF9800', glowColor: '#FFB74D' },
  'S': { classification: 'LEGENDARY', color: '#F44336', glowColor: '#EF5350' },
  'SS': { classification: 'MYTHIC', color: '#B000FF', glowColor: '#D580FF' },
};

// Title options
const TITLES = [
  'THE FINAL CUT',
  'THE UNPATCHED BOSS',
  'THE WALKING CUTSCENE',
  'THE PLOT TWIST',
  'THE SERVER ANOMALY',
  'THE SIDE QUEST LEGEND',
  'THE HIDDEN BOSS',
  'THE SECRET ENDING',
  'THE LORE KEEPER',
  'THE SPEEDRUN PRO',
];

// Description options
const DESCRIPTIONS = [
  'Quietly ruining the plot.',
  'Breaking the meta since day one.',
  'Always one step ahead.',
  'Too cool for the main quest.',
  'Plotting in the shadows.',
  'The final boss nobody saw coming.',
  'Simply built different.',
  'Living rent-free in the lore.',
  'Too chaotic for the algorithm.',
  'Certified legend status.',
];

// Theme color palette - visually distinct colors that work with dark backgrounds
const THEME_COLORS = [
  '#8A2BE2', // Purple (original)
  '#00CED1', // Cyan
  '#00BFFF', // Deep Sky Blue
  '#1E90FF', // Dodger Blue
  '#4169E1', // Royal Blue
  '#32CD32', // Lime Green
  '#00FA9A', // Medium Spring Green
  '#FFD700', // Gold
  '#FF8C00', // Dark Orange
  '#FF6347', // Tomato
  '#FF1493', // Deep Pink
  '#FF69B4', // Hot Pink
  '#FF4500', // Orange Red
  '#DC143C', // Crimson
  '#B22222', // Fire Brick
  '#9370DB', // Medium Purple
  '#BA55D3', // Medium Orchid
  '#9932CC', // Dark Orchid
  '#8B008B', // Dark Magenta
  '#4B0082', // Indigo
];

// Taglines
const TAGLINES = [
  'RANKINGS MAY VARY',
  'SUBJECT TO RETCON',
  'POWER LEVELS: UNKNOWN',
  'META ANALYSIS: PENDING',
  'ARCHIVE CLASSIFIED',
];

// Attribute definitions with name and value range
const ATTRIBUTE_DEFINITIONS = {
  'CHAOS': { min: 1, max: 100 },
  'STYLE': { min: 1, max: 100 },
  'GRIT': { min: 1, max: 100 },
  'HAX': { min: 1, max: 100 },
  'LVL': { min: 1, max: 100 },
  'SOUL': { min: 1, max: 100 },
};

export class MogImageGenerator {
  private static readonly IMAGE_WIDTH = 1080;
  private static readonly IMAGE_HEIGHT = 1920;

  // Recalculated layout measurements
  // Header area
  private static readonly HEADER_Y = 60;
  private static readonly HEADER_BOTTOM = 130; // Header text (52px) + spacing

  // Upper section (PFP and rank badge)
  private static readonly UPPER_SECTION_TOP = 160; // Gap after header
  private static readonly AVATAR_SIZE = 652; // 450 * 1.45 = 652.5 ≈ 652 (45% increase)
  private static readonly AVATAR_X = 50; // Left margin
  private static readonly AVATAR_Y = 160; // Start of upper section
  private static readonly AVATAR_CENTER_Y = 486; // 160 + 652/2
  private static readonly RANK_BADGE_SIZE = 180; // Rank badge on right
  private static readonly RANK_BADGE_X = 880; // Right column center
  private static readonly RANK_BADGE_Y = 486; // Centered with avatar center
  private static readonly RANK_NAME_Y = 596; // Below badge (486 + 180/2 + 20)

  // Upper section bottom (max of avatar bottom and rank name bottom)
  private static readonly UPPER_SECTION_BOTTOM = 812; // Avatar bottom (160 + 652)

  // Gap after upper section
  private static readonly UPPER_SECTION_GAP = 50;

  // Stars and rating section (shifted 5% down: 862 * 1.05 = 905.1 ≈ 905)
  private static readonly STARS_Y = 905; // 5% increase from 862
  private static readonly STAR_SIZE = 80;
  private static readonly STAR_SPACING = 100;
  private static readonly RATING_Y = 970; // STARS_Y + STAR_SIZE/2 + 25

  // Stars section bottom
  private static readonly STARS_SECTION_BOTTOM = 990; // RATING_Y + 20

  // Gap after stars
  private static readonly STARS_SECTION_GAP = 40;

  // Divider (shifted down by same delta: 43px)
  private static readonly DIVIDER_Y = 1030; // 987 + 43 = 1030

  // Gap after divider
  private static readonly DIVIDER_GAP = 40;

  // Identity section (username and tag) (shifted down by same delta: 43px)
  private static readonly USERNAME_Y = 1070; // 1027 + 43 = 1070

  // Gap after identity
  private static readonly IDENTITY_GAP = 40;

  // Classification title (moved to be just above quote) (shifted down by same delta: 43px)
  private static readonly TITLE_Y = 1230; // 1320 + 43 = 1363

  // Gap after title (reduced since title is now just above quote)
  private static readonly TITLE_GAP = 20;

  // Quote/description box (shifted 20% down, then additional 43px for star shift)
  private static readonly DESCRIPTION_Y = 1370; // 1370 + 43 = 1413

  // Gap after description (reduced to fit within canvas)
  private static readonly DESCRIPTION_GAP = 25;

  // Classification Analysis section (shifted down by same delta: 43px)
  private static readonly ANALYSIS_Y = 1525; // 1495 + 43 = 1538

  // Gap after analysis (reduced to fit within canvas)
  private static readonly ANALYSIS_GAP = 20;

  // Footer (adjusted to stay within canvas bounds, shifted down by star delta)
  private static readonly FOOTER_Y = 1890; // Adjusted to fit within 1920px canvas

  /**
   * Convert hex color to rgba string
   */
  private static hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Generate MOG rank data with random distribution
   */
  static generateRankData(): MogRankData {
    // Rank distribution: D and C common, B and A uncommon, S rare, SS very rare
    const rand = Math.random() * 100;
    let rank: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';

    if (rand < 30) rank = 'D';      // 30%
    else if (rand < 55) rank = 'C'; // 25%
    else if (rand < 75) rank = 'B'; // 20%
    else if (rand < 90) rank = 'A'; // 15%
    else if (rand < 98) rank = 'S'; // 8%
    else rank = 'SS';               // 2%

    // Stars: 1-5, weighted toward middle values
    const starRand = Math.random() * 100;
    let stars: number;
    if (starRand < 15) stars = 1;
    else if (starRand < 35) stars = 2;
    else if (starRand < 65) stars = 3;
    else if (starRand < 85) stars = 4;
    else stars = 5;

    // Random title
    const title = TITLES[Math.floor(Math.random() * TITLES.length)];

    // Random description
    const description = DESCRIPTIONS[Math.floor(Math.random() * DESCRIPTIONS.length)];

    // Random theme color
    const themeColor = THEME_COLORS[Math.floor(Math.random() * THEME_COLORS.length)];

    // Generate random values for all 6 attributes
    const attributes: { [key: string]: number } = {};
    for (const [attrName, def] of Object.entries(ATTRIBUTE_DEFINITIONS)) {
      attributes[attrName] = Math.floor(Math.random() * (def.max - def.min + 1)) + def.min;
    }

    // Randomly select 3 distinct attributes for analysis
    const attributeKeys = Object.keys(ATTRIBUTE_DEFINITIONS);
    const shuffledAttributes = attributeKeys.sort(() => Math.random() - 0.5);
    const analysisAttributes = shuffledAttributes.slice(0, 3);

    return {
      rank,
      classification: RANK_CONFIG[rank].classification,
      stars,
      title,
      description,
      theme_color: themeColor,
      attributes,
      analysis_attributes: analysisAttributes,
    };
  }

  /**
   * Generate MOG card image with proper 1080x1920 layout
   */
  static async generateMogCard(data: MogImageData): Promise<Buffer> {
    if (!fontLoaded) {
      throw new Error('[MogImageGenerator] Font not loaded - cannot render image');
    }

    const { username, displayName, avatarBuffer, rankData } = data;
    const themeColor = rankData.theme_color;

    // Get rank-specific colors for decorative elements
    const rankConfig = RANK_CONFIG[rankData.rank as keyof typeof RANK_CONFIG];
    const rankColor = rankConfig?.color || '#4A90E2'; // Fallback to blue if rank not found
    const rankGlowColor = rankConfig?.glowColor || '#64B5F6'; // Fallback glow color

    // Create canvas at exact 1080x1920
    const canvas = createCanvas(this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Draw background with full canvas usage
    this.drawBackground(ctx, themeColor, rankColor);

    // Draw header
    this.drawHeader(ctx, rankColor);

    // Draw avatar on the left side of upper row
    const avatar = await loadImage(avatarBuffer);
    this.drawCircularAvatar(ctx, avatar, this.AVATAR_X, this.AVATAR_Y, this.AVATAR_SIZE, rankColor, rankGlowColor);

    // Draw rank badge on the right side of upper row (centered with avatar)
    this.drawRankBadge(ctx, rankData.rank, this.RANK_BADGE_X, this.RANK_BADGE_Y, rankColor, rankGlowColor);

    // Draw rank name (classification) below badge, centered in right column
    this.drawRankName(ctx, rankData, this.RANK_BADGE_X, this.RANK_NAME_Y);

    // Draw stars (custom emoji images, dedicated row)
    await this.drawStars(ctx, rankData.stars, this.IMAGE_WIDTH / 2, this.STARS_Y, rankColor, rankGlowColor);

    // Draw divider line
    this.drawDivider(ctx, this.IMAGE_WIDTH / 2, this.DIVIDER_Y, rankColor, rankGlowColor);

    // Draw username (major element)
    this.drawUsername(ctx, displayName, username, this.IMAGE_WIDTH / 2, this.USERNAME_Y);

    // Draw title (prominent, dedicated area)
    this.drawTitle(ctx, rankData.title, this.IMAGE_WIDTH / 2, this.TITLE_Y, rankColor, rankGlowColor);

    // Draw description (dedicated section, comfortable reading)
    this.drawDescription(ctx, rankData.description, this.IMAGE_WIDTH / 2, this.DESCRIPTION_Y, rankColor, rankGlowColor);

    // Draw classification analysis section
    this.drawClassificationAnalysis(ctx, rankData, this.IMAGE_WIDTH / 2, this.ANALYSIS_Y, themeColor, rankColor, rankGlowColor);

    // Draw footer
    this.drawFooter(ctx, rankColor, rankGlowColor);

    return canvas.toBuffer('image/png');
  }

  /**
   * Download image from URL to Buffer
   */
  static async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Loads a star emoji image from Discord CDN, using cache if available.
   * Follows the same pattern as quote renderer's loadCustomEmoji.
   */
  private static async loadStarEmoji(emojiId: string): Promise<Image | null> {
    if (starEmojiCache.has(emojiId)) {
      return starEmojiCache.get(emojiId)!;
    }

    try {
      const url = `https://cdn.discordapp.com/emojis/${emojiId}.png`;
      const image = await loadImage(url);
      starEmojiCache.set(emojiId, image);
      return image;
    } catch (error) {
      console.error(`[MogImageGenerator] Failed to load star emoji ${emojiId}:`, error);
      return null;
    }
  }

  /**
   * Draw dark futuristic background with full canvas usage
   */
  private static drawBackground(ctx: SKRSContext2D, themeColor: string, rankColor: string): void {
    // Dark blue background (matching reference)
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);

    // Subtle grid pattern (matching reference)
    ctx.strokeStyle = this.hexToRgba('#1f2937', 0.15);
    ctx.lineWidth = 1;

    const gridSize = 50;
    for (let x = 0; x < this.IMAGE_WIDTH; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.IMAGE_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < this.IMAGE_HEIGHT; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.IMAGE_WIDTH, y);
      ctx.stroke();
    }

    // Corner brackets with rank color
    this.drawCornerBracket(ctx, 30, 30, 120, 'top-left', rankColor);
    this.drawCornerBracket(ctx, this.IMAGE_WIDTH - 30, 30, 120, 'top-right', rankColor);
    this.drawCornerBracket(ctx, 30, this.IMAGE_HEIGHT - 30, 120, 'bottom-left', rankColor);
    this.drawCornerBracket(ctx, this.IMAGE_WIDTH - 30, this.IMAGE_HEIGHT - 30, 120, 'bottom-right', rankColor);

    // Add subtle radial gradient overlay for depth
    const gradient = ctx.createRadialGradient(
      this.IMAGE_WIDTH / 2, this.IMAGE_HEIGHT / 2, 0,
      this.IMAGE_WIDTH / 2, this.IMAGE_HEIGHT / 2, this.IMAGE_HEIGHT * 0.7
    );
    gradient.addColorStop(0, this.hexToRgba(themeColor, 0.05));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
  }

  /**
   * Draw corner bracket
   */
  private static drawCornerBracket(ctx: SKRSContext2D, x: number, y: number, size: number, position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right', rankColor: string): void {
    ctx.strokeStyle = rankColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = rankColor;
    ctx.shadowBlur = 10;

    ctx.beginPath();

    if (position === 'top-left') {
      ctx.moveTo(x, y + size);
      ctx.lineTo(x, y);
      ctx.lineTo(x + size, y);
    } else if (position === 'top-right') {
      ctx.moveTo(x - size, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + size);
    } else if (position === 'bottom-left') {
      ctx.moveTo(x, y - size);
      ctx.lineTo(x, y);
      ctx.lineTo(x + size, y);
    } else if (position === 'bottom-right') {
      ctx.moveTo(x - size, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y - size);
    }

    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /**
   * Draw circular avatar with border
   */
  private static drawCircularAvatar(ctx: SKRSContext2D, image: any, x: number, y: number, size: number, rankColor: string, rankGlowColor: string): void {
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const radius = size / 2;

    // Save context for clipping
    ctx.save();

    // Create circular clip
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Draw avatar with cover cropping
    this.drawCoverImage(ctx, image, x, y, size, size);

    // Restore context
    ctx.restore();

    // Draw border with rank color
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();

    ctx.strokeStyle = rankColor;
    ctx.lineWidth = 6;
    ctx.shadowColor = rankGlowColor;
    ctx.shadowBlur = 20;
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /**
   * Draw image with cover cropping
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
      sourceWidth = image.height * destRatio;
      sourceX = (image.width - sourceWidth) / 2;
    } else {
      sourceHeight = image.width / destRatio;
      sourceY = (image.height - sourceHeight) / 2;
    }

    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);
  }

  /**
   * Draw rank badge (large and prominent)
   */
  private static drawRankBadge(ctx: SKRSContext2D, rank: string, x: number, y: number, rankColor: string, rankGlowColor: string): void {
    const config = RANK_CONFIG[rank as keyof typeof RANK_CONFIG];
    const size = this.RANK_BADGE_SIZE;

    // Draw background circle with rank color
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.closePath();

    ctx.fillStyle = config.color;
    ctx.shadowColor = config.glowColor;
    ctx.shadowBlur = 50;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Draw border with rank color
    ctx.strokeStyle = rankColor;
    ctx.lineWidth = 8;
    ctx.shadowColor = rankGlowColor;
    ctx.shadowBlur = 30;
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Draw rank letter (very large)
    ctx.font = 'bold 120px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText(rank, x, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /**
   * Draw rank name (classification) prominently
   */
  private static drawRankName(ctx: SKRSContext2D, rankData: MogRankData, x: number, y: number): void {
    const config = RANK_CONFIG[rankData.rank as keyof typeof RANK_CONFIG];

    ctx.font = 'bold 36px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = config.color;
    ctx.shadowColor = config.glowColor;
    ctx.shadowBlur = 20;
    ctx.fillText(rankData.classification, x, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /**
   * Draw star rating using Discord custom emoji images
   * Following quote renderer's emoji compositing pattern
   */
  private static async drawStars(ctx: SKRSContext2D, count: number, x: number, y: number, rankColor: string, rankGlowColor: string): Promise<void> {
    const starSize = this.STAR_SIZE;
    const spacing = this.STAR_SPACING;
    const totalWidth = 5 * spacing;
    const startX = x - totalWidth / 2 + spacing / 2;

    // Use the passed y position (which should be STARS_Y)
    const starCenterY = y;

    // Load star emoji images (async, following quote renderer pattern)
    const fullStarImg = await this.loadStarEmoji(FULLSTAR_EMOJI_ID);
    const emptyStarImg = await this.loadStarEmoji(EMPTYSTAR_EMOJI_ID);

    // Verify images loaded successfully
    if (!fullStarImg || !emptyStarImg) {
      console.error('[MogImageGenerator] Failed to load star emoji images, using text fallback');
    }

    for (let i = 0; i < 5; i++) {
      const starX = startX + i * spacing;
      const filled = i < count;
      const starImg = filled ? fullStarImg : emptyStarImg;

      if (starImg) {
        // Draw star image centered at position (following quote renderer's drawImage pattern)
        ctx.drawImage(starImg, starX - starSize / 2, starCenterY - starSize / 2, starSize, starSize);
      } else {
        // Fallback to text if image fails to load
        ctx.font = `${starSize}px Roboto`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (filled) {
          ctx.fillStyle = rankColor;
          ctx.shadowColor = rankGlowColor;
          ctx.shadowBlur = 20;
        } else {
          ctx.fillStyle = this.hexToRgba(rankColor, 0.3);
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }

        ctx.fillText('★', starX, starCenterY);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
    }

    // Draw numeric rating below stars
    const numericRatingY = starCenterY + starSize / 2 + 25;
    ctx.font = 'bold 42px Roboto';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${count}/5`, x, numericRatingY);
  }

  /**
   * Draw header
   */
  private static drawHeader(ctx: SKRSContext2D, rankColor: string): void {
    ctx.font = 'bold 52px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = rankColor;
    ctx.shadowColor = rankColor;
    ctx.shadowBlur = 20;
    ctx.fillText('THE MOG FILES', this.IMAGE_WIDTH / 2, this.HEADER_Y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /**
   * Draw footer
   */
  private static drawFooter(ctx: SKRSContext2D, rankColor: string, rankGlowColor: string): void {
    const tagline = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];

    ctx.font = 'bold 28px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = this.hexToRgba(rankColor, 0.8);
    ctx.shadowColor = rankGlowColor;
    ctx.shadowBlur = 10;
    ctx.fillText(`BOMBO PRODUCTIONS • ${tagline}`, this.IMAGE_WIDTH / 2, this.FOOTER_Y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /**
   * Draw divider line
   */
  private static drawDivider(ctx: SKRSContext2D, x: number, y: number, rankColor: string, rankGlowColor: string): void {
    const width = 600;
    ctx.strokeStyle = this.hexToRgba(rankColor, 0.4);
    ctx.lineWidth = 2;
    ctx.shadowColor = rankGlowColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x - width / 2, y);
    ctx.lineTo(x + width / 2, y);
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /**
   * Draw username (major element)
   */
  private static drawUsername(ctx: SKRSContext2D, displayName: string, username: string, x: number, y: number): void {
    // Display name (large)
    const maxFontSize = 72;
    const minFontSize = 48;
    let fontSize = maxFontSize;
    const maxWidth = this.IMAGE_WIDTH - 160;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    while (fontSize > minFontSize) {
      ctx.font = `bold ${fontSize}px Roboto`;
      const metrics = ctx.measureText(displayName);
      if (metrics.width <= maxWidth) {
        break;
      }
      fontSize -= 2;
    }

    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
    ctx.fillText(displayName, x, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Username (smaller, below display name)
    ctx.font = '32px Roboto';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(`@${username}`, x, y + fontSize + 15);
  }

  /**
   * Draw title (prominent, dedicated area)
   */
  private static drawTitle(ctx: SKRSContext2D, title: string, x: number, y: number, rankColor: string, rankGlowColor: string): void {
    ctx.font = 'bold 52px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = rankColor;
    ctx.shadowColor = rankGlowColor;
    ctx.shadowBlur = 20;
    ctx.fillText(title, x, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /**
   * Draw description (dedicated section, comfortable reading with frame)
   */
  private static drawDescription(ctx: SKRSContext2D, description: string, x: number, y: number, rankColor: string, rankGlowColor: string): void {
    const padding = 40;
    const maxWidth = this.IMAGE_WIDTH - 180;
    const lineHeight = 50;

    // Word wrap the description first to calculate needed height
    ctx.font = '40px Roboto';
    const words = description.split(' ');
    let currentLine = '';
    const lines: string[] = [];

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    // Calculate frame height based on number of lines (more proportional)
    const frameHeight = Math.max(140, lines.length * lineHeight + padding * 1.5);
    const frameX = x - maxWidth / 2 - padding;
    const frameY = y - 25;

    // Draw framed background for quote section with rank color
    ctx.fillStyle = this.hexToRgba(rankColor, 0.1);
    ctx.strokeStyle = this.hexToRgba(rankColor, 0.3);
    ctx.lineWidth = 2;
    ctx.shadowColor = rankGlowColor;
    ctx.shadowBlur = 15;

    // Draw rounded rectangle background
    ctx.beginPath();
    ctx.roundRect(frameX, frameY, maxWidth + padding * 2, frameHeight, 15);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Draw the wrapped text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;

    let lineY = y + 10;
    for (const line of lines) {
      ctx.fillText(`"${line}"`, x, lineY);
      lineY += lineHeight;
    }

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /**
   * Draw classification analysis section with three stat bars
   */
  private static drawClassificationAnalysis(ctx: SKRSContext2D, rankData: MogRankData, x: number, y: number, themeColor: string, rankColor: string, rankGlowColor: string): void {
    const sectionPadding = 50;
    const barHeight = 26;
    const barSpacing = 55;
    const sectionWidth = this.IMAGE_WIDTH - (sectionPadding * 2);

    // Draw section header with rank color
    ctx.font = 'bold 32px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = rankColor;
    ctx.shadowColor = rankGlowColor;
    ctx.shadowBlur = 15;
    ctx.fillText('CLASSIFICATION ANALYSIS', x, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Calculate column widths
    const labelColumnWidth = 100; // Space for attribute names
    const valueColumnWidth = 80; // Space for numeric values
    const gapBetween = 20; // Gap between label/bar and bar/value
    const availableBarWidth = sectionWidth - labelColumnWidth - valueColumnWidth - (gapBetween * 2);

    // Draw the three selected attribute bars
    const startY = y + 55;

    rankData.analysis_attributes.forEach((attrName, index) => {
      const barY = startY + index * barSpacing;
      const attrValue = rankData.attributes[attrName];
      const attrDef = ATTRIBUTE_DEFINITIONS[attrName as keyof typeof ATTRIBUTE_DEFINITIONS];

      // Calculate bar width as percentage of max value
      const barWidth = (attrValue / attrDef.max) * availableBarWidth;

      // Draw attribute name (left aligned)
      ctx.font = 'bold 26px Roboto';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText(attrName, x - sectionWidth / 2, barY + barHeight / 2);

      // Draw background bar (centered in available space)
      const barStartX = x - sectionWidth / 2 + labelColumnWidth + gapBetween;
      ctx.fillStyle = this.hexToRgba(rankColor, 0.2);
      ctx.fillRect(barStartX, barY, availableBarWidth, barHeight);

      // Draw filled bar
      ctx.fillStyle = rankColor;
      ctx.shadowColor = rankGlowColor;
      ctx.shadowBlur = 10;
      ctx.fillRect(barStartX, barY, barWidth, barHeight);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Draw attribute value (right aligned)
      ctx.font = 'bold 26px Roboto';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText(attrValue.toString(), x + sectionWidth / 2, barY + barHeight / 2);
    });
  }
}
