import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction, EmbedBuilder, TextChannel } from 'discord.js';
import { awardGameReward } from '../utils/game-rewards.js';

export interface PissCompPlayer {
  id: string;
  name: string;
  avatar: string;
}

export interface PissCompState {
  channelId: string;
  guildId?: string;
  player1: PissCompPlayer;
  player2: PissCompPlayer;
  isGameOver: boolean;
  winner?: string;
  messageId?: string;
  player1Meter: number;
  player2Meter: number;
  isDraw: boolean;
  gameInstanceId: string;
}

export interface PissCompResult {
  winner: string;
  loser: string;
  isDraw: boolean;
}

/**
 * Manages Piss Competition game state and logic
 */
export class PissCompGame {
  private state: PissCompState;
  private currentMessage?: Message;
  private onGameEnd?: (winnerId?: string) => void;
  private isPartOfMax: boolean = false;
  // True during the 5 second pause after a draw. The game is NOT over then, it restarts.
  private isResetting: boolean = false;
  private idleTimeout?: NodeJS.Timeout;
  private static readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000;

  // Game constants
  private static readonly MAX_METER = 100;
  private static readonly PUMP_AMOUNT = 10;
  private static readonly WIN_THRESHOLD = 100;

  // GIF URLs
  private static readonly VICTORY_GIF = 'https://media.tenor.com/8HeSw9R-bwoAAAAC/air-piss-golden-shower.gif';
  private static readonly DRAW_GIF = 'https://c.tenor.com/QbUc4tAypvYAAAAd/tenor.gif';

