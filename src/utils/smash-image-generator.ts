import { createCanvas, GlobalFonts, loadImage, SKRSContext2D } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = cwd();

// Font loading using GlobalFonts (same approach as Wordle)
const fontPath = join(PROJECT_ROOT, 'assets', 'fonts', 'Roboto-Bold.ttf');
let fontLoaded = false;

try {
  if (existsSync(fontPath)) {
    const success = GlobalFonts.registerFromPath(fontPath, 'Roboto');
    if (success) {
      fontLoaded = true;
      console.log('[SmashImageGenerator] Font loaded: assets/fonts/Roboto-Bold.ttf');
    } else {
      console.error('[SmashImageGenerator] Font registration failed');
    }
  } else {
    console.error('[SmashImageGenerator] Font file not found: assets/fonts/Roboto-Bold.ttf');
  }
} catch (error) {
  console.error('[SmashImageGenerator] Failed to load font:', error);
}

export interface SmashImageData {
  subject1Name: string;
  subject1Image: Buffer;
  subject2Name: string;
  subject2Image: Buffer;
  subject1Votes: number;
  subject2Votes: number;
  isResult?: boolean;
  winner?: 'subject1' | 'subject2' | 'tie';
}

export class SmashImageGenerator {
  private static readonly IMAGE_WIDTH = 1800;
  private static readonly IMAGE_HEIGHT = 900;
  private static readonly AVATAR_WIDTH = 900;
  private static readonly AVATAR_HEIGHT = 900;
  private static readonly OVERLAY_SIZE = 540;

