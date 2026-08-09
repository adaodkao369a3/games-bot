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
  private static readonly IMAGE_WIDTH = 1800; // Two 900x900 avatars side by side (increased for larger display)
  private static readonly IMAGE_HEIGHT = 900; // Height matches avatar height
  private static readonly AVATAR_WIDTH = 900; // Square avatar width
  private static readonly AVATAR_HEIGHT = 900; // Square avatar height

  /**
   * Generate a voting state image with vote counts
   */
  static async generateVotingImage(data: SmashImageData): Promise<Buffer> {
    const { player1Avatar, player2Avatar, player1Votes, player2Votes } = data;

    // Resize avatars to half-width each for seamless layout (no effects for voting stage)
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

    // Add text overlays using sharp's text rendering
    const finalImage = sharp(composite);
    
    // Add text overlays using sharp's composite with SVG
    const svgText = this.createVotingSVG(
      player1Votes, 
      player2Votes
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
    
    const totalVotes = player1Votes + player2Votes;

    // Determine if this is a 0-0 tie (no votes cast) vs a genuine tie with votes
    const isZeroVoteTie = totalVotes === 0;

    // Apply different avatar treatments based on winner
    // Winner: lighter treatment (saturation: 0.3, blur: 2)
    // Loser: darker treatment (saturation: 0.1, brightness: 0.7, blur: 2)
    // Tie with votes: both get winner treatment
    const avatar1Treatment = winner === 'player1' || (winner === 'tie' && !isZeroVoteTie) 
      ? { saturation: 0.3, blur: 2 } // Winner or tie with votes - lighter
      : { saturation: 0.1, brightness: 0.7, blur: 2 }; // Loser - darker
    
    const avatar2Treatment = winner === 'player2' || (winner === 'tie' && !isZeroVoteTie)
      ? { saturation: 0.3, blur: 2 } // Winner or tie with votes - lighter
      : { saturation: 0.1, brightness: 0.7, blur: 2 }; // Loser - darker

    // Resize avatars to half-width each for seamless layout
    const avatar1 = sharp(player1Avatar).resize(this.AVATAR_WIDTH, this.AVATAR_HEIGHT, {
      fit: 'cover',
      position: 'center'
    }).modulate(avatar1Treatment);
    const avatar2 = sharp(player2Avatar).resize(this.AVATAR_WIDTH, this.AVATAR_HEIGHT, {
      fit: 'cover',
      position: 'center'
    }).modulate(avatar2Treatment);

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
      
      // Load and resize overlay images (scaled up 1.8x for larger canvas)
      const smashOverlay = await sharp(smashPath).resize(540, 540).png().toBuffer();
      const passOverlay = await sharp(passPath).resize(540, 540).png().toBuffer();
      
      console.log('[Image Generator] Overlay images loaded successfully');
      console.log('[Image Generator] Smash overlay size:', smashOverlay.length, 'bytes');
      console.log('[Image Generator] Pass overlay size:', passOverlay.length, 'bytes');
      
      // Position overlays on respective avatars (centered on each half)
      // Special case: 0-0 tie means both get "pass" instead of "smash"
      if (isZeroVoteTie) {
        overlays.push({ input: passOverlay, left: 180, top: 180 }); // Pass on player1 (900/2 - 540/2 = 180)
        overlays.push({ input: passOverlay, left: 1080, top: 180 }); // Pass on player2 (900 + 900/2 - 540/2 = 1080)
        console.log('[Image Generator] 0-0 tie: adding pass overlay to both players');
      } else {
        // Normal winner/loser or genuine tie with votes
        if (winner === 'player1' || winner === 'tie') {
          overlays.push({ input: smashOverlay, left: 180, top: 180 }); // Center on player1 side (900/2 - 540/2 = 180)
          console.log('[Image Generator] Adding smash overlay to player1 at (180, 180)');
        }
        if (winner === 'player2' || winner === 'tie') {
          overlays.push({ input: smashOverlay, left: 1080, top: 180 }); // Center on player2 side (900 + 900/2 - 540/2 = 1080)
          console.log('[Image Generator] Adding smash overlay to player2 at (1080, 180)');
        }
        if (winner === 'player1') {
          overlays.push({ input: passOverlay, left: 1080, top: 180 }); // Pass on player2
          console.log('[Image Generator] Adding pass overlay to player2 at (1080, 180)');
        }
        if (winner === 'player2') {
          overlays.push({ input: passOverlay, left: 180, top: 180 }); // Pass on player1
          console.log('[Image Generator] Adding pass overlay to player1 at (180, 180)');
        }
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
      player2Votes
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
    player2Votes: number
  ): string {
    const voteCountFontSize = 96; // Large heading size for vote counts

    return `
      <svg width="${this.IMAGE_WIDTH}" height="${this.IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <!-- Player 1 Vote Count - Top Left Corner -->
        <text x="60" y="100" font-family="Ubuntu, Cantarell, DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif" font-size="${voteCountFontSize}" fill="white" text-anchor="start" font-weight="bold">${player1Votes}</text>
        
        <!-- Player 2 Vote Count - Top Right Corner -->
        <text x="${this.IMAGE_WIDTH - 60}" y="100" font-family="Ubuntu, Cantarell, DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif" font-size="${voteCountFontSize}" fill="white" text-anchor="end" font-weight="bold">${player2Votes}</text>
      </svg>
    `;
  }

  private static createResultSVG(
    player1Votes: number,
    player2Votes: number
  ): string {
    const voteCountFontSize = 96; // Large heading size for vote counts

    return `
      <svg width="${this.IMAGE_WIDTH}" height="${this.IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <!-- Player 1 Vote Count - Top Left Corner -->
        <text x="60" y="100" font-family="Ubuntu, Cantarell, DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif" font-size="${voteCountFontSize}" fill="white" text-anchor="start" font-weight="bold">${player1Votes}</text>
        
        <!-- Player 2 Vote Count - Top Right Corner -->
        <text x="${this.IMAGE_WIDTH - 60}" y="100" font-family="Ubuntu, Cantarell, DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif" font-size="${voteCountFontSize}" fill="white" text-anchor="end" font-weight="bold">${player2Votes}</text>
      </svg>
    `;
  }
}
