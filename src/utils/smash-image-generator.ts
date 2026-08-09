import sharp from 'sharp';

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
  private static readonly AVATAR_SIZE = 300;
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

    // Create base canvas
    const canvas = sharp({
      create: {
        width: this.IMAGE_WIDTH,
        height: this.IMAGE_HEIGHT,
        channels: 4,
        background: { r: 54, g: 57, b: 63, alpha: 1 } // Discord dark theme color
      }
    });

    // Resize avatars to square
    const avatar1 = sharp(player1Avatar).resize(this.AVATAR_SIZE, this.AVATAR_SIZE);
    const avatar2 = sharp(player2Avatar).resize(this.AVATAR_SIZE, this.AVATAR_SIZE);

    // Create composited image
    const composite = await canvas
      .composite([
        { input: await avatar1.png().toBuffer(), left: 50, top: 50 },
        { input: await avatar2.png().toBuffer(), left: 450, top: 50 }
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
   * Generate a result image with smash/pass overlays
   */
  static async generateResultImage(data: SmashImageData): Promise<Buffer> {
    const { player1Avatar, player2Avatar, player1Votes, player2Votes, player1Name, player2Name, winner } = data;
    
    const totalVotes = player1Votes + player2Votes;
    const player1Percent = totalVotes > 0 ? Math.round((player1Votes / totalVotes) * 100) : 0;
    const player2Percent = totalVotes > 0 ? Math.round((player2Votes / totalVotes) * 100) : 0;

    // Create base canvas
    const canvas = sharp({
      create: {
        width: this.IMAGE_WIDTH,
        height: this.IMAGE_HEIGHT,
        channels: 4,
        background: { r: 54, g: 57, b: 63, alpha: 1 }
      }
    });

    // Resize avatars to square
    const avatar1 = sharp(player1Avatar).resize(this.AVATAR_SIZE, this.AVATAR_SIZE);
    const avatar2 = sharp(player2Avatar).resize(this.AVATAR_SIZE, this.AVATAR_SIZE);

    // Create composited image
    const composite = await canvas
      .composite([
        { input: await avatar1.png().toBuffer(), left: 50, top: 50 },
        { input: await avatar2.png().toBuffer(), left: 450, top: 50 }
      ])
      .png()
      .toBuffer();

    // Add result overlays
    const finalImage = sharp(composite);
    
    // Create SVG for result overlays
    const svgText = this.createResultSVG(
      player1Name, 
      player2Name, 
      player1Votes, 
      player2Votes, 
      player1Percent, 
      player2Percent,
      winner
    );

    return await finalImage
      .composite([{ input: Buffer.from(svgText), left: 0, top: 0 }])
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
    const player1BarWidth = (player1Percent / 100) * 300;
    const player2BarWidth = (player2Percent / 100) * 300;

    return `
      <svg width="${this.IMAGE_WIDTH}" height="${this.IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <!-- Player 1 Info -->
        <text x="200" y="370" font-family="Arial, sans-serif" font-size="${this.FONT_SIZE}" fill="white" text-anchor="middle" font-weight="bold">${player1Name}</text>
        <text x="200" y="395" font-family="Arial, sans-serif" font-size="18" fill="#AAAAAA" text-anchor="middle">${player1Votes} votes (${player1Percent}%)</text>
        
        <!-- Player 1 Progress Bar Background -->
        <rect x="50" y="345" width="300" height="${this.BAR_HEIGHT}" fill="#4752C4" rx="4" opacity="0.3" />
        <!-- Player 1 Progress Bar Fill -->
        <rect x="50" y="345" width="${player1BarWidth}" height="${this.BAR_HEIGHT}" fill="#5865F2" rx="4" />

        <!-- Player 2 Info -->
        <text x="600" y="370" font-family="Arial, sans-serif" font-size="${this.FONT_SIZE}" fill="white" text-anchor="middle" font-weight="bold">${player2Name}</text>
        <text x="600" y="395" font-family="Arial, sans-serif" font-size="18" fill="#AAAAAA" text-anchor="middle">${player2Votes} votes (${player2Percent}%)</text>
        
        <!-- Player 2 Progress Bar Background -->
        <rect x="450" y="345" width="300" height="${this.BAR_HEIGHT}" fill="#C02C2F" rx="4" opacity="0.3" />
        <!-- Player 2 Progress Bar Fill -->
        <rect x="450" y="345" width="${player2BarWidth}" height="${this.BAR_HEIGHT}" fill="#ED4245" rx="4" />
      </svg>
    `;
  }

  private static createResultSVG(
    player1Name: string,
    player2Name: string,
    player1Votes: number,
    player2Votes: number,
    player1Percent: number,
    player2Percent: number,
    winner: 'player1' | 'player2' | 'tie' | undefined
  ): string {
    let player1Label = 'PASS';
    let player2Label = 'PASS';
    let player1Color = '#ED4245'; // Red for pass
    let player2Color = '#ED4245'; // Red for pass

    if (winner === 'player1') {
      player1Label = 'SMASH';
      player1Color = '#57F287'; // Green for smash
    } else if (winner === 'player2') {
      player2Label = 'SMASH';
      player2Color = '#57F287'; // Green for smash
    } else if (winner === 'tie') {
      player1Label = 'SMASH';
      player2Label = 'SMASH';
      player1Color = '#57F287';
      player2Color = '#57F287';
    }

    return `
      <svg width="${this.IMAGE_WIDTH}" height="${this.IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <!-- Player 1 Result Label -->
        <rect x="50" y="250" width="300" height="60" fill="${player1Color}" rx="8" opacity="0.9" />
        <text x="200" y="290" font-family="Arial, sans-serif" font-size="32" fill="white" text-anchor="middle" font-weight="bold">${player1Label}</text>
        
        <!-- Player 1 Info -->
        <text x="200" y="330" font-family="Arial, sans-serif" font-size="${this.FONT_SIZE}" fill="white" text-anchor="middle" font-weight="bold">${player1Name}</text>
        <text x="200" y="355" font-family="Arial, sans-serif" font-size="18" fill="#AAAAAA" text-anchor="middle">${player1Votes} votes (${player1Percent}%)</text>

        <!-- Player 2 Result Label -->
        <rect x="450" y="250" width="300" height="60" fill="${player2Color}" rx="8" opacity="0.9" />
        <text x="600" y="290" font-family="Arial, sans-serif" font-size="32" fill="white" text-anchor="middle" font-weight="bold">${player2Label}</text>
        
        <!-- Player 2 Info -->
        <text x="600" y="330" font-family="Arial, sans-serif" font-size="${this.FONT_SIZE}" fill="white" text-anchor="middle" font-weight="bold">${player2Name}</text>
        <text x="600" y="355" font-family="Arial, sans-serif" font-size="18" fill="#AAAAAA" text-anchor="middle">${player2Votes} votes (${player2Percent}%)</text>
      </svg>
    `;
  }
}