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
}

export interface MogImageData {
  username: string;
  displayName: string;
  avatarBuffer: Buffer;
  rankData: MogRankData;
}

// Rank definitions with colors
const RANK_CONFIG = {
  'D': { classification: 'ROOKIE', color: '#888888', glowColor: '#AAAAAA' },
  'C': { classification: 'STANDARD', color: '#4CAF50', glowColor: '#66BB6A' },
  'B': { classification: 'ADVANCED', color: '#2196F3', glowColor: '#42A5F5' },
  'A': { classification: 'ELITE', color: '#9C27B0', glowColor: '#BA68C8' },
  'S': { classification: 'LEGENDARY', color: '#FF9800', glowColor: '#FFB74D' },
  'SS': { classification: 'MYTHIC', color: '#F44336', glowColor: '#EF5350' },
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

export class MogImageGenerator {
  private static readonly IMAGE_WIDTH = 1080;
  private static readonly IMAGE_HEIGHT = 1920;
  private static readonly AVATAR_SIZE = 340; // ~30% of upper half (960px)
  private static readonly HEADER_Y = 60;
  private static readonly AVATAR_Y = 130;
  private static readonly RANK_BADGE_Y = 520;
  private static readonly RANK_NAME_Y = 630;
  private static readonly STARS_Y = 730;
  private static readonly DIVIDER_Y = 860;
  private static readonly USERNAME_Y = 910;
  private static readonly TITLE_Y = 1050;
  private static readonly DESCRIPTION_Y = 1250;
  private static readonly FOOTER_Y = 1820;

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

    return {
      rank,
      classification: RANK_CONFIG[rank].classification,
      stars,
      title,
      description,
      theme_color: themeColor,
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

    // Create canvas at exact 1080x1920
    const canvas = createCanvas(this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Draw background with full canvas usage
    this.drawBackground(ctx, themeColor);

    // Draw header
    this.drawHeader(ctx, themeColor);

    // Draw avatar as major feature (~30% of upper half)
    const avatarX = (this.IMAGE_WIDTH - this.AVATAR_SIZE) / 2;
    const avatar = await loadImage(avatarBuffer);
    this.drawCircularAvatar(ctx, avatar, avatarX, this.AVATAR_Y, this.AVATAR_SIZE, themeColor);

    // Draw rank badge (prominent, centered under avatar)
    this.drawRankBadge(ctx, rankData.rank, this.IMAGE_WIDTH / 2, this.RANK_BADGE_Y, themeColor);

    // Draw rank name (classification) - below badge, fully visible
    this.drawRankName(ctx, rankData, this.IMAGE_WIDTH / 2, this.RANK_NAME_Y, themeColor);

    // Draw stars (custom emoji images, dedicated row)
    await this.drawStars(ctx, rankData.stars, this.IMAGE_WIDTH / 2, this.STARS_Y);

    // Draw divider line
    this.drawDivider(ctx, this.IMAGE_WIDTH / 2, this.DIVIDER_Y, themeColor);

    // Draw username (major element)
    this.drawUsername(ctx, displayName, username, this.IMAGE_WIDTH / 2, this.USERNAME_Y, themeColor);

    // Draw title (prominent, dedicated area)
    this.drawTitle(ctx, rankData.title, this.IMAGE_WIDTH / 2, this.TITLE_Y, themeColor);

    // Draw description (dedicated section, comfortable reading)
    this.drawDescription(ctx, rankData.description, this.IMAGE_WIDTH / 2, this.DESCRIPTION_Y, themeColor);

    // Draw footer
    this.drawFooter(ctx);

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
  private static drawBackground(ctx: SKRSContext2D, themeColor: string): void {
    // Dark navy background
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, this.IMAGE_WIDTH, this.IMAGE_HEIGHT);

    // Subtle grid pattern with theme color (more refined)
    ctx.strokeStyle = this.hexToRgba(themeColor, 0.08);
    ctx.lineWidth = 1;

    const gridSize = 60;
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

    // Corner brackets (larger, more prominent)
    this.drawCornerBracket(ctx, 30, 30, 120, 'top-left', themeColor);
    this.drawCornerBracket(ctx, this.IMAGE_WIDTH - 30, 30, 120, 'top-right', themeColor);
    this.drawCornerBracket(ctx, 30, this.IMAGE_HEIGHT - 30, 120, 'bottom-left', themeColor);
    this.drawCornerBracket(ctx, this.IMAGE_WIDTH - 30, this.IMAGE_HEIGHT - 30, 120, 'bottom-right', themeColor);

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
  private static drawCornerBracket(ctx: SKRSContext2D, x: number, y: number, size: number, position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right', themeColor: string): void {
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = themeColor;
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
  private static drawCircularAvatar(ctx: SKRSContext2D, image: any, x: number, y: number, size: number, themeColor: string): void {
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

    // Draw border
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();
    
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 6;
    ctx.shadowColor = themeColor;
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
  private static drawRankBadge(ctx: SKRSContext2D, rank: string, x: number, y: number, themeColor: string): void {
    const config = RANK_CONFIG[rank as keyof typeof RANK_CONFIG];
    const size = 180;

    // Draw background circle
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.closePath();

    ctx.fillStyle = config.color;
    ctx.shadowColor = config.glowColor;
    ctx.shadowBlur = 50;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Draw border with theme color
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 8;
    ctx.shadowColor = themeColor;
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
  private static drawRankName(ctx: SKRSContext2D, rankData: MogRankData, x: number, y: number, themeColor: string): void {
    const config = RANK_CONFIG[rankData.rank as keyof typeof RANK_CONFIG];

    ctx.font = 'bold 48px Roboto';
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
  private static async drawStars(ctx: SKRSContext2D, count: number, x: number, y: number): Promise<void> {
    const starSize = 80;
    const spacing = 100;
    const totalWidth = 5 * spacing;
    const startX = x - totalWidth / 2 + spacing / 2;

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
        ctx.drawImage(starImg, starX - starSize / 2, y - starSize / 2, starSize, starSize);
      } else {
        // Fallback to text if image fails to load
        ctx.font = `${starSize}px Roboto`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (filled) {
          ctx.fillStyle = '#FFD700';
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = 20;
        } else {
          ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }

        ctx.fillText('★', starX, y);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
    }

    // Draw numeric rating (prominent)
    ctx.font = 'bold 42px Roboto';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${count}/5`, x, y + starSize / 2 + 25);
  }

  /**
   * Draw header
   */
  private static drawHeader(ctx: SKRSContext2D, themeColor: string): void {
    ctx.font = 'bold 52px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = themeColor;
    ctx.shadowColor = themeColor;
    ctx.shadowBlur = 20;
    ctx.fillText('THE MOG FILES', this.IMAGE_WIDTH / 2, this.HEADER_Y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /**
   * Draw footer
   */
  private static drawFooter(ctx: SKRSContext2D): void {
    const tagline = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];

    ctx.font = 'bold 28px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText(`BOMBO PRODUCTIONS • ${tagline}`, this.IMAGE_WIDTH / 2, this.FOOTER_Y);
  }

  /**
   * Draw divider line
   */
  private static drawDivider(ctx: SKRSContext2D, x: number, y: number, themeColor: string): void {
    const width = 600;
    ctx.strokeStyle = this.hexToRgba(themeColor, 0.4);
    ctx.lineWidth = 2;
    ctx.shadowColor = themeColor;
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
  private static drawUsername(ctx: SKRSContext2D, displayName: string, username: string, x: number, y: number, themeColor: string): void {
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
  private static drawTitle(ctx: SKRSContext2D, title: string, x: number, y: number, themeColor: string): void {
    ctx.font = 'bold 52px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = themeColor;
    ctx.shadowColor = themeColor;
    ctx.shadowBlur = 20;
    ctx.fillText(title, x, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /**
   * Draw description (dedicated section, comfortable reading with frame)
   */
  private static drawDescription(ctx: SKRSContext2D, description: string, x: number, y: number, themeColor: string): void {
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

    // Draw framed background for quote section
    ctx.fillStyle = this.hexToRgba(themeColor, 0.1);
    ctx.strokeStyle = this.hexToRgba(themeColor, 0.3);
    ctx.lineWidth = 2;
    ctx.shadowColor = themeColor;
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
}
