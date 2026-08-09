import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../..');

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
  private static readonly IMAGE_WIDTH = 800;
  private static readonly IMAGE_HEIGHT = 400;
  private static readonly AVATAR_WIDTH = 400; // Half of image width for seamless layout
  private static readonly AVATAR_HEIGHT = 400; // Full height
  private static readonly FONT_SIZE = 24;
  private static readonly BAR_HEIGHT = 20;

  /**
   * Generate a voting state image with vote counts and progress bars
   */
  static async generateVotingImage(data: SmashImageData): Promise<Buffer> {
    const { player1Avatar, player2Avatar, player1Votes, player2Votes, player1Name, player2Name } = data;
    
    const totalVotes = player1Votes + player2Votes;
    const player1Percent = totalVotes > 0 ? Math.round((player1Votes / totalVotes) * 100) : 0;
    const player2Percent = totalVotes > 0 ? Math.round((player2Votes / totalVotes) * 100) : 0;

    // Resize avatars to half-width each for seamless layout
    const avatar1 = sharp(player1Avatar).resize(this.AVATAR_WIDTH, this.AVATAR_HEIGHT, {
      fit: 'cover',
      position: 'center'
    });
    const avatar2 = sharp(player2Avatar).resize(this.AVATAR_WIDTH, this.AVATAR_HEIGHT, {
      fit: 'cover',
      position: 'center'
    });

    // Create seamless side-by-side layout
    const composite = await sharp({
      create: {
        width: this.IMAGE_WIDTH,
        height: this.IMAGE_HEIGHT,
        channels: 4,
        background: { r: 54, g: 57, b: 63, alpha: 1 }
      }
    })
    .composite([
      { input: await avatar1.png().toBuffer(), left: 0, top: 0 },
      { input: await avatar2.png().toBuffer(), left: this.AVATAR_WIDTH, top: 0 }
    ])
    .png()
    .toBuffer();

    // Add text overlays
    const finalImage = sharp(composite);
    
    // Create SVG for text overlays
    const svgText = this.createVotingSVG(
      player1Name, 
      player2Name, 
      player1Votes, 
      player2Votes, 
      player1Percent, 
      player2Percent
    );

    return await finalImage
      .composite([{ input: Buffer.from(svgText), left: 0, top: 0 }])
      .png()
      .toBuffer();
  }

  /**
   * Generate a result image with smash/pass PNG overlays
   */
  static async generateResultImage(data: SmashImageData): Promise<Buffer> {
    const { player1Avatar, player2Avatar, player1Votes, player2Votes, player1Name, player2Name, winner } = data;
    
    const totalVotes = player1Votes + player2Votes;
    const player1Percent = totalVotes > 0 ? Math.round((player1Votes / totalVotes) * 100) : 0;
    const player2Percent = totalVotes > 0 ? Math.round((player2Votes / totalVotes) * 100) : 0;

    // Resize avatars to half-width each for seamless layout
    const avatar1 = sharp(player1Avatar).resize(this.AVATAR_WIDTH, this.AVATAR_HEIGHT, {
      fit: 'cover',
      position: 'center'
    });
    const avatar2 = sharp(player2Avatar).resize(this.AVATAR_WIDTH, this.AVATAR_HEIGHT, {
      fit: 'cover',
      position: 'center'
    });

    // Create seamless side-by-side layout
    const composite = await sharp({
      create: {
        width: this.IMAGE_WIDTH,
        height: this.IMAGE_HEIGHT,
        channels: 4,
        background: { r: 54, g: 57, b: 63, alpha: 1 }
      }
    })
    .composite([
      { input: await avatar1.png().toBuffer(), left: 0, top: 0 },
      { input: await avatar2.png().toBuffer(), left: this.AVATAR_WIDTH, top: 0 }
    ])
    .png()
    .toBuffer();

    // Add PNG overlays and text
    const overlays = [];
    
    // Add smash/pass PNG overlays
    try {
      const smashPath = join(PROJECT_ROOT, 'smash.png');
      const passPath = join(PROJECT_ROOT, 'pass.png');
      
      console.log('[Image Generator] Loading overlays from:', smashPath, passPath);
      
      // Load and resize overlay images
      const smashOverlay = await sharp(smashPath).resize(120, 120).png().toBuffer();
      const passOverlay = await sharp(passPath).resize(120, 120).png().toBuffer();
      
      // Position overlays on respective avatars (centered on each half)
      if (winner === 'player1' || winner === 'tie') {
        overlays.push({ input: smashOverlay, left: 140, top: 140 }); // Center on player1 side (400/2 - 120/2 = 140)
      }
      if (winner === 'player2' || winner === 'tie') {
        overlays.push({ input: smashOverlay, left: 540, top: 140 }); // Center on player2 side (400 + 400/2 - 120/2 = 540)
      }
      if (winner === 'player1') {
        overlays.push({ input: passOverlay, left: 540, top: 140 }); // Pass on player2
      }
      if (winner === 'player2') {
        overlays.push({ input: passOverlay, left: 140, top: 140 }); // Pass on player1
      }
    } catch (error) {
      console.error('[Image Generator] Failed to load overlay images:', error);
    }

    // Add SVG text overlay
    const svgText = this.createResultSVG(
      player1Name, 
      player2Name, 
      player1Votes, 
      player2Votes, 
      player1Percent, 
      player2Percent
    );
    overlays.push({ input: Buffer.from(svgText), left: 0, top: 0 });

    return await sharp(composite)
      .composite(overlays)
      .png()
      .toBuffer();
  }

  /**
   * Download avatar from URL to Buffer
   */
  static async downloadAvatar(url: string): Promise<Buffer> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private static createVotingSVG(
    player1Name: string,
    player2Name: string,
    player1Votes: number,
    player2Votes: number,
    player1Percent: number,
    player2Percent: number
  ): string {
    const player1BarWidth = (player1Percent / 100) * 350;
    const player2BarWidth = (player2Percent / 100) * 350;

    return `
      <svg width="${this.IMAGE_WIDTH}" height="${this.IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <!-- Semi-transparent overlay for text readability -->
        <rect x="0" y="320" width="${this.IMAGE_WIDTH}" height="80" fill="rgba(0,0,0,0.7)" />
        
        <!-- Player 1 Info -->
        <text x="200" y="350" font-family="system-ui, -apple-system, sans-serif" font-size="${this.FONT_SIZE}" fill="white" text-anchor="middle" font-weight="bold">${player1Name}</text>
        <text x="200" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#AAAAAA" text-anchor="middle">${player1Votes} votes (${player1Percent}%)</text>
        
        <!-- Player 1 Progress Bar Background -->
        <rect x="25" y="355" width="350" height="${this.BAR_HEIGHT}" fill="#4752C4" rx="4" opacity="0.3" />
        <!-- Player 1 Progress Bar Fill -->
        <rect x="25" y="355" width="${player1BarWidth}" height="${this.BAR_HEIGHT}" fill="#5865F2" rx="4" />

        <!-- Player 2 Info -->
        <text x="600" y="350" font-family="system-ui, -apple-system, sans-serif" font-size="${this.FONT_SIZE}" fill="white" text-anchor="middle" font-weight="bold">${player2Name}</text>
        <text x="600" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#AAAAAA" text-anchor="middle">${player2Votes} votes (${player2Percent}%)</text>
        
        <!-- Player 2 Progress Bar Background -->
        <rect x="425" y="355" width="350" height="${this.BAR_HEIGHT}" fill="#C02C2F" rx="4" opacity="0.3" />
        <!-- Player 2 Progress Bar Fill -->
        <rect x="425" y="355" width="${player2BarWidth}" height="${this.BAR_HEIGHT}" fill="#ED4245" rx="4" />
      </svg>
    `;
  }

  private static createResultSVG(
    player1Name: string,
    player2Name: string,
    player1Votes: number,
    player2Votes: number,
    player1Percent: number,
    player2Percent: number
  ): string {
    return `
      <svg width="${this.IMAGE_WIDTH}" height="${this.IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <!-- Semi-transparent overlay for text readability -->
        <rect x="0" y="320" width="${this.IMAGE_WIDTH}" height="80" fill="rgba(0,0,0,0.7)" />
        
        <!-- Player 1 Info -->
        <text x="200" y="350" font-family="system-ui, -apple-system, sans-serif" font-size="${this.FONT_SIZE}" fill="white" text-anchor="middle" font-weight="bold">${player1Name}</text>
        <text x="200" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#AAAAAA" text-anchor="middle">${player1Votes} votes (${player1Percent}%)</text>

        <!-- Player 2 Info -->
        <text x="600" y="350" font-family="system-ui, -apple-system, sans-serif" font-size="${this.FONT_SIZE}" fill="white" text-anchor="middle" font-weight="bold">${player2Name}</text>
        <text x="600" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#AAAAAA" text-anchor="middle">${player2Votes} votes (${player2Percent}%)</text>
      </svg>
    `;
  }
}