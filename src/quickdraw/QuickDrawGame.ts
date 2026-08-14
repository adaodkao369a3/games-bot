import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction } from 'discord.js';

export interface QuickDrawState {
  channelId: string;
  guildId?: string;
  player1Id: string;
  player2Id: string;
  player1Name: string;
  player2Name: string;
  player1Avatar: string;
  player2Avatar: string;
  isGameOver: boolean;
  winner?: string;
  loser?: string;
  reactionTime?: number;
  messageId?: string;
  drawStartTime?: number;
  setupStartTime: number;
}

export interface QuickDrawResult {
  winner: string;
  loser: string;
  reactionTime: number;
}

/**
 * Manages Quick Draw duel state and logic
 */
export class QuickDrawGame {
  private state: QuickDrawState;
  private currentMessage?: Message;
  private timers: NodeJS.Timeout[] = [];
  
  // GIF URLs
  private static readonly PLAYER1_WIN_GIF = 'https://c.tenor.com/oNRn8VZn9bQAAAAC/tenor.gif';
  private static readonly PLAYER2_WIN_GIF = 'https://c.tenor.com/Jwx-E4jVRVwAAAAC/tenor.gif';

  constructor(
    channelId: string,
    guildId: string | undefined,
    player1Id: string,
    player1Name: string,
    player2Id: string,
    player2Name: string,
    player1Avatar: string,
    player2Avatar: string
  ) {
    this.state = {
      channelId,
      guildId,
      player1Id,
      player2Id,
      player1Name,
      player2Name,
      player1Avatar,
      player2Avatar,
      isGameOver: false,
      setupStartTime: Date.now(),
    };
  }

  /**
   * Start the duel sequence
   */
  async start(message: Message): Promise<void> {
    this.currentMessage = message;
    
    // Initial duel message
    const initialEmbed = this.createInitialEmbed();
    await this.currentMessage.edit({
      content: null,
      embeds: [initialEmbed],
      components: [],
    });
    
    // Start the suspense sequence
    await this.runSuspenseSequence();
  }

  /**
   * Run the suspense sequence before DRAW
   */
  private async runSuspenseSequence(): Promise<void> {
    const suspenseMessages = [
      '👀 Don\'t blink...',
      '🤫 ...',
      '⚠️ WAIT...',
    ];
    
    // Initial setup delay (2-3 seconds)
    await this.delay(2000 + Math.random() * 1000);
    
    // Show suspense messages
    for (const suspenseText of suspenseMessages) {
      if (this.state.isGameOver) return;
      
      const suspenseEmbed = this.createSuspenseEmbed(suspenseText);
      await this.currentMessage?.edit({
        embeds: [suspenseEmbed],
      });
      
      await this.delay(1500 + Math.random() * 1000);
    }
    
    // Random wait before DRAW (1-4 seconds)
    if (this.state.isGameOver) return;
    
    const randomDelay = 1000 + Math.random() * 3000;
    await this.delay(randomDelay);
    
    // Show DRAW state
    await this.showDrawState();
  }

  /**
   * Show the DRAW state with button
   */
  private async showDrawState(): Promise<void> {
    if (this.state.isGameOver || !this.currentMessage) return;
    
    this.state.drawStartTime = Date.now();
    
    const drawEmbed = this.createDrawEmbed();
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('quickdraw_fire')
          .setLabel('🔫 DRAW!')
          .setStyle(ButtonStyle.Danger)
      );
    
    await this.currentMessage.edit({
      embeds: [drawEmbed],
      components: [row],
    });
    
    // Set timeout to auto-end if no one clicks (30 seconds)
    const timeout = setTimeout(() => {
      if (!this.state.isGameOver) {
        this.endGameNoWinner();
      }
    }, 30000);
    
