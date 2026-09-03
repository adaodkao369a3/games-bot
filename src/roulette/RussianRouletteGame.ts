import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction, EmbedBuilder, TextChannel } from 'discord.js';
import { awardGameReward } from '../utils/game-rewards.js';

export interface RoulettePlayer {
  id: string;
  name: string;
  avatar: string;
  isEliminated: boolean;
  hasUsedDoubleTurn: boolean;
}

export interface RouletteState {
  channelId: string;
  guildId?: string;
  players: RoulettePlayer[];
  currentPlayerIndex: number;
  isGameOver: boolean;
  winner?: string;
  chamberCount: number;
  bulletCount: number;
  chambers: boolean[]; // true = bullet, false = empty
  currentChamberIndex: number;
  messageId?: string;
  turnStartTime?: number;
  isDoubleTurnActive: boolean;
  doubleTurnShotNumber: number; // 1 or 2
  gameInstanceId: string;
}

export interface RouletteResult {
  winner: string;
  eliminated: string[];
}

/**
 * Manages Russian Roulette game state and logic
 */
export class RussianRouletteGame {
  private state: RouletteState;
  private currentMessage?: Message;
  private timers: NodeJS.Timeout[] = [];
  private onGameEnd?: () => void;

  // GIF URLs
  private static readonly STARTING_PLAYER_GIF = 'https://c.tenor.com/sjaTtq5lHVwAAAAd/tenor.gif';
  private static readonly BARREL_SPIN_GIF = 'https://c.tenor.com/fklGVnlUSFQAAAAd/tenor.gif';
  private static readonly EMPTY_CHAMBER_GIF = 'https://i.gifer.com/9mOY.gif';
  private static readonly BULLET_GIF = 'https://i.makeagif.com/media/1-10-2025/mueyNh.gif';

