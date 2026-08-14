import { createCanvas, GlobalFonts, loadImage, SKRSContext2D } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = cwd();

// Font loading using GlobalFonts (same approach as wheel)
const fontPath = join(PROJECT_ROOT, 'assets', 'fonts', 'Roboto-Bold.ttf');
let fontLoaded = false;

try {
  if (existsSync(fontPath)) {
    const success = GlobalFonts.registerFromPath(fontPath, 'Roboto');
    if (success) {
      fontLoaded = true;
      console.log('[QuickDrawImageGenerator] Font loaded: assets/fonts/Roboto-Bold.ttf');
    } else {
      console.error('[QuickDrawImageGenerator] Font registration failed');
    }
  } else {
    console.error('[QuickDrawImageGenerator] Font file not found: assets/fonts/Roboto-Bold.ttf');
  }
} catch (error) {
  console.error('[QuickDrawImageGenerator] Failed to load font:', error);
}

export interface DuelHeaderConfig {
  player1Avatar: string;
  player2Avatar: string;
  countdown?: number;
}

/**
 * Generate a duel header image with both players' avatars and optional countdown
 */
export class QuickDrawImageGenerator {
  private static readonly HEADER_WIDTH = 800;
  private static readonly HEADER_HEIGHT = 300;
  private static readonly AVATAR_SIZE = 120;
  private static readonly AVATAR_RADIUS = 60;
  private static readonly COUNTDOWN_RADIUS = 40;
  private static readonly COUNTDOWN_FONT_SIZE = 48;

  /**
   * Generate duel header image with both avatars and optional countdown number
   */
  static async generateDuelHeader(config: DuelHeaderConfig): Promise<Buffer> {
    if (!fontLoaded) {
      throw new Error('[QuickDrawImageGenerator] Font not loaded - cannot render header');
    }

    const canvas = createCanvas(this.HEADER_WIDTH, this.HEADER_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.HEADER_WIDTH, this.HEADER_HEIGHT);

    // Calculate positions
    const centerX = this.HEADER_WIDTH / 2;
    const centerY = this.HEADER_HEIGHT / 2;
    const avatar1X = centerX - 200;
    const avatar2X = centerX + 200;
    const avatarY = centerY;

    // Load and draw avatars
    const avatar1Image = await loadImage(config.player1Avatar);
    const avatar2Image = await loadImage(config.player2Avatar);

    // Draw Player 1 avatar (circular)
    this.drawCircularAvatar(ctx, avatar1Image, avatar1X, avatarY, this.AVATAR_RADIUS);

    // Draw Player 2 avatar (circular)
    this.drawCircularAvatar(ctx, avatar2Image, avatar2X, avatarY, this.AVATAR_RADIUS);

    // Draw countdown badge if provided
    if (config.countdown !== undefined) {
      this.drawCountdownBadge(ctx, centerX, centerY, config.countdown);
    } else {
      // Draw VS text when no countdown
      this.drawVSText(ctx, centerX, centerY);
    }

    return canvas.toBuffer('image/png');
  }

  /**
   * Draw a circular avatar
   */
  private static drawCircularAvatar(
    ctx: SKRSContext2D,
    image: any,
    x: number,
    y: number,
    radius: number
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();

    // Add border
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  /**
   * Draw countdown badge with number
   */
  private static drawCountdownBadge(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    number: number
  ): void {
    const radius = this.COUNTDOWN_RADIUS;

    // Badge background
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#2d2d44';
    ctx.fill();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Countdown number
    ctx.font = `bold ${this.COUNTDOWN_FONT_SIZE}px Roboto`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), x, y);
  }

  /**
   * Draw VS text in center
   */
  private static drawVSText(ctx: SKRSContext2D, x: number, y: number): void {
    ctx.font = 'bold 36px Roboto';
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', x, y);
  }
}
