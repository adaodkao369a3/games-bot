import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { CachedCharacter } from '../services/anilist-character-service.js';
import { SmashImageGenerator, SmashImageData } from '../utils/smash-image-generator.js';
import { SmashMaxCharacterTracker } from '../services/smashmax-character-tracker.js';

export interface SmashMaxState {
  channelId: string;
  guildId?: string;
  character1: CachedCharacter;
  character2: CachedCharacter;
  isGameOver: boolean;
  messageId?: string;
  player1Votes: number;
  player2Votes: number;
  voters: Set<string>;
  votingStartTime?: number;
  currentPhase: SmashMaxPhase;
}

export enum SmashMaxPhase {
  LOADING = 'LOADING',
  VOTING = 'VOTING',
  RESULT = 'RESULT',
  FINISHED = 'FINISHED',
}

export interface SmashMaxResult {
  winner: 'subject1' | 'subject2' | 'tie';
  character1Votes: number;
  character2Votes: number;
}

/**
 * Manages SmashMax game state and logic
 */
export class SmashMaxGame {
  private state: SmashMaxState;
  private currentMessage?: Message;
  private timers: NodeJS.Timeout[] = [];
  private onGameEnd?: () => void;
  private readonly VOTING_DURATION = 15 * 1000; // 15 seconds
  private character1ImageBuffer?: Buffer;
  private character2ImageBuffer?: Buffer;
  private characterTracker = SmashMaxCharacterTracker.getInstance();

  constructor(
    channelId: string,
    guildId: string | undefined,
    character1: CachedCharacter,
    character2: CachedCharacter,
    onGameEnd?: () => void
  ) {
    this.state = {
      channelId,
      guildId,
      character1,
      character2,
      isGameOver: false,
      player1Votes: 0,
      player2Votes: 0,
      voters: new Set(),
      currentPhase: SmashMaxPhase.LOADING,
    };
    this.onGameEnd = onGameEnd;
  }

  /**
   * Start the game
   */
  async start(message: Message): Promise<void> {
    this.currentMessage = message;
    
    // Show loading state
    await this.showLoading();
  }

