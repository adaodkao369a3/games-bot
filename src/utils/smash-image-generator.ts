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
  player1Name: string;
  player1Avatar: Buffer;
  player2Name: string;
  player2Avatar: Buffer;
  player1Votes: number;
  player2Votes: number;
  isResult?: boolean;
  winner?: 'player1' | 'player2' | 'tie';
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
    const { player1Avatar, player2Avatar, player1Votes, player2Votes, player1Name, player2Name } = data;

    if (!fontLoaded) {
      throw new Error('[SmashImageGenerator] Font not loaded - cannot render image');
    }

    // Create canvas
    const canvas = createCanvas(this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Load avatars
    const avatar1 = await loadImage(player1Avatar);
    const avatar2 = await loadImage(player2Avatar);

    // Draw avatars with cover cropping
    this.drawCoverImage(ctx, avatar1, 0, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT);
    this.drawCoverImage(ctx, avatar2, this.AVATAR_WIDTH, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT);

    // Draw vote counts
    this.drawVoteCount(ctx, player1Votes, 60, 100, 'left');
    this.drawVoteCount(ctx, player2Votes, this.IMAGE_WIDTH - 60, 100, 'right');

    // Draw usernames
    this.drawUsername(ctx, player1Name, this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT - 50, this.AVATAR_WIDTH - 40);
    this.drawUsername(ctx, player2Name, this.AVATAR_WIDTH + this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT - 50, this.AVATAR_WIDTH - 40);

    return canvas.toBuffer('image/png');
  }

  /**
   * Generate a result image with smash/pass PNG overlays
   */
  static async generateResultImage(data: SmashImageData): Promise<Buffer> {
    if (!fontLoaded) {
      throw new Error('[SmashImageGenerator] Font not loaded - cannot render image');
    }

    const { player1Avatar, player2Avatar, player1Votes, player2Votes, winner, player1Name, player2Name } = data;

    console.log('[SmashImageGenerator] Generating result image');

    const totalVotes = player1Votes + player2Votes;
    const isZeroVoteTie = totalVotes === 0;

    // Create canvas
    const canvas = createCanvas(this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Load avatars
    const avatar1 = await loadImage(player1Avatar);
    const avatar2 = await loadImage(player2Avatar);

    // Apply treatments based on winner
    const avatar1IsWinner = winner === 'player1' || (winner === 'tie' && !isZeroVoteTie);
    const avatar2IsWinner = winner === 'player2' || (winner === 'tie' && !isZeroVoteTie);

    // Draw avatars with cover cropping and treatments
    this.drawCoverImageWithTreatment(ctx, avatar1, 0, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT, avatar1IsWinner);
    this.drawCoverImageWithTreatment(ctx, avatar2, this.AVATAR_WIDTH, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT, avatar2IsWinner);

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
        if (winner === 'player1' || winner === 'tie') {
          ctx.drawImage(smashOverlay, overlayX1, overlayY, this.OVERLAY_SIZE, this.OVERLAY_SIZE);
        }
        if (winner === 'player2' || winner === 'tie') {
          ctx.drawImage(smashOverlay, overlayX2, overlayY, this.OVERLAY_SIZE, this.OVERLAY_SIZE);
        }
        if (winner === 'player1') {
          ctx.drawImage(passOverlay, overlayX2, overlayY, this.OVERLAY_SIZE, this.OVERLAY_SIZE);
        }
        if (winner === 'player2') {
          ctx.drawImage(passOverlay, overlayX1, overlayY, this.OVERLAY_SIZE, this.OVERLAY_SIZE);
        }
      }
    } catch (error) {
      console.error('[SmashImageGenerator] Failed to load overlay images:', error);
      throw error;
    }

    // Draw vote counts
    this.drawVoteCount(ctx, player1Votes, 60, 100, 'left');
    this.drawVoteCount(ctx, player2Votes, this.IMAGE_WIDTH - 60, 100, 'right');

    // Draw usernames
    this.drawUsername(ctx, player1Name, this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT - 50, this.AVATAR_WIDTH - 40);
    this.drawUsername(ctx, player2Name, this.AVATAR_WIDTH + this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT - 50, this.AVATAR_WIDTH - 40);

    return canvas.toBuffer('image/png');
  }

  /**
   * Download avatar from URL to Buffer
   */
  static async downloadAvatar(url: string): Promise<Buffer> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
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

    // Draw the image with cover cropping
    this.drawCoverImage(ctx, image, destX, destY, destWidth, destHeight);

    // Apply treatment using Canvas filters
    if (isWinner) {
      // Winner: lighter treatment (similar to saturation: 0.3)
      ctx.filter = 'saturate(30%) brightness(110%)';
    } else {
      // Loser: darker treatment (similar to saturation: 0.1, brightness: 0.7)
      ctx.filter = 'saturate(10%) brightness(70%)';
    }

    // Re-draw the image with filter applied
    this.drawCoverImage(ctx, image, destX, destY, destWidth, destHeight);

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
