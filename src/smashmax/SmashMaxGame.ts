import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction, EmbedBuilder } from 'discord.js';
import { CachedCharacter } from '../services/anilist-character-service.js';

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
  winner: 'character1' | 'character2' | 'tie';
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
   * Show loading state while fetching characters
   */
  private async showLoading(): Promise<void> {
    this.state.currentPhase = SmashMaxPhase.LOADING;

    const embed = new EmbedBuilder()
      .setTitle('🔥 SMASHMAX')
      .setDescription('🎲 Fetching anime characters...\n\nPlease wait.')
      .setColor(0xFFD700);

    await this.currentMessage?.edit({
      content: null,
      embeds: [embed],
      components: [],
    });

    // Small delay to show loading state
    await this.delay(1000);

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

    const embed = this.createVotingEmbed();

    await this.currentMessage?.edit({
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
   * Create voting embed
   */
  private createVotingEmbed(): EmbedBuilder {
    const char1 = this.state.character1;
    const char2 = this.state.character2;

    const embed = new EmbedBuilder()
      .setTitle('🔥 SMASHMAX')
      .setColor(0xFFD700)
      .setTimestamp()
      .setFooter({ text: '15 seconds to vote' });

    // Build description with character info
    let description = `**${char1.name}**\n`;
    if (char1.anime) {
      description += `*${char1.anime}*\n`;
    }
    description += `\n**VS**\n\n`;
    description += `**${char2.name}**\n`;
    if (char2.anime) {
      description += `*${char2.anime}*\n`;
    }

    embed.setDescription(description);

    // Add images if available
    if (char1.imageUrl) {
      embed.setThumbnail(char1.imageUrl);
    }
    if (char2.imageUrl) {
      embed.setImage(char2.imageUrl);
    }

    return embed;
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
    const embed = this.createVotingEmbed();
    
    // Add vote counts to description
    const currentDescription = embed.data.description || '';
    const voteInfo = `\n\n📊 **Votes:**\n${this.state.character1.name}: ${this.state.player1Votes}\n${this.state.character2.name}: ${this.state.player2Votes}`;
    
    embed.setDescription(currentDescription + voteInfo);

    await this.currentMessage?.edit({
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
    let winner: 'character1' | 'character2' | 'tie' = 'tie';
    if (this.state.player1Votes > this.state.player2Votes) {
      winner = 'character1';
    } else if (this.state.player2Votes > this.state.player1Votes) {
      winner = 'character2';
    }

    // Show result
    await this.showResult(winner);
  }

  /**
   * Show result embed
   */
  private async showResult(winner: 'character1' | 'character2' | 'tie'): Promise<void> {
    const char1 = this.state.character1;
    const char2 = this.state.character2;

    let resultDescription: string;
    let resultColor: number;

    if (winner === 'tie') {
      resultDescription = `🤝 **It's a tie!**\n\nBoth characters are equally smashable!\n\n**Final Score:**\n${char1.name}: ${this.state.player1Votes} votes\n${char2.name}: ${this.state.player2Votes} votes`;
      resultColor = 0xFFA500;
    } else {
      const winnerChar = winner === 'character1' ? char1 : char2;
      const loserChar = winner === 'character1' ? char2 : char1;
      resultDescription = `🏆 **${winnerChar.name} WINS!**\n\n${winnerChar.anime ? `*${winnerChar.anime}*\n` : ''}The people have spoken!\n\n**Final Score:**\n${char1.name}: ${this.state.player1Votes} votes\n${char2.name}: ${this.state.player2Votes} votes`;
      resultColor = 0xFFD700;
    }

    const embed = new EmbedBuilder()
      .setTitle('🔥 SMASHMAX — RESULTS')
      .setDescription(resultDescription)
      .setColor(resultColor)
      .setTimestamp()
      .setFooter({ text: 'Bob Kun 🍌' });

    // Keep the images
    if (char1.imageUrl) {
      embed.setThumbnail(char1.imageUrl);
    }
    if (char2.imageUrl) {
      embed.setImage(char2.imageUrl);
    }

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [this.createDisabledButtons()],
    });

    // Wait a moment before finishing
    await this.delay(2000);

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
