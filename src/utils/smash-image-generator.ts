import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { cwd } from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = cwd(); // Use current working directory instead of calculated path

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
  private static readonly IMAGE_WIDTH = 1000; // Increased for 25% larger avatars
  private static readonly IMAGE_HEIGHT = 400;
  private static readonly AVATAR_WIDTH = 500; // 25% larger (400 * 1.25 = 500)
  private static readonly AVATAR_HEIGHT = 400; // Full height
  private static readonly FONT_SIZE = 24;
  private static readonly BAR_HEIGHT = 20;

  /**
   * Generate a voting state image with vote counts and progress bars
   */
  static async generateVotingImage(data: SmashImageData): Promise<Buffer> {
    const { player1Avatar, player2Avatar, player1Votes, player2Votes } = data;
    
    const totalVotes = player1Votes + player2Votes;
    const player1Percent = totalVotes > 0 ? Math.round((player1Votes / totalVotes) * 100) : 0;
    const player2Percent = totalVotes > 0 ? Math.round((player2Votes / totalVotes) * 100) : 0;

    // Resize avatars to half-width each for seamless layout
    const avatar1 = sharp(player1Avatar).resize(this.AVATAR_WIDTH, this.AVATAR_HEIGHT, {
      fit: 'cover',
      position: 'center'
    }).modulate({ saturation: 0.3 }).blur(2); // Stronger desaturation (70% less) and blur
    const avatar2 = sharp(player2Avatar).resize(this.AVATAR_WIDTH, this.AVATAR_HEIGHT, {
      fit: 'cover',
      position: 'center'
    }).modulate({ saturation: 0.3 }).blur(2); // Stronger desaturation (70% less) and blur

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
    const { player1Avatar, player2Avatar, player1Votes, player2Votes, winner } = data;
    
    console.log('[Result Image] Generating result image');
    console.log('[Result Image] No username text will be added to SVG');
    
    const totalVotes = player1Votes + player2Votes;
    const player1Percent = totalVotes > 0 ? Math.round((player1Votes / totalVotes) * 100) : 0;
    const player2Percent = totalVotes > 0 ? Math.round((player2Votes / totalVotes) * 100) : 0;

    // Resize avatars to half-width each for seamless layout
    const avatar1 = sharp(player1Avatar).resize(this.AVATAR_WIDTH, this.AVATAR_HEIGHT, {
      fit: 'cover',
      position: 'center'
    }).modulate({ saturation: 0.3 }).blur(2); // Stronger desaturation (70% less) and blur
    const avatar2 = sharp(player2Avatar).resize(this.AVATAR_WIDTH, this.AVATAR_HEIGHT, {
      fit: 'cover',
      position: 'center'
    }).modulate({ saturation: 0.3 }).blur(2); // Stronger desaturation (70% less) and blur

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
      
      console.log('[Image Generator] Project root:', PROJECT_ROOT);
      console.log('[Image Generator] Smash path:', smashPath);
      console.log('[Image Generator] Pass path:', passPath);
      console.log('[Image Generator] Smash exists:', existsSync(smashPath));
      console.log('[Image Generator] Pass exists:', existsSync(passPath));
      console.log('[Image Generator] Current working directory:', process.cwd());
      
      if (!existsSync(smashPath)) {
        console.error('[Image Generator] smash.png not found at:', smashPath);
        throw new Error(`smash.png not found at ${smashPath}`);
      }
      if (!existsSync(passPath)) {
        console.error('[Image Generator] pass.png not found at:', passPath);
        throw new Error(`pass.png not found at ${passPath}`);
      }
      
      // Load and resize overlay images (2x size as requested)
      const smashOverlay = await sharp(smashPath).resize(240, 240).png().toBuffer();
      const passOverlay = await sharp(passPath).resize(240, 240).png().toBuffer();
      
      console.log('[Image Generator] Overlay images loaded successfully');
      console.log('[Image Generator] Smash overlay size:', smashOverlay.length, 'bytes');
      console.log('[Image Generator] Pass overlay size:', passOverlay.length, 'bytes');
      
      // Position overlays on respective avatars (centered on each half, 2x size)
      if (winner === 'player1' || winner === 'tie') {
        overlays.push({ input: smashOverlay, left: 130, top: 80 }); // Center on player1 side (500/2 - 240/2 = 130)
        console.log('[Image Generator] Adding smash overlay to player1 at (130, 80)');
      }
      if (winner === 'player2' || winner === 'tie') {
        overlays.push({ input: smashOverlay, left: 630, top: 80 }); // Center on player2 side (500 + 500/2 - 240/2 = 630)
        console.log('[Image Generator] Adding smash overlay to player2 at (630, 80)');
      }
      if (winner === 'player1') {
        overlays.push({ input: passOverlay, left: 630, top: 80 }); // Pass on player2
        console.log('[Image Generator] Adding pass overlay to player2 at (630, 80)');
      }
      if (winner === 'player2') {
        overlays.push({ input: passOverlay, left: 130, top: 80 }); // Pass on player1
        console.log('[Image Generator] Adding pass overlay to player1 at (130, 80)');
      }
      
      console.log('[Image Generator] Total overlays to apply:', overlays.length);
    } catch (error) {
      console.error('[Image Generator] Failed to load overlay images:', error);
      if (error instanceof Error) {
        console.error('[Image Generator] Error details:', error.message);
      }
      throw error; // Re-throw to ensure the error is visible
    }

    // Add SVG text overlay
    const svgText = this.createResultSVG(
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
    player1Votes: number,
    player2Votes: number,
    player1Percent: number,
    player2Percent: number
  ): string {
    const player1BarWidth = (player1Percent / 100) * 450;
    const player2BarWidth = (player2Percent / 100) * 450;

    return `
      <svg width="${this.IMAGE_WIDTH}" height="${this.IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <!-- Semi-transparent overlay for text readability -->
        <rect x="0" y="320" width="${this.IMAGE_WIDTH}" height="80" fill="rgba(0,0,0,0.7)" />
        
        <!-- Player 1 Info -->
        <text x="250" y="350" font-family="Arial, Helvetica, sans-serif" font-size="${this.FONT_SIZE}" fill="white" text-anchor="middle" font-weight="bold">${player1Votes} votes (${player1Percent}%)</text>
        
        <!-- Player 1 Progress Bar Background -->
        <rect x="25" y="355" width="450" height="${this.BAR_HEIGHT}" fill="#4752C4" rx="4" opacity="0.3" />
        <!-- Player 1 Progress Bar Fill -->
        <rect x="25" y="355" width="${player1BarWidth}" height="${this.BAR_HEIGHT}" fill="#5865F2" rx="4" />

        <!-- Player 2 Info -->
        <text x="750" y="350" font-family="Arial, Helvetica, sans-serif" font-size="${this.FONT_SIZE}" fill="white" text-anchor="middle" font-weight="bold">${player2Votes} votes (${player2Percent}%)</text>
        
        <!-- Player 2 Progress Bar Background -->
        <rect x="525" y="355" width="450" height="${this.BAR_HEIGHT}" fill="#C02C2F" rx="4" opacity="0.3" />
        <!-- Player 2 Progress Bar Fill -->
        <rect x="525" y="355" width="${player2BarWidth}" height="${this.BAR_HEIGHT}" fill="#ED4245" rx="4" />
      </svg>
    `;
  }

  private static createResultSVG(
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
        <text x="250" y="350" font-family="Arial, Helvetica, sans-serif" font-size="${this.FONT_SIZE}" fill="white" text-anchor="middle" font-weight="bold">${player1Votes} votes (${player1Percent}%)</text>

        <!-- Player 2 Info -->
        <text x="750" y="350" font-family="Arial, Helvetica, sans-serif" font-size="${this.FONT_SIZE}" fill="white" text-anchor="middle" font-weight="bold">${player2Votes} votes (${player2Percent}%)</text>
      </svg>
    `;
  }
}