  constructor(
    channelId: string,
    guildId: string | undefined,
    players: RoulettePlayer[],
    onGameEnd?: () => void
  ) {
    this.state = {
      channelId,
      guildId,
      players,
      currentPlayerIndex: 0,
      isGameOver: false,
      chamberCount: 6,
      bulletCount: 1,
      chambers: this.initializeChambers(6, 1),
      currentChamberIndex: 0,
      isDoubleTurnActive: false,
      doubleTurnShotNumber: 0,
      gameInstanceId: `roulette_${channelId}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    };
    this.onGameEnd = onGameEnd;
  }

  /**
   * Initialize chambers with bullets
   */
  private initializeChambers(total: number, bullets: number): boolean[] {
    const chambers = new Array(total).fill(false);
    let bulletsPlaced = 0;
    
    while (bulletsPlaced < bullets) {
      const randomIndex = Math.floor(Math.random() * total);
      if (!chambers[randomIndex]) {
        chambers[randomIndex] = true;
        bulletsPlaced++;
      }
    }
    
    return chambers;
  }

  /**
   * Start the game
   */
  async start(message: Message): Promise<void> {
    this.currentMessage = message;
    
    // Show starting player selection GIF
    await this.showStartingPlayerSelection();
  }

  /**
   * Show starting player selection with GIF
   */
  private async showStartingPlayerSelection(): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🔫 RUSSIAN ROULETTE')
      .setDescription('🎲 Choosing the first player...\n\nThe chamber is ready.')
      .setColor(0xFFD700)
      .setImage(RussianRouletteGame.STARTING_PLAYER_GIF);

    await this.currentMessage?.edit({
      content: null,
      embeds: [embed],
      components: [],
    });

    // Wait for GIF to play (exactly 9 seconds - this IS the stage duration)
    await this.delay(9000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Randomly select starting player
    this.state.currentPlayerIndex = Math.floor(Math.random() * this.state.players.length);

    // Reveal first player
    await this.revealFirstPlayer();
  }

  /**
   * Reveal the first player
   */
  private async revealFirstPlayer(): Promise<void> {
    const firstPlayer = this.state.players[this.state.currentPlayerIndex];
    
    const embed = new EmbedBuilder()
      .setTitle('🎯 FIRST TURN')
      .setDescription(`<@${firstPlayer.id}>\n\nYou have been chosen to go first.`)
      .setColor(0xFFD700)
      .setThumbnail(firstPlayer.avatar);

    await this.currentMessage?.edit({
      embeds: [embed],
    });

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Start the first turn
    await this.startTurn();
  }

  /**
   * Start a player's turn
   */
  private async startTurn(): Promise<void> {
    if (this.state.isGameOver) return;

    // Check win condition
    if (this.checkWinCondition()) {
      await this.showWinner();
      return;
    }

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    
    // Show barrel spin GIF
    await this.showBarrelSpin(currentPlayer);
  }

  /**
   * Show barrel spin GIF
   */
  private async showBarrelSpin(player: RoulettePlayer): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🔫 RUSSIAN ROULETTE')
      .setDescription(`🎯 <@${player.id}>\n\nThe barrel spins...`)
      .setColor(0xFFD700)
      .setImage(RussianRouletteGame.BARREL_SPIN_GIF);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [],
    });

    // Wait for GIF to play (exactly 4 seconds - this IS the stage duration)
    await this.delay(4000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Show trigger state
    await this.showTriggerState(player);
  }

  /**
   * Show trigger state with buttons
   */
  private async showTriggerState(player: RoulettePlayer): Promise<void> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    // Pull trigger button
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('roulette_trigger')
        .setLabel('🔫 PULL TRIGGER')
        .setStyle(ButtonStyle.Danger)
    );

    // Double turn button (only if not used and not in double turn)
    if (!player.hasUsedDoubleTurn && !this.state.isDoubleTurnActive) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('roulette_double')
          .setLabel('🔁 DOUBLE TURN')
          .setStyle(ButtonStyle.Primary)
      );
    }

    const embed = new EmbedBuilder()
      .setTitle('🔫 RUSSIAN ROULETTE')
      .setDescription(
        `🎯 <@${player.id}>\n\nThe barrel has stopped.\n\n<@${player.id}>, pull the trigger.`
      )
      .setColor(0xFFD700)
      .setThumbnail(player.avatar)
      .addFields({ name: '👥 PLAYERS', value: this.getPlayerListString() });

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [row],
    });

    // Start 10-second timeout
    this.state.turnStartTime = Date.now();
    const timeout = setTimeout(() => {
      if (!this.state.isGameOver && this.state.turnStartTime) {
        this.handleTimeout();
      }
    }, 10000);

    this.timers.push(timeout);
  }

  /**
   * Handle 10-second timeout
   */
  private async handleTimeout(): Promise<void> {
    if (this.state.isGameOver) return;

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    
    const embed = new EmbedBuilder()
      .setTitle('⏰ TIMEOUT')
      .setDescription(`<@${currentPlayer.id}> took too long...\n\nThe revolver will fire automatically.`)
      .setColor(0xFF0000);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [],
    });

    await this.delay(2000);

    // Automatically trigger
    await this.pullTrigger();
  }

  /**
   * Handle button interaction
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state.isGameOver) return;

    const userId = interaction.user.id;
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];

    // Only current player can interact
    if (userId !== currentPlayer.id) {
      await interaction.reply({
        content: "This isn't your turn.",
        ephemeral: true,
      });
      return;
    }

    const customId = interaction.customId;

    if (customId === 'roulette_trigger') {
      // Clear timeout
      this.clearTimers();
      
      await interaction.update({
        components: [],
      });

      await this.pullTrigger();
    } else if (customId === 'roulette_double') {
      // Clear timeout
      this.clearTimers();
      
      await interaction.update({
        components: [],
      });

      await this.useDoubleTurn();
    }
  }

  /**
   * Pull the trigger
   */
  private async pullTrigger(): Promise<void> {
    const result = await this.executeShot();
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];

    // Handle result based on context
    if (this.state.isDoubleTurnActive) {
      if (this.state.doubleTurnShotNumber === 1) {
        // First shot of double turn
        if (result === 'bullet') {
          // Player died on first shot, end turn
          await this.showBulletResult(currentPlayer);
        } else {
          // Player survived first shot, show second shot UI
          await this.showEmptyResult(currentPlayer, false); // Don't advance turn
          await this.showSecondShotUI(currentPlayer);
        }
      } else {
        // Second shot of double turn
        if (result === 'bullet') {
          await this.showBulletResult(currentPlayer);
        } else {
          await this.showEmptyResult(currentPlayer, true); // Advance turn
        }
      }
    } else {
      // Normal turn
      if (result === 'bullet') {
        await this.showBulletResult(currentPlayer);
      } else {
        await this.showEmptyResult(currentPlayer, true); // Advance turn
      }
    }
  }

  /**
   * Execute a shot and return the result
   */
  private async executeShot(): Promise<'empty' | 'bullet'> {
    const chamberIndex = this.state.currentChamberIndex % this.state.chambers.length;
    const hasBullet = this.state.chambers[chamberIndex];

    this.state.currentChamberIndex++;

    // Suspense before revealing result
    await this.delay(1500);

    // Check if game is still active
    if (this.state.isGameOver) return 'empty';

    return hasBullet ? 'bullet' : 'empty';
  }

  /**
   * Show empty chamber result
   */
  private async showEmptyResult(player: RoulettePlayer, shouldAdvanceTurn: boolean = true): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🔫 RUSSIAN ROULETTE')
      .setDescription(
        `😮 CLICK...\n\n<@${player.id}> survived.\n\nThe chamber was empty.`
      )
      .setColor(0x00FF00)
      .setImage(RussianRouletteGame.EMPTY_CHAMBER_GIF);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [],
    });

    // Wait for GIF to play (exactly 4 seconds)
    await this.delay(4000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    if (shouldAdvanceTurn) {
      // Reset double turn state when advancing turn
      this.state.isDoubleTurnActive = false;
      this.state.doubleTurnShotNumber = 0;

      // Transition pause before next player
      await this.delay(2000);

      // Check if game is still active
      if (this.state.isGameOver) return;

      // Move to next player
      this.moveToNextPlayer();
      await this.startTurn();
    }
  }

  /**
   * Show bullet result
   */
  private async showBulletResult(player: RoulettePlayer): Promise<void> {
    player.isEliminated = true;

    const embed = new EmbedBuilder()
      .setTitle('💀 RUSSIAN ROULETTE')
      .setDescription(
        `💥 BANG!\n\n<@${player.id}> has been eliminated.\n\nYou are cooked.`
      ) 
      .setColor(0xFF0000)
      .setImage(RussianRouletteGame.BULLET_GIF);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [],
    });

    // Wait for GIF to play (exactly 8 seconds)
    await this.delay(8000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Transition pause after elimination
    await this.delay(2000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Reset double turn state on death
    this.state.isDoubleTurnActive = false;
    this.state.doubleTurnShotNumber = 0;

    // Check win condition BEFORE moving to next player
    // This ensures the death GIF plays fully before winner is shown
    if (this.checkWinCondition()) {
      await this.showWinner();
      return;
    }

    // Move to next player
    this.moveToNextPlayer();
    await this.startTurn();
  }

  /**
   * Use double turn
   */
  private async useDoubleTurn(): Promise<void> {
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    currentPlayer.hasUsedDoubleTurn = true;

    // Set double turn state
    this.state.isDoubleTurnActive = true;
    this.state.doubleTurnShotNumber = 1;

    const embed = new EmbedBuilder()
      .setTitle('🔁 DOUBLE TURN')
      .setDescription(`🔁 <@${currentPlayer.id}> used their DOUBLE TURN!\n\nFirst shot...`)
      .setColor(0xFFD700)
      .setThumbnail(currentPlayer.avatar);

    await this.currentMessage?.edit({
      embeds: [embed],
    });

    await this.delay(1500);

    // Automatically execute first shot
    await this.pullTrigger();
  }

  /**
   * Show second shot UI (only trigger button, no double turn button)
   */
  private async showSecondShotUI(player: RoulettePlayer): Promise<void> {
    // Set double turn shot number to 2
    this.state.doubleTurnShotNumber = 2;

    const row = new ActionRowBuilder<ButtonBuilder>();

    // Only pull trigger button - NO double turn button
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('roulette_trigger')
        .setLabel('🔫 PULL TRIGGER')
        .setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setTitle('🔁 SECOND SHOT')
      .setDescription(
        `🔁 <@${player.id}> survived the first shot.\n\nOne shot remains.`
      )
      .setColor(0xFFD700)
      .setThumbnail(player.avatar)
      .addFields({ name: '👥 PLAYERS', value: this.getPlayerListString() });

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [row],
    });

    // Start 10-second timeout
    this.state.turnStartTime = Date.now();
    const timeout = setTimeout(() => {
      if (!this.state.isGameOver && this.state.turnStartTime) {
        this.handleTimeout();
      }
    }, 10000);

    this.timers.push(timeout);
  }

  /**
   * Move to next active player
   */
  private moveToNextPlayer(): void {
    const startIndex = this.state.currentPlayerIndex;
    let nextIndex = (startIndex + 1) % this.state.players.length;
    
    // Skip eliminated players
    while (nextIndex !== startIndex && this.state.players[nextIndex].isEliminated) {
      nextIndex = (nextIndex + 1) % this.state.players.length;
    }
    
    this.state.currentPlayerIndex = nextIndex;
  }

  /**
   * Check win condition
   */
  private checkWinCondition(): boolean {
    const activePlayers = this.state.players.filter(p => !p.isEliminated);
    return activePlayers.length === 1;
  }

  /**
   * Show winner
   */
  private async showWinner(): Promise<void> {
    const activePlayers = this.state.players.filter(p => !p.isEliminated);
    const winner = activePlayers[0];
    
    this.state.winner = winner.id;
    this.state.isGameOver = true;
    this.clearTimers();

    const embed = new EmbedBuilder()
      .setTitle('<:15394trophy:1545135066148118628>RUSSIAN ROULETTE')
      .setDescription(
        `👑 LAST PLAYER STANDING\n\n<@${winner.id}>\n\nYou survived everyone.\n\nThe chamber has gone silent.`
      )
      .setColor(0xFFD700)
      .setThumbnail(winner.avatar);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [],
    });

    // Award Bombo Coins to the winner
    if (this.currentMessage?.channel) {
      await awardGameReward(winner.id, 700, 'Russian Roulette', this.currentMessage.channel as TextChannel, this.state.gameInstanceId);
    }

    // Call cleanup callback to remove game from active games
    if (this.onGameEnd) {
      this.onGameEnd();
    }
  }

  /**
   * Get player list string
   */
  private getPlayerListString(): string {
    return this.state.players
      .map(player => {
        const status = player.isEliminated ? '💀' : '🟢';
        return `${status} <@${player.id}>`;
      })
      .join('\n');
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
  getState(): RouletteState {
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