    this.timers.push(timeout);
  }

  /**
   * Handle button interaction
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<QuickDrawResult | null> {
    if (this.state.isGameOver) return null;
    
    const userId = interaction.user.id;
    
    // Only the two players can interact
    if (userId !== this.state.player1Id && userId !== this.state.player2Id) {
      await interaction.reply({
        content: 'This duel isn\'t yours.',
        ephemeral: true,
      });
      return null;
    }
    
    // Calculate reaction time
    if (!this.state.drawStartTime) return null;
    
    const reactionTime = Date.now() - this.state.drawStartTime;
    
    // Determine winner
    const winner = userId;
    const loser = userId === this.state.player1Id ? this.state.player2Id : this.state.player1Id;
    
    this.state.winner = winner;
    this.state.loser = loser;
    this.state.reactionTime = reactionTime;
    this.state.isGameOver = true;
    
    // Clear all timers
    this.clearTimers();
    
    // Disable button immediately
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('quickdraw_fire')
          .setLabel('🔫 DRAW!')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );
    
    await this.currentMessage?.edit({
      components: [row],
    });
    
    await interaction.deferUpdate();
    
    // Show suspense after shot
    await this.showShotFiredSuspense();
    
    // Show final result
    await this.showFinalResult();
    
    return {
      winner,
      loser,
      reactionTime,
    };
  }

  /**
   * Show suspense after shot is fired
   */
  private async showShotFiredSuspense(): Promise<void> {
    const suspenseEmbed = this.createShotFiredEmbed();
    await this.currentMessage?.edit({
      embeds: [suspenseEmbed],
    });
    
    await this.delay(2000);
  }

  /**
   * Show final result with GIF
   */
  private async showFinalResult(): Promise<void> {
    const resultEmbed = this.createResultEmbed();
    const gifUrl = this.state.winner === this.state.player1Id 
      ? QuickDrawGame.PLAYER1_WIN_GIF 
      : QuickDrawGame.PLAYER2_WIN_GIF;
    
    await this.currentMessage?.edit({
      embeds: [resultEmbed],
      files: [],
    });
    
    // Send GIF as separate message (only if channel supports it)
    if (this.currentMessage && 'send' in this.currentMessage.channel) {
      await this.currentMessage.channel.send({
        content: gifUrl,
      });
    }
  }

  /**
   * End game with no winner (timeout)
   */
  private async endGameNoWinner(): Promise<void> {
    this.state.isGameOver = true;
    this.clearTimers();
    
    const timeoutEmbed = this.createTimeoutEmbed();
    await this.currentMessage?.edit({
      embeds: [timeoutEmbed],
      components: [],
    });
  }

  /**
   * Clean up all timers
   */
  private clearTimers(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers = [];
  }

  /**
   * Get game state
   */
  getState(): QuickDrawState {
    return { ...this.state };
  }

  /**
   * Check if game is over
   */
  isFinished(): boolean {
    return this.state.isGameOver;
  }

  // Embed creation methods
  private createInitialEmbed() {
    return {
      title: '🤠 QUICK DRAW',
      description: `<@${this.state.player1Id}> **VS** <@${this.state.player2Id}>\n\nGet ready...`,
      color: 0xFFD700,
      thumbnail: {
        url: this.state.player1Avatar,
      },
      image: {
        url: this.state.player2Avatar,
      },
      footer: {
        text: 'First to draw wins.',
      },
    };
  }

  private createSuspenseEmbed(suspenseText: string) {
    return {
      title: '🤠 QUICK DRAW',
      description: `<@${this.state.player1Id}> **VS** <@${this.state.player2Id}>\n\n${suspenseText}`,
      color: 0xFFD700,
      thumbnail: {
        url: this.state.player1Avatar,
      },
      image: {
        url: this.state.player2Avatar,
      },
    };
  }

  private createDrawEmbed() {
    return {
      title: '🔫 QUICK DRAW',
      description: `<@${this.state.player1Id}> **VS** <@${this.state.player2Id}>\n\n# 🔫 DRAW!`,
      color: 0xFF0000,
      thumbnail: {
        url: this.state.player1Avatar,
      },
      image: {
        url: this.state.player2Avatar,
      },
    };
  }

  private createShotFiredEmbed() {
    return {
      title: '� QUICK DRAW',
      description: `<@${this.state.winner}> **VS** <@${this.state.loser}>\n\n💥 Shot fired...`,
      color: 0xFF4500,
      thumbnail: {
        url: this.state.winner === this.state.player1Id ? this.state.player1Avatar : this.state.player2Avatar,
      },
      image: {
        url: this.state.loser === this.state.player1Id ? this.state.player1Avatar : this.state.player2Avatar,
      },
    };
  }

  private createResultEmbed() {
    const reactionTimeText = this.state.reactionTime 
      ? `\n⚡ Reaction time: ${this.state.reactionTime}ms` 
      : '';
    
    return {
      title: '🔫 WHO SHOT WHO?',
      description: `🏆 <@${this.state.winner}>\n**shot**\n💀 <@${this.state.loser}>${reactionTimeText}`,
      color: 0xFFD700,
      thumbnail: {
        url: this.state.winner === this.state.player1Id ? this.state.player1Avatar : this.state.player2Avatar,
      },
      image: {
        url: this.state.loser === this.state.player1Id ? this.state.player1Avatar : this.state.player2Avatar,
      },
    };
  }

  private createTimeoutEmbed() {
    return {
      title: '🤠 QUICK DRAW',
      description: `<@${this.state.player1Id}> **VS** <@${this.state.player2Id}>\n\n⏰ Time's up! No one drew.`,
      color: 0x808080,
      thumbnail: {
        url: this.state.player1Avatar,
      },
      image: {
        url: this.state.player2Avatar,
      },
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      const timeout = setTimeout(resolve, ms);
      this.timers.push(timeout);
    });
  }
}
