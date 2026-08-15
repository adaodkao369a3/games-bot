import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction, EmbedBuilder } from 'discord.js';
import { QuickDrawImageGenerator } from '../utils/quickdraw-image-generator.js';

export interface QuickDrawMaxState {
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

export interface QuickDrawMaxResult {
  winner: string;
  loser: string;
  reactionTime: number;
}

/**
 * Manages Quick Draw Max duel state and logic with distraction phase
 */
export class QuickDrawMaxGame {
  private state: QuickDrawMaxState;
  private currentMessage?: Message;
  private timers: NodeJS.Timeout[] = [];
  
  // GIF URLs
  private static readonly DISTRACTION_GIFS = [
    'https://64.media.tumblr.com/856124ad485a570a57576b8cca0b8f6e/tumblr_nl611yirs81rcufwuo1_500.gif',
    'https://c.tenor.com/rJH1bgY-V14AAAAd/tenor.gif',
    'https://c.tenor.com/cuW_cX4icJ8AAAAd/tenor.gif',
    'https://c.tenor.com/-mjPgG3RuhYAAAAd/tenor.gif',
    'https://media.tenor.com/O2p0QIYkbdkAAAAM/anime-twerk.gif',
  ];
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
    
    // Random wait before distraction (1-4 seconds)
    if (this.state.isGameOver) return;
    
    const randomDelay = 1000 + Math.random() * 3000;
    await this.delay(randomDelay);
    
    // Show distraction phase
    await this.showDistractionPhase();
  }

  /**
   * Show the distraction phase with GIF
   */
  private async showDistractionPhase(): Promise<void> {
    if (this.state.isGameOver || !this.currentMessage) return;
    
    const distractionMessages = [
      '😏 "Well, well... who\'s a good boy now? :3"',
      '😏 "Getting nervous?"',
      '😏 "Don\'t get distracted... the real test is coming honey."',
    ];
    
    const randomMessage = distractionMessages[Math.floor(Math.random() * distractionMessages.length)];
    const randomGif = QuickDrawMaxGame.DISTRACTION_GIFS[Math.floor(Math.random() * QuickDrawMaxGame.DISTRACTION_GIFS.length)];
    const disabledRow = this.createDisabledButtonRow();
    
    const distractionEmbed = new EmbedBuilder()
      .setTitle('😏 QUICK DRAW MAX')
      .setDescription(
        `<@${this.state.player1Id}> **VS** <@${this.state.player2Id}>\n\n${randomMessage}`
      )
      .setColor(0xFF69B4)
      .setImage(randomGif);
    
    await this.currentMessage.edit({
      embeds: [distractionEmbed],
      components: [disabledRow], // Keep button visible but disabled
      files: [],
      attachments: [],
    });
    
    // Wait for distraction GIF to play (6 seconds)
    await this.delay(6000);
    
    // Check if game is still active
    if (this.state.isGameOver) return;
    
    // Show DRAW state immediately after distraction
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
  async handleInteraction(interaction: MessageComponentInteraction): Promise<QuickDrawMaxResult | null> {
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
          .setCustomId('quickdrawmax_fire')
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
  getState(): QuickDrawMaxState {
    return { ...this.state };
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
        title: '🤠 QUICK DRAW MAX',
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
        title: '🤠 QUICK DRAW MAX',
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
        title: '🤠 QUICK DRAW MAX',
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
        title: '🔫 QUICK DRAW MAX',
        description: `<@${this.state.player1Id}> **VS** <@${this.state.player2Id}>\n\n# 🔫 DRAW!`,
        color: 0xFF0000,
        image: {
          url: 'attachment://header.png',
        },
      },
      files: [{ attachment: headerBuffer, name: 'header.png' }],
    };
  }

  private createResultEmbed() {
    const reactionTime = this.state.reactionTime || 0;
    const formattedSeconds = (reactionTime / 1000).toFixed(3);
    const winGif = this.state.winner === this.state.player1Id ? QuickDrawMaxGame.PLAYER1_WIN_GIF : QuickDrawMaxGame.PLAYER2_WIN_GIF;

    return new EmbedBuilder()
      .setTitle('🏆 QUICK DRAW MAX RESULTS')
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
      title: '🤠 QUICK DRAW MAX',
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
          .setCustomId('quickdrawmax_fire')
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
          .setCustomId('quickdrawmax_fire')
          .setLabel('🔫 DRAW!')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(false)
      );
  }
}