  /**
   * Show loading state while downloading character images
   */
  private async showLoading(): Promise<void> {
    this.state.currentPhase = SmashMaxPhase.LOADING;

    const embed = new EmbedBuilder()
      .setTitle('🔥 SMASHMAX')
      .setDescription('<a:dice:1545149015652307104> Loading anime character images...\n\nPlease wait.')
      .setColor(0xFFD700);

    await this.currentMessage?.edit({
      content: null,
      embeds: [embed],
      components: [],
    });

    // Download character images
    try {
      if (this.state.character1.imageUrl) {
        this.character1ImageBuffer = await SmashImageGenerator.downloadImage(this.state.character1.imageUrl);
      }
      if (this.state.character2.imageUrl) {
        this.character2ImageBuffer = await SmashImageGenerator.downloadImage(this.state.character2.imageUrl);
      }
    } catch (error) {
      console.error('[SmashMaxGame] Failed to download character images:', error);
      await this.currentMessage?.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('Failed to load character images. Please try again later.')
            .setColor(0xFF0000)
        ],
      });
      this.state.isGameOver = true;
      if (this.onGameEnd) this.onGameEnd();
      return;
    }

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Start voting phase
    await this.startVoting();
  }

  /**
   * Start voting phase
   */
  private async startVoting(): Promise<void> {
    this.state.currentPhase = SmashMaxPhase.VOTING;
    this.state.votingStartTime = Date.now();

    const { embed, attachment } = await this.createVotingEmbed();

    await this.currentMessage?.edit({
      files: [attachment],
      embeds: [embed],
      components: [this.createVotingButtons()],
    });

    // Start voting timer
    const timeout = setTimeout(() => {
      if (!this.state.isGameOver) {
        this.endVoting();
      }
    }, this.VOTING_DURATION);

    this.timers.push(timeout);
  }

  /**
   * Create voting embed with generated collage
   */
  private async createVotingEmbed(): Promise<{ embed: EmbedBuilder; attachment: AttachmentBuilder }> {
    if (!this.character1ImageBuffer || !this.character2ImageBuffer) {
      throw new Error('Character images not loaded');
    }

    const char1 = this.state.character1;
    const char2 = this.state.character2;

    // Generate collage using SmashImageGenerator
    const imageData: SmashImageData = {
      subject1Name: char1.name,
      subject1Image: this.character1ImageBuffer,
      subject2Name: char2.name,
      subject2Image: this.character2ImageBuffer,
      subject1Votes: this.state.player1Votes,
      subject2Votes: this.state.player2Votes,
    };

    const votingImage = await SmashImageGenerator.generateVotingImage(imageData);
    const attachment = new AttachmentBuilder(votingImage, { name: 'smashmax-voting.png' });

    const embed = new EmbedBuilder()
      .setTitle('🔥 SMASHMAX')
      .setColor(0xFFD700)
      .setImage('attachment://smashmax-voting.png')
      .setTimestamp()
      .setFooter({ text: '15 seconds to vote' });

    return { embed, attachment };
  }

  /**
   * Create voting buttons
   */
  private createVotingButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('smashmax_vote_char1')
        .setLabel(`🔥 ${this.state.character1.name}`)
        .setStyle(ButtonStyle.Primary),
      
      new ButtonBuilder()
        .setCustomId('smashmax_vote_char2')
        .setLabel(`🔥 ${this.state.character2.name}`)
        .setStyle(ButtonStyle.Danger)
    );

    return row;
  }

  /**
   * Handle button interaction
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state.isGameOver) return;

    const userId = interaction.user.id;
    const customId = interaction.customId;

    // Handle vote buttons
    if (customId === 'smashmax_vote_char1' || customId === 'smashmax_vote_char2') {
      // Check if user already voted
      if (this.state.voters.has(userId)) {
        await interaction.reply({
          content: 'You already voted!',
          ephemeral: true,
        });
        return;
      }

      // Record the vote
      this.state.voters.add(userId);
      if (customId === 'smashmax_vote_char1') {
        this.state.player1Votes++;
      } else {
        this.state.player2Votes++;
      }

      await interaction.reply({
        content: 'Vote recorded!',
        ephemeral: true,
      });

      // Update the embed with new vote counts
      await this.updateVotingEmbed();
    }
  }

  /**
   * Update voting embed with current vote counts
   */
  private async updateVotingEmbed(): Promise<void> {
    const { embed, attachment } = await this.createVotingEmbed();

    await this.currentMessage?.edit({
      files: [attachment],
      embeds: [embed],
    });
  }

  /**
   * End voting period and show results
   */
  private async endVoting(): Promise<void> {
    if (this.state.isGameOver) return;

    this.state.currentPhase = SmashMaxPhase.RESULT;
    this.clearTimers();

    // Determine winner
    let winner: 'subject1' | 'subject2' | 'tie' = 'tie';
    if (this.state.player1Votes > this.state.player2Votes) {
      winner = 'subject1';
    } else if (this.state.player2Votes > this.state.player1Votes) {
      winner = 'subject2';
    }

    // Show result
    await this.showResult(winner);
  }

  /**
   * Show result embed with generated collage
   */
  private async showResult(winner: 'subject1' | 'subject2' | 'tie'): Promise<void> {
    if (!this.character1ImageBuffer || !this.character2ImageBuffer) {
      throw new Error('Character images not loaded');
    }

    const char1 = this.state.character1;
    const char2 = this.state.character2;

    // Generate result collage using SmashImageGenerator
    const imageData: SmashImageData = {
      subject1Name: char1.name,
      subject1Image: this.character1ImageBuffer,
      subject2Name: char2.name,
      subject2Image: this.character2ImageBuffer,
      subject1Votes: this.state.player1Votes,
      subject2Votes: this.state.player2Votes,
      isResult: true,
      winner,
    };

    const resultImage = await SmashImageGenerator.generateResultImage(imageData);
    const attachment = new AttachmentBuilder(resultImage, { name: 'smashmax-result.png' });

    let resultDescription: string;
    let resultColor: number;

    if (winner === 'tie') {
      resultDescription = `🤝 **It's a tie!**\n\nBoth characters are equally smashable!\n\n**Final Score:**\n${char1.name}: ${this.state.player1Votes} votes\n${char2.name}: ${this.state.player2Votes} votes`;
      resultColor = 0xFFA500;
    } else {
      const winnerChar = winner === 'subject1' ? char1 : char2;
      const loserChar = winner === 'subject1' ? char2 : char1;
      resultDescription = `<:15394trophy:1545135066148118628>**${winnerChar.name} WINS!**\n\n${winnerChar.anime ? `*${winnerChar.anime}*\n` : ''}The people have spoken!\n\n**Final Score:**\n${char1.name}: ${this.state.player1Votes} votes\n${char2.name}: ${this.state.player2Votes} votes`;
      resultColor = 0xFFD700;
    }

    const embed = new EmbedBuilder()
      .setTitle('🔥 SMASHMAX — RESULTS')
      .setDescription(resultDescription)
      .setColor(resultColor)
      .setImage('attachment://smashmax-result.png')
      .setTimestamp()
      .setFooter({ text: 'Bob Kun <:bob:1545141387656302663>' });

    await this.currentMessage?.edit({
      files: [attachment],
      embeds: [embed],
      components: [this.createDisabledButtons()],
    });

    // Wait a moment before finishing
    await this.delay(2000);

    // Mark characters as used only after successful game completion
    this.characterTracker.markCharactersAsUsed([
      this.state.character1.characterId,
      this.state.character2.characterId
    ]);

    // Mark game as finished
    this.state.currentPhase = SmashMaxPhase.FINISHED;
    this.state.isGameOver = true;

    // Call cleanup callback
    if (this.onGameEnd) {
      this.onGameEnd();
    }
  }

  /**
   * Create disabled buttons
   */
  private createDisabledButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('smashmax_disabled_char1')
        .setLabel('Voting Ended')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      
      new ButtonBuilder()
        .setCustomId('smashmax_disabled_char2')
        .setLabel('Voting Ended')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    return row;
  }

  /**
   * Clean up all timers
   */
  private clearTimers(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers = [];
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      const timeout = setTimeout(resolve, ms);
      this.timers.push(timeout);
    });
  }

  /**
   * Get game state
   */
  getState(): SmashMaxState {
    return { ...this.state };
  }

  /**
   * Check if game is over
   */
  isFinished(): boolean {
    return this.state.isGameOver;
  }
}