  constructor(
    channelId: string,
    guildId: string | undefined,
    player1: PissCompPlayer,
    player2: PissCompPlayer,
    onGameEnd?: (winnerId?: string) => void,
    isPartOfMax: boolean = false
  ) {
    this.state = {
      channelId,
      guildId,
      player1,
      player2,
      isGameOver: false,
      player1Meter: 0,
      player2Meter: 0,
      isDraw: false,
      gameInstanceId: `pisscomp_${channelId}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    };
    this.onGameEnd = onGameEnd;
    this.isPartOfMax = isPartOfMax;
    console.log(`[PissCompGame] Game created - isPartOfMax: ${isPartOfMax}`);
  }

  /**
   * Start the game
   */
  async start(message: Message): Promise<void> {
    this.currentMessage = message;
    
    // Show initial game state
    await this.showGameState();
    this.armIdleTimeout();
  }

  /**
   * End the game if nobody pumps for a while, so the channel is never blocked forever.
   */
  private armIdleTimeout(): void {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.idleTimeout = setTimeout(() => {
      if (this.state.isGameOver) return;
      this.state.isGameOver = true;
      this.currentMessage?.edit({
        embeds: [
          new EmbedBuilder()
            .setDescription('💤 Nobody pumped for a while, competition cancelled.')
            .setColor(0x95a5a6),
        ],
        components: this.createDisabledPumpButtons(),
      }).catch((error) => console.error('[PissCompGame] Failed to edit idle message:', error));
      this.onGameEnd?.(undefined);
    }, PissCompGame.IDLE_TIMEOUT_MS);
  }

  private clearIdleTimeout(): void {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = undefined;
    }
  }

  /**
   * Handle button interaction
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state.isGameOver) {
      await interaction.reply({ content: 'This competition is over.', ephemeral: true }).catch(() => {});
      return;
    }

    // Draw pause: acknowledge the click so Discord doesn't show "interaction failed", but ignore it.
    if (this.isResetting) {
      await interaction.deferUpdate().catch(() => {});
      return;
    }

    this.armIdleTimeout();

    const userId = interaction.user.id;
    const customId = interaction.customId;

    // Handle player 1 pump
    if (customId === 'pisscomp_pump_p1') {
      if (userId !== this.state.player1.id) {
        await interaction.reply({
          content: "This isn't your pump!",
          ephemeral: true,
        });
        return;
      }

      await this.handlePump(1, interaction);
    }
    // Handle player 2 pump
    else if (customId === 'pisscomp_pump_p2') {
      if (userId !== this.state.player2.id) {
        await interaction.reply({
          content: "This isn't your pump!",
          ephemeral: true,
        });
        return;
      }

      await this.handlePump(2, interaction);
    }
  }

  /**
   * Handle a pump action
   */
  private async handlePump(playerNum: number, interaction: MessageComponentInteraction): Promise<void> {
    // Update the appropriate meter
    if (playerNum === 1) {
      this.state.player1Meter = Math.min(
        PissCompGame.MAX_METER,
        this.state.player1Meter + PissCompGame.PUMP_AMOUNT
      );
    } else {
      this.state.player2Meter = Math.min(
        PissCompGame.MAX_METER,
        this.state.player2Meter + PissCompGame.PUMP_AMOUNT
      );
    }

    // Check for win condition
    const player1Won = this.state.player1Meter >= PissCompGame.WIN_THRESHOLD;
    const player2Won = this.state.player2Meter >= PissCompGame.WIN_THRESHOLD;

    if (player1Won && player2Won) {
      // Draw - both reached threshold
      await this.handleDraw(interaction);
    } else if (player1Won) {
      // Player 1 wins
      await this.handleVictory(this.state.player1.id, this.state.player2.id, interaction);
    } else if (player2Won) {
      // Player 2 wins
      await this.handleVictory(this.state.player2.id, this.state.player1.id, interaction);
    } else {
      // Game continues, update the display
      await interaction.update({
        embeds: [this.createGameEmbed()],
        components: this.createPumpButtons(),
      });
    }
  }

  /**
   * Handle a draw
   */
  private async handleDraw(interaction: MessageComponentInteraction): Promise<void> {
    // A draw is NOT the end of the game: pause, then restart. Marking the game as "over" here
    // made the command layer forget the game, so the restarted buttons did nothing.
    this.state.isDraw = true;
    this.isResetting = true;

    await interaction.update({
      embeds: [this.createDrawEmbed()],
      components: this.createDisabledPumpButtons(),
    });

    // Wait 5 seconds then restart
    await this.delay(5000);

    try {
      // Reset game state
      this.state.player1Meter = 0;
      this.state.player2Meter = 0;
      this.state.isDraw = false;

      // Restart the game
      await this.showGameState();
    } finally {
      this.isResetting = false;
    }
  }

  /**
   * Handle a victory
   */
  private async handleVictory(winnerId: string, loserId: string, interaction: MessageComponentInteraction): Promise<void> {
    this.state.winner = winnerId;
    this.state.isGameOver = true;
    this.clearIdleTimeout();

    try {
      const victoryEmbed = this.createVictoryEmbed(winnerId, loserId);

      await interaction.update({
        embeds: [victoryEmbed],
        components: this.createDisabledPumpButtons(),
      });

      // Award Bombo Coins to the winner (only on victory, not on draw, and NOT if part of PissCompMax)
      if (!this.isPartOfMax && this.currentMessage?.channel) {
        console.log(`[PissCompGame] Awarding 900 coins to winner ${winnerId}`);
        await awardGameReward(winnerId, 900, 'Piss Comp', this.currentMessage.channel as TextChannel, this.state.gameInstanceId);
      } else {
        console.log(`[PissCompGame] Skipping coin reward - isPartOfMax: ${this.isPartOfMax}`);
      }
    } finally {
      // Always release the channel (and hand over to Piss Comp Max), even if Discord errored above
      if (this.onGameEnd) {
        this.onGameEnd(winnerId);
      }
    }
  }

  /**
   * Show current game state
   */
  private async showGameState(): Promise<void> {
    const embed = this.createGameEmbed();
    const components = this.createPumpButtons();

    await this.currentMessage?.edit({
      content: null,
      embeds: [embed],
      components,
    });
  }

  /**
   * Create the game embed
   */
  private createGameEmbed(): EmbedBuilder {
    const player1MeterVisual = this.createMeterVisual(this.state.player1Meter);
    const player2MeterVisual = this.createMeterVisual(this.state.player2Meter);

    return new EmbedBuilder()
      .setTitle('💦 PISS COMPETITION')
      .setDescription(
        `<@${this.state.player1.id}> **VS** <@${this.state.player2.id}>\n\n` +
        `**${this.state.player1.name}**\n${player1MeterVisual} ${this.state.player1Meter}%\n\n` +
        `**${this.state.player2.name}**\n${player2MeterVisual} ${this.state.player2Meter}%`
      )
      .setColor(0x00BFFF)
      .setThumbnail('https://cdn.discordapp.com/emojis/1256402744083284029.webp?size=96')
      .setFooter({ text: 'First to 100% wins!' });
  }

  /**
   * Create a visual meter representation
   */
  private createMeterVisual(percentage: number): string {
    const filledBlocks = Math.floor(percentage / 10);
    const emptyBlocks = 10 - filledBlocks;
    return '🟦'.repeat(filledBlocks) + '⬜'.repeat(emptyBlocks);
  }

  /**
   * Create the victory embed
   */
  private createVictoryEmbed(winnerId: string, loserId: string): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('<:15394trophy:1545135066148118628>PISS COMPETITION — WINNER')
      .setDescription(
        `<@${winnerId}> filled the meter first!\n\n` +
        `<@${this.state.player1.id}> VS <@${this.state.player2.id}>`
      )
      .setColor(0xFFD700)
      .setImage(PissCompGame.VICTORY_GIF)
      .setFooter({ text: 'Golden shower achieved!' });
  }

  /**
   * Create the draw embed
   */
  private createDrawEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('💦 PISS COMPETITION — DRAW')
      .setDescription(
        `<@${this.state.player1.id}> 🤝 <@${this.state.player2.id}>`
      )
      .setColor(0xFFA500)
      .setImage(PissCompGame.DRAW_GIF)
      .setFooter({ text: 'Restarting in 5 seconds...' });
  }

  /**
   * Create pump buttons
   */
  private createPumpButtons(): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('pisscomp_pump_p1')
        .setLabel(`💦 PUMP (${this.state.player1.name})`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(false)
    );

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('pisscomp_pump_p2')
        .setLabel(`💦 PUMP (${this.state.player2.name})`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(false)
    );

    return [row];
  }

  /**
   * Create disabled pump buttons
   */
  private createDisabledPumpButtons(): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('pisscomp_pump_p1')
        .setLabel(`💦 PUMP (${this.state.player1.name})`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true)
    );

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('pisscomp_pump_p2')
        .setLabel(`💦 PUMP (${this.state.player2.name})`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

    return [row];
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get game state
   */
  getState(): PissCompState {
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
}