  /**
   * Generate a voting state image with vote counts
   */
  static async generateVotingImage(data: SmashImageData): Promise<Buffer> {
    const { subject1Image, subject2Image, subject1Votes, subject2Votes, subject1Name, subject2Name } = data;

    if (!fontLoaded) {
      throw new Error('[SmashImageGenerator] Font not loaded - cannot render image');
    }

    // Create canvas
    const canvas = createCanvas(this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Load images
    const image1 = await loadImage(subject1Image);
    const image2 = await loadImage(subject2Image);

    // Draw images with cover cropping
    this.drawCoverImage(ctx, image1, 0, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT);
    this.drawCoverImage(ctx, image2, this.AVATAR_WIDTH, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT);

    // Draw vote counts
    this.drawVoteCount(ctx, subject1Votes, 60, 100, 'left');
    this.drawVoteCount(ctx, subject2Votes, this.IMAGE_WIDTH - 60, 100, 'right');

    // Draw names
    this.drawUsername(ctx, subject1Name, this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT - 50, this.AVATAR_WIDTH - 40);
    this.drawUsername(ctx, subject2Name, this.AVATAR_WIDTH + this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT - 50, this.AVATAR_WIDTH - 40);

    return canvas.toBuffer('image/png');
  }

  /**
   * Generate a result image with smash/pass PNG overlays
   */
  static async generateResultImage(data: SmashImageData): Promise<Buffer> {
    if (!fontLoaded) {
      throw new Error('[SmashImageGenerator] Font not loaded - cannot render image');
    }

    const { subject1Image, subject2Image, subject1Votes, subject2Votes, winner, subject1Name, subject2Name } = data;

    console.log('[SmashImageGenerator] Generating result image');

    const totalVotes = subject1Votes + subject2Votes;
    const isZeroVoteTie = totalVotes === 0;

    // Create canvas
    const canvas = createCanvas(this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Load images
    const image1 = await loadImage(subject1Image);
    const image2 = await loadImage(subject2Image);

    // Apply treatments based on winner
    // In a tie (including 0-0), both subjects are winners (full color)
    const isTie = winner === 'tie';
    const subject1IsWinner = isTie || winner === 'subject1';
    const subject2IsWinner = isTie || winner === 'subject2';

    // Draw images with cover cropping and treatments
    this.drawCoverImageWithTreatment(ctx, image1, 0, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT, subject1IsWinner);
    this.drawCoverImageWithTreatment(ctx, image2, this.AVATAR_WIDTH, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT, subject2IsWinner);

    // Load and draw overlays
    try {
      const smashPath = join(PROJECT_ROOT, 'smash.png');
      const passPath = join(PROJECT_ROOT, 'pass.png');

      if (!existsSync(smashPath)) {
        throw new Error(`smash.png not found at ${smashPath}`);
      }
      if (!existsSync(passPath)) {
        throw new Error(`pass.png not found at ${passPath}`);
      }

      const smashOverlay = await loadImage(smashPath);
      const passOverlay = await loadImage(passPath);

      // Position overlays (centered on each half: 900/2 - 540/2 = 180)
      const overlayX1 = 180;
      const overlayX2 = 1080; // 900 + 180
      const overlayY = 180;

      if (isZeroVoteTie) {
        // Both get pass
        ctx.drawImage(passOverlay, overlayX1, overlayY, this.OVERLAY_SIZE, this.OVERLAY_SIZE);
        ctx.drawImage(passOverlay, overlayX2, overlayY, this.OVERLAY_SIZE, this.OVERLAY_SIZE);
      } else {
        // Normal winner/loser or genuine tie with votes
        if (winner === 'subject1' || winner === 'tie') {
          ctx.drawImage(smashOverlay, overlayX1, overlayY, this.OVERLAY_SIZE, this.OVERLAY_SIZE);
        }
        if (winner === 'subject2' || winner === 'tie') {
          ctx.drawImage(smashOverlay, overlayX2, overlayY, this.OVERLAY_SIZE, this.OVERLAY_SIZE);
        }
        if (winner === 'subject1') {
          ctx.drawImage(passOverlay, overlayX2, overlayY, this.OVERLAY_SIZE, this.OVERLAY_SIZE);
        }
        if (winner === 'subject2') {
          ctx.drawImage(passOverlay, overlayX1, overlayY, this.OVERLAY_SIZE, this.OVERLAY_SIZE);
        }
      }
    } catch (error) {
      console.error('[SmashImageGenerator] Failed to load overlay images:', error);
      throw error;
    }

    // Draw vote counts
    this.drawVoteCount(ctx, subject1Votes, 60, 100, 'left');
    this.drawVoteCount(ctx, subject2Votes, this.IMAGE_WIDTH - 60, 100, 'right');

    // Draw names
    this.drawUsername(ctx, subject1Name, this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT - 50, this.AVATAR_WIDTH - 40);
    this.drawUsername(ctx, subject2Name, this.AVATAR_WIDTH + this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT - 50, this.AVATAR_WIDTH - 40);

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
   * Download avatar from URL to Buffer (legacy alias for compatibility)
   */
  static async downloadAvatar(url: string): Promise<Buffer> {
    return this.downloadImage(url);
  }

  /**
   * Draw image with cover cropping (object-fit: cover behavior)
   */
  private static drawCoverImage(
    ctx: any,
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
   * Draw image with cover cropping and winner/loser treatment
   */
  private static drawCoverImageWithTreatment(
    ctx: any,
    image: any,
    destX: number,
    destY: number,
    destWidth: number,
    destHeight: number,
    isWinner: boolean
  ): void {
    // Save context state
    ctx.save();

    if (isWinner) {
      // Winner: draw normally (full color, no filter)
      this.drawCoverImage(ctx, image, destX, destY, destWidth, destHeight);
    } else {
      // Loser: apply grayscale/dimmed treatment
      ctx.filter = 'grayscale(100%) brightness(60%)';
      this.drawCoverImage(ctx, image, destX, destY, destWidth, destHeight);
    }

    // Restore context state
    ctx.restore();
  }

  /**
   * Draw vote count with text shadow for readability
   */
  private static drawVoteCount(
    ctx: any,
    votes: number,
    x: number,
    y: number,
    align: 'left' | 'right'
  ): void {
    const fontSize = 140;
    const text = votes.toString();
    const voteLabel = votes === 1 ? 'vote' : 'votes';

    ctx.font = `bold ${fontSize}px Roboto`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    // Draw shadow for readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Draw vote count
    ctx.fillStyle = 'white';
    ctx.fillText(text, x, y);

    // Draw vote label (smaller)
    const labelFontSize = 40;
    ctx.font = `bold ${labelFontSize}px Roboto`;
    const labelY = y + fontSize / 2 + labelFontSize / 2 + 10;
    ctx.fillText(voteLabel, x, labelY);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  /**
   * Draw username with dynamic font sizing to fit within max width
   */
  private static drawUsername(
    ctx: any,
    name: string,
    centerX: number,
    y: number,
    maxWidth: number
  ): void {
    const maxFontSize = 50;
    const minFontSize = 20;
    let fontSize = maxFontSize;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Find appropriate font size
    while (fontSize > minFontSize) {
      ctx.font = `bold ${fontSize}px Roboto`;
      const metrics = ctx.measureText(name);
      if (metrics.width <= maxWidth) {
        break;
      }
      fontSize -= 2;
    }

    // Draw shadow for readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Draw username
    ctx.fillStyle = 'white';
    ctx.fillText(name, centerX, y);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
}
