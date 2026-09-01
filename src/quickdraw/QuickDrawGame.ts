import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction, EmbedBuilder, TextChannel } from 'discord.js';
import { QuickDrawImageGenerator } from '../utils/quickdraw-image-generator.js';
import { awardGameReward } from '../utils/game-rewards.js';

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
  gameInstanceId: string;
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
      gameInstanceId: `quickdraw_${channelId}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    };
  }

  /**
   * Start the duel sequence
   */
  async start(message: Message): Promise<void> {
    this.currentMessage = message;
    
    // Initial duel message with disabled button
    const initialEmbed = await this.createInitialEmbed();
    const disabledRow = this.createDisabledButtonRow();
    
    await this.currentMessage.edit({
      content: null,
      embeds: [initialEmbed.embed],
      files: initialEmbed.files,
      components: [disabledRow],
    });
    
    // Start the suspense sequence
    await this.runSuspenseSequence();
  }

  /**
   * Run the suspense sequence before DRAW
   */
  private async runSuspenseSequence(): Promise<void> {
    const disabledRow = this.createDisabledButtonRow();
    
    // Countdown phase (3, 2, 1)
    for (let countdown = 3; countdown >= 1; countdown--) {
      if (this.state.isGameOver) return;
      
      const headerBuffer = await QuickDrawImageGenerator.generateDuelHeader({
        player1Avatar: this.state.player1Avatar,
        player2Avatar: this.state.player2Avatar,
        countdown,
      });
      
      const countdownData = this.createCountdownEmbed(headerBuffer, countdown);
      await this.currentMessage?.edit({
        embeds: [countdownData.embed],
        files: countdownData.files,
        components: [disabledRow],
      });
      
      await this.delay(1000);
    }
    
    // Suspense phase
    const suspenseMessages = [
      '👀 Don\'t blink...',
      '🤫 ...',
      '⚠️ WAIT...',
    ];
    
    // Show suspense messages
    for (const suspenseText of suspenseMessages) {
      if (this.state.isGameOver) return;
      
      const headerBuffer = await QuickDrawImageGenerator.generateDuelHeader({
        player1Avatar: this.state.player1Avatar,
        player2Avatar: this.state.player2Avatar,
      });
      
      const suspenseData = this.createSuspenseEmbed(headerBuffer, suspenseText);
      await this.currentMessage?.edit({
        embeds: [suspenseData.embed],
        files: suspenseData.files,
        components: [disabledRow],
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
    
    const drawData = await this.createDrawEmbed();
    const enabledRow = this.createEnabledButtonRow();
    
    await this.currentMessage.edit({
      embeds: [drawData.embed],
      files: drawData.files,
      components: [enabledRow],
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
    
    // Create victory embed with GIF embedded
    const victoryEmbed = this.createResultEmbed();
    
    await interaction.update({
      embeds: [victoryEmbed],
      components: [row],
      files: [], // Clear any previous image attachments
      attachments: [], // Clear any previous attachments
    });

    // Award Bombo Coins to the winner
    if (this.currentMessage?.channel) {
      await awardGameReward(winner, 700, 'Quick Draw', this.currentMessage.channel as TextChannel, this.state.gameInstanceId);
    }
    
    return {
      winner,
      loser,
      reactionTime,
    };
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
   * Get game instance ID
   */
  getGameInstanceId(): string {
    return this.state.gameInstanceId;
  }

  /**
   * Check if game is over
   */
  isFinished(): boolean {
    return this.state.isGameOver;
  }

  // Embed creation methods
  private async createInitialEmbed(): Promise<{ embed: any; files: any[] }> {
    const headerBuffer = await QuickDrawImageGenerator.generateDuelHeader({
      player1Avatar: this.state.player1Avatar,
      player2Avatar: this.state.player2Avatar,
    });

    return {
      embed: {
        title: '🤠 QUICK DRAW',
        description: `<@${this.state.player1Id}> **VS** <@${this.state.player2Id}>\n\nGet ready...`,
        color: 0xFFD700,
        image: {
          url: 'attachment://header.png',
        },
        footer: {
          text: 'First to draw wins.',
        },
      },
      files: [{ attachment: headerBuffer, name: 'header.png' }],
    };
  }

  private createCountdownEmbed(headerBuffer: Buffer, countdown: number): { embed: any; files: any[] } {
    return {
      embed: {
        title: '🤠 QUICK DRAW',
        description: `<@${this.state.player1Id}> **VS** <@${this.state.player2Id}>`,
        color: 0xFFD700,
        image: {
          url: 'attachment://header.png',
        },
      },
      files: [{ attachment: headerBuffer, name: 'header.png' }],
    };
  }

  private createSuspenseEmbed(headerBuffer: Buffer, suspenseText: string): { embed: any; files: any[] } {
    return {
      embed: {
        title: '🤠 QUICK DRAW',
        description: `<@${this.state.player1Id}> **VS** <@${this.state.player2Id}>\n\n${suspenseText}`,
        color: 0xFFD700,
        image: {
          url: 'attachment://header.png',
        },
      },
      files: [{ attachment: headerBuffer, name: 'header.png' }],
    };
  }

  private async createDrawEmbed(): Promise<{ embed: any; files: any[] }> {
    const headerBuffer = await QuickDrawImageGenerator.generateDuelHeader({
      player1Avatar: this.state.player1Avatar,
      player2Avatar: this.state.player2Avatar,
    });

    return {
      embed: {
        title: '🔫 QUICK DRAW',
        description: `<@${this.state.player1Id}> **VS** <@${this.state.player2Id}>\n\n# 🔫 DRAW!`,
        color: 0xFF0000,
        image: {
          url: 'attachment://header.png',
        },
      },
      files: [{ attachment: headerBuffer, name: 'header.png' }],
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
    const reactionTime = this.state.reactionTime || 0;
    const formattedSeconds = (reactionTime / 1000).toFixed(3);
    const winGif = this.state.winner === this.state.player1Id ? QuickDrawGame.PLAYER1_WIN_GIF : QuickDrawGame.PLAYER2_WIN_GIF;

    return new EmbedBuilder()
      .setTitle('🏆 QUICK DRAW RESULTS')
      .setColor(0xFFD700)
      .setDescription(
        `**<@${this.state.winner}> VS <@${this.state.loser}>**\n\n` +
        `### 🥇 <@${this.state.winner}> is the fastest gun!\n\n` +
        `🎯 **Reaction Time:** \`${formattedSeconds}s\` (${reactionTime}ms)\n\n` +
        `💀 **Fallen Cowboy:** <@${this.state.loser}>`
      )
      .setImage(winGif)
      .setFooter({ text: 'Fastest trigger finger in the server!' });
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

  /**
   * Create disabled button row
   */
  private createDisabledButtonRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('quickdraw_fire')
          .setLabel('🔫 DRAW!')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );
  }

  /**
   * Create enabled button row
   */
  private createEnabledButtonRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('quickdraw_fire')
          .setLabel('🔫 DRAW!')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(false)
      );
  }
}
