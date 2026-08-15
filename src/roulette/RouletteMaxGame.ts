import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction, EmbedBuilder } from 'discord.js';

export interface RouletteMaxPlayer {
  id: string;
  name: string;
  avatar: string;
}

export interface RouletteMaxState {
  channelId: string;
  guildId?: string;
  player1: RouletteMaxPlayer;
  player2: RouletteMaxPlayer;
  isGameOver: boolean;
  winner?: string;
  messageId?: string;
  currentPhase: RouletteMaxPhase;
  startingPlayer: number; // 1 or 2
  player1SecretMoveActivated: boolean;
  player2SecretMoveActivated: boolean;
  player1Score: number;
  player2Score: number;
  currentRound: number;
  roundInSet: number;
  roundStartTime?: number;
  roundDecided: boolean;
}

export enum RouletteMaxPhase {
  STARTING = 'STARTING',
  STARTING_PLAYER_SELECTION = 'STARTING_PLAYER_SELECTION',
  NORMAL_PLAYER1_SHOT1 = 'NORMAL_PLAYER1_SHOT1',
  NORMAL_PLAYER2_SHOT1 = 'NORMAL_PLAYER2_SHOT1',
  NORMAL_PLAYER1_SHOT2 = 'NORMAL_PLAYER1_SHOT2',
  NORMAL_PLAYER2_SHOT2 = 'NORMAL_PLAYER2_SHOT2',
  SECRET_MOVE_WAITING = 'SECRET_MOVE_WAITING',
  PLAYER1_DOMAIN = 'PLAYER1_DOMAIN',
  PLAYER2_DOMAIN = 'PLAYER2_DOMAIN',
  DOMAIN_CLASH = 'DOMAIN_CLASH',
  ATTACK_ROUND = 'ATTACK_ROUND',
  ROUND_RESULT = 'ROUND_RESULT',
  TIEBREAKER = 'TIEBREAKER',
  VICTORY = 'VICTORY',
  FINISHED = 'FINISHED',
}

export interface RouletteMaxResult {
  winner: string;
  loser: string;
  player1Score: number;
  player2Score: number;
}

/**
 * Manages Roulette Max game state and logic
 */
export class RouletteMaxGame {
  private state: RouletteMaxState;
  private currentMessage?: Message;
  private timers: NodeJS.Timeout[] = [];
  private onGameEnd?: () => void;

  // GIF URLs
  private static readonly STARTING_PLAYER_GIF = 'https://c.tenor.com/sjaTtq5lHVwAAAAd/tenor.gif';
  private static readonly BARREL_SPIN_GIF = 'https://c.tenor.com/fklGVnlUSFQAAAAd/tenor.gif';
  private static readonly EMPTY_CHAMBER_GIF = 'https://i.gifer.com/9mOY.gif';
  private static readonly PLAYER1_DOMAIN_GIF = 'https://c.tenor.com/CL7dHXumGO0AAAAd/tenor.gif';
  private static readonly PLAYER2_DOMAIN_GIF = 'https://c.tenor.com/MuMLDWrW95gAAAAd/tenor.gif';
  private static readonly DOMAIN_CLASH_GIF = 'https://c.tenor.com/PmZEeNe8yW4AAAAd/tenor.gif';
  private static readonly PLAYER1_WIN1_GIF = 'https://c.tenor.com/MXakTMh3R60AAAAd/tenor.gif';
  private static readonly PLAYER1_WIN2_GIF = 'https://c.tenor.com/9vwFSUvDtZYAAAAd/tenor.gif';
  private static readonly PLAYER2_WIN1_GIF = 'https://giffiles.alphacoders.com/221/221258.gif';
  private static readonly PLAYER2_WIN2_GIF = 'https://c.tenor.com/w9KNAlv2r-QAAAAd/tenor.gif';
  private static readonly PLAYER1_VICTORY_GIF = 'https://i.makeagif.com/media/7-10-2024/CF6r3J.gif';
  private static readonly PLAYER2_VICTORY_GIF = 'https://i.makeagif.com/media/6-13-2024/H0Ms0d.gif';
  private static readonly PLAYER1_RESULT_GIF = 'https://c.tenor.com/y7o0YMi5jVgAAAAd/tenor.gif';
  private static readonly PLAYER2_RESULT_GIF = 'https://i.makeagif.com/media/1-10-2024/ZRQyBG.gif';

  constructor(
    channelId: string,
    guildId: string | undefined,
    player1: RouletteMaxPlayer,
    player2: RouletteMaxPlayer,
    onGameEnd?: () => void
  ) {
    this.state = {
      channelId,
      guildId,
      player1,
      player2,
      isGameOver: false,
      currentPhase: RouletteMaxPhase.STARTING,
      startingPlayer: 1,
      player1SecretMoveActivated: false,
      player2SecretMoveActivated: false,
      player1Score: 0,
      player2Score: 0,
      currentRound: 1,
      roundInSet: 1,
      roundDecided: false,
    };
    this.onGameEnd = onGameEnd;
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
    this.state.currentPhase = RouletteMaxPhase.STARTING_PLAYER_SELECTION;

    const embed = new EmbedBuilder()
      .setTitle('🔫 ROULETTE MAX')
      .setDescription('🎲 Choosing the first player...\n\nThe chamber is ready.')
      .setColor(0xFFD700)
      .setImage(RouletteMaxGame.STARTING_PLAYER_GIF);

    await this.currentMessage?.edit({
      content: null,
      embeds: [embed],
      components: [],
    });

    // Wait for GIF to play (9 seconds)
    await this.delay(9000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Randomly select starting player
    this.state.startingPlayer = Math.random() < 0.5 ? 1 : 2;

    // Reveal first player
    await this.revealFirstPlayer();
  }

  /**
   * Reveal the first player
   */
  private async revealFirstPlayer(): Promise<void> {
    const firstPlayer = this.state.startingPlayer === 1 ? this.state.player1 : this.state.player2;
    
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

    // Start the first shot with the selected player
    await this.startNormalShot1();
  }

  /**
   * Start Player 1's first normal shot
   */
  private async startNormalShot1(): Promise<void> {
    // If starting player is 2, start with player 2 instead
    if (this.state.startingPlayer === 2) {
      this.state.currentPhase = RouletteMaxPhase.NORMAL_PLAYER2_SHOT1;
      await this.showBarrelSpin(this.state.player2);
    } else {
      this.state.currentPhase = RouletteMaxPhase.NORMAL_PLAYER1_SHOT1;
      await this.showBarrelSpin(this.state.player1);
    }
  }

  /**
   * Show barrel spin GIF
   */
  private async showBarrelSpin(player: RouletteMaxPlayer): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🔫 RUSSIAN ROULETTE')
      .setDescription(`🎯 <@${player.id}>\n\nThe barrel spins...`)
      .setColor(0xFFD700)
      .setImage(RouletteMaxGame.BARREL_SPIN_GIF);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [],
    });

    // Wait for GIF to play (4 seconds)
    await this.delay(4000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Show trigger state
    await this.showTriggerState(player);
  }

  /**
   * Show trigger state with button
   */
  private async showTriggerState(player: RouletteMaxPlayer): Promise<void> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    // Only pull trigger button - NO double turn button
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('roulettemax_trigger')
        .setLabel('🔫 PULL TRIGGER')
        .setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setTitle('🔫 RUSSIAN ROULETTE')
      .setDescription(
        `🎯 <@${player.id}>\n\nThe barrel has stopped.\n\n<@${player.id}>, pull the trigger.`
      )
      .setColor(0xFFD700)
      .setThumbnail(player.avatar);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [row],
    });

    // Start 10-second timeout
    this.state.roundStartTime = Date.now();
    const timeout = setTimeout(() => {
      if (!this.state.isGameOver && this.state.roundStartTime) {
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

    const currentPlayer = this.getCurrentPlayer();
    
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
    const customId = interaction.customId;

    // Handle trigger button
    if (customId === 'roulettemax_trigger') {
      const currentPlayer = this.getCurrentPlayer();
      
      // Only current player can interact
      if (userId !== currentPlayer.id) {
        await interaction.reply({
          content: "This isn't your turn.",
          ephemeral: true,
        });
        return;
      }

      // Clear timeout
      this.clearTimers();
      
      await interaction.update({
        components: [],
      });

      await this.pullTrigger();
    }
    
    // Handle secret move buttons
    else if (customId === 'roulettemax_secret_p1') {
      if (userId !== this.state.player1.id) {
        await interaction.reply({
          content: "This isn't your button.",
          ephemeral: true,
        });
        return;
      }

      if (this.state.player1SecretMoveActivated) {
        await interaction.reply({
          content: "You've already activated your Secret Move.",
          ephemeral: true,
        });
        return;
      }

      this.state.player1SecretMoveActivated = true;
      await interaction.update({
        components: this.getSecretMoveButtons(),
      });

      // Check if both players have activated
      if (this.state.player1SecretMoveActivated && this.state.player2SecretMoveActivated) {
        await this.startPlayer1Domain();
      }
    }
    else if (customId === 'roulettemax_secret_p2') {
      if (userId !== this.state.player2.id) {
        await interaction.reply({
          content: "This isn't your button.",
          ephemeral: true,
        });
        return;
      }

      if (this.state.player2SecretMoveActivated) {
        await interaction.reply({
          content: "You've already activated your Secret Move.",
          ephemeral: true,
        });
        return;
      }

      this.state.player2SecretMoveActivated = true;
      await interaction.update({
        components: this.getSecretMoveButtons(),
      });

      // Check if both players have activated
      if (this.state.player1SecretMoveActivated && this.state.player2SecretMoveActivated) {
        await this.startPlayer1Domain();
      }
    }
    
    // Handle attack buttons
    else if (customId === 'roulettemax_attack_p1') {
      if (userId !== this.state.player1.id) {
        await interaction.reply({
          content: "This isn't your button.",
          ephemeral: true,
        });
        return;
      }

      await interaction.update({
        components: [],
      });

      await this.handleAttack(1);
    }
    else if (customId === 'roulettemax_attack_p2') {
      if (userId !== this.state.player2.id) {
        await interaction.reply({
          content: "This isn't your button.",
          ephemeral: true,
        });
        return;
      }

      await interaction.update({
        components: [],
      });

      await this.handleAttack(2);
    }
  }

  /**
   * Pull the trigger (always empty in scripted phase)
   */
  private async pullTrigger(): Promise<void> {
    const currentPlayer = this.getCurrentPlayer();
    
    // Suspense before revealing result
    await this.delay(1500);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Always show empty result in scripted phase
    await this.showEmptyResult(currentPlayer);
  }

  /**
   * Show empty chamber result
   */
  private async showEmptyResult(player: RouletteMaxPlayer): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🔫 RUSSIAN ROULETTE')
      .setDescription(
        `😮 CLICK...\n\n<@${player.id}> survived.\n\nThe chamber was empty.`
      )
      .setColor(0x00FF00)
      .setImage(RouletteMaxGame.EMPTY_CHAMBER_GIF);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [],
    });

    // Wait for GIF to play (4 seconds)
    await this.delay(4000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Transition to next phase based on current state
    await this.transitionToNextPhase();
  }

  /**
   * Transition to next phase based on current state
   */
  private async transitionToNextPhase(): Promise<void> {
    switch (this.state.currentPhase) {
      case RouletteMaxPhase.NORMAL_PLAYER1_SHOT1:
        // After player 1's first shot, go to player 2's first shot
        this.state.currentPhase = RouletteMaxPhase.NORMAL_PLAYER2_SHOT1;
        await this.showBarrelSpin(this.state.player2);
        break;
      case RouletteMaxPhase.NORMAL_PLAYER2_SHOT1:
        // After player 2's first shot, go to player 1's second shot
        this.state.currentPhase = RouletteMaxPhase.NORMAL_PLAYER1_SHOT2;
        await this.showBarrelSpin(this.state.player1);
        break;
      case RouletteMaxPhase.NORMAL_PLAYER1_SHOT2:
        // After player 1's second shot, go to player 2's second shot
        this.state.currentPhase = RouletteMaxPhase.NORMAL_PLAYER2_SHOT2;
        await this.showBarrelSpin(this.state.player2);
        break;
      case RouletteMaxPhase.NORMAL_PLAYER2_SHOT2:
        // Scripted phase complete, move to Secret Move
        await this.showSecretMovePhase();
        break;
      default:
        console.error(`[RouletteMax] Invalid phase transition from ${this.state.currentPhase}`);
    }
  }

  /**
   * Show Secret Move phase
   */
  private async showSecretMovePhase(): Promise<void> {
    this.state.currentPhase = RouletteMaxPhase.SECRET_MOVE_WAITING;
    this.state.player1SecretMoveActivated = false;
    this.state.player2SecretMoveActivated = false;

    const embed = new EmbedBuilder()
      .setTitle('⚔️ ROULETTE MAX')
      .setDescription(
        `<@${this.state.player1.id}>\n      VS\n<@${this.state.player2.id}>\n\n` +
        `The revolver has gone silent.\n\n` +
        `But this game isn't over.\n\n` +
        `One final battle will decide who walks away.`
      )
      .setColor(0xFFD700);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: this.getSecretMoveButtons(),
    });
  }

  /**
   * Get Secret Move buttons
   */
  private getSecretMoveButtons(): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('roulettemax_secret_p1')
        .setLabel(`SECRET TECHNIQUE? (${this.state.player1.name})`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(this.state.player1SecretMoveActivated)
    );

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('roulettemax_secret_p2')
        .setLabel(`SECRET TECHNIQUE? (${this.state.player2.name})`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(this.state.player2SecretMoveActivated)
    );

    return [row];
  }

  /**
   * Start Player 1 Domain
   */
  private async startPlayer1Domain(): Promise<void> {
    this.state.currentPhase = RouletteMaxPhase.PLAYER1_DOMAIN;

    const embed = new EmbedBuilder()
      .setTitle('🌌 DOMAIN EXPANSION')
      .setDescription(
        `<@${this.state.player1.id}> opens their domain...\n\n` +
        `The atmosphere changes.`
      )
      .setColor(0x9B59B6)
      .setImage(RouletteMaxGame.PLAYER1_DOMAIN_GIF);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: this.getDisabledAttackButtons(),
    });

    // Wait for GIF to play (15 seconds)
    await this.delay(15000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Move to Player 2 Domain
    await this.startPlayer2Domain();
  }

  /**
   * Start Player 2 Domain
   */
  private async startPlayer2Domain(): Promise<void> {
    this.state.currentPhase = RouletteMaxPhase.PLAYER2_DOMAIN;

    const embed = new EmbedBuilder()
      .setTitle('🌌 DOMAIN EXPANSION')
      .setDescription(
        `<@${this.state.player2.id}> opens their domain...\n\n` +
        `The two domains collide.`
      )
      .setColor(0x9B59B6)
      .setImage(RouletteMaxGame.PLAYER2_DOMAIN_GIF);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: this.getDisabledAttackButtons(),
    });

    // Wait for GIF to play (8 seconds)
    await this.delay(8000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Move to Domain Clash
    await this.startDomainClash();
  }

  /**
   * Start Domain Clash
   */
  private async startDomainClash(): Promise<void> {
    this.state.currentPhase = RouletteMaxPhase.DOMAIN_CLASH;

    const embed = new EmbedBuilder()
      .setTitle('⚔️ DOMAIN CLASH')
      .setDescription(
        `<@${this.state.player1.id}> VS <@${this.state.player2.id}>\n\n` +
        `Neither domain is giving way.`
      )
      .setColor(0xFF4500)
      .setImage(RouletteMaxGame.DOMAIN_CLASH_GIF);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: this.getDisabledAttackButtons(),
    });

    // Wait for GIF to play (9 seconds)
    await this.delay(9000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Start attack rounds
    await this.startAttackRound();
  }

  /**
   * Start attack round
   */
  private async startAttackRound(): Promise<void> {
    this.state.currentPhase = RouletteMaxPhase.ATTACK_ROUND;
    this.state.roundStartTime = Date.now();
    this.state.roundDecided = false;

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ DOMAIN BATTLE — ROUND ${this.state.currentRound}`)
      .setDescription(
        `The domains collide.\n\n` +
        `ATTACK!\n\n` +
        `Score:\n<@${this.state.player1.id}>: ${this.state.player1Score}\n<@${this.state.player2.id}>: ${this.state.player2Score}`
      )
      .setColor(0xFF4500);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: this.getAttackButtons(),
    });

    // Set timeout to auto-end if no one clicks (30 seconds)
    const timeout = setTimeout(() => {
      if (!this.state.isGameOver) {
        this.handleAttackTimeout();
      }
    }, 30000);

    this.timers.push(timeout);
  }

  /**
   * Get attack buttons
   */
  private getAttackButtons(): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('roulettemax_attack_p1')
        .setLabel(`⚔️ ATTACK (${this.state.player1.name})`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(false)
    );

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('roulettemax_attack_p2')
        .setLabel(`⚔️ ATTACK (${this.state.player2.name})`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(false)
    );

    return [row];
  }

  /**
   * Get disabled attack buttons
   */
  private getDisabledAttackButtons(): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('roulettemax_attack_p1')
        .setLabel(`⚔️ ATTACK (${this.state.player1.name})`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true)
    );

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('roulettemax_attack_p2')
        .setLabel(`⚔️ ATTACK (${this.state.player2.name})`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

    return [row];
  }

  /**
   * Handle attack
   */
  private async handleAttack(playerNum: number): Promise<void> {
    if (this.state.currentPhase !== RouletteMaxPhase.ATTACK_ROUND) {
      return;
    }

    // Check if round already decided
    if (this.state.roundDecided) {
      return;
    }

    // Mark round as decided
    this.state.roundDecided = true;

    // Clear timeout
    this.clearTimers();

    const reactionTime = Date.now() - (this.state.roundStartTime || Date.now());
    const winner = playerNum === 1 ? this.state.player1 : this.state.player2;
    const loser = playerNum === 1 ? this.state.player2 : this.state.player1;

    // Update score
    if (playerNum === 1) {
      this.state.player1Score++;
    } else {
      this.state.player2Score++;
    }

    // Show round result
    await this.showRoundResult(winner, loser, playerNum);
  }

  /**
   * Handle attack timeout
   */
  private async handleAttackTimeout(): Promise<void> {
    if (this.state.isGameOver) return;

    this.state.currentPhase = RouletteMaxPhase.ROUND_RESULT;

    const embed = new EmbedBuilder()
      .setTitle('⏰ TIMEOUT')
      .setDescription('Neither fighter attacked in time.\n\nThe round is a draw.')
      .setColor(0x808080);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [],
    });

    await this.delay(2000);

    // Restart the same round
    await this.startAttackRound();
  }

  /**
   * Show round result
   */
  private async showRoundResult(winner: RouletteMaxPlayer, loser: RouletteMaxPlayer, winnerNum: number): Promise<void> {
    this.state.currentPhase = RouletteMaxPhase.ROUND_RESULT;

    // Determine which GIF to use based on winner and their current win count
    const winnerScore = winnerNum === 1 ? this.state.player1Score : this.state.player2Score;
    let gifUrl: string;
    let gifDuration: number;

    if (winnerNum === 1) {
      if (winnerScore === 1) {
        gifUrl = RouletteMaxGame.PLAYER1_WIN1_GIF;
        gifDuration = 3000;
      } else {
        gifUrl = RouletteMaxGame.PLAYER1_WIN2_GIF;
        gifDuration = 5000;
      }
    } else {
      if (winnerScore === 1) {
        gifUrl = RouletteMaxGame.PLAYER2_WIN1_GIF;
        gifDuration = 6000;
      } else {
        gifUrl = RouletteMaxGame.PLAYER2_WIN2_GIF;
        gifDuration = 5000;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🔥 ATTACK SUCCESSFUL')
      .setDescription(
        `<@${winner.id}> strikes first!\n\n` +
        `Score:\n<@${this.state.player1.id}>: ${this.state.player1Score}\n<@${this.state.player2.id}>: ${this.state.player2Score}`
      )
      .setColor(0xFF4500)
      .setImage(gifUrl);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: this.getDisabledAttackButtons(),
    });

    // Wait for GIF to play
    await this.delay(gifDuration);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Check for victory condition
    if (this.state.player1Score >= 3 || this.state.player2Score >= 3) {
      await this.showVictory();
    } else {
      // Check if we've completed 4 rounds in this set
      if (this.state.roundInSet >= 4) {
        // Tie at 2-2, start tiebreaker
        await this.startTiebreaker();
      } else {
        // Continue to next round
        this.state.currentRound++;
        this.state.roundInSet++;
        await this.startAttackRound();
      }
    }
  }

  /**
   * Start tiebreaker
   */
  private async startTiebreaker(): Promise<void> {
    this.state.currentPhase = RouletteMaxPhase.TIEBREAKER;
    this.state.roundInSet = 1; // Reset for new set

    const embed = new EmbedBuilder()
      .setTitle('⚔️ DOMAIN CLASH — TIEBREAKER')
      .setDescription(
        `Neither fighter will yield.\n\n` +
        `Score:\n<@${this.state.player1.id}>: ${this.state.player1Score}\n<@${this.state.player2.id}>: ${this.state.player2Score}`
      )
      .setColor(0xFF4500);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: this.getDisabledAttackButtons(),
    });

    await this.delay(2000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Start new attack round
    await this.startAttackRound();
  }

  /**
   * Show victory
   */
  private async showVictory(): Promise<void> {
    this.state.currentPhase = RouletteMaxPhase.VICTORY;

    const winner = this.state.player1Score >= 3 ? this.state.player1 : this.state.player2;
    const loser = this.state.player1Score >= 3 ? this.state.player2 : this.state.player1;
    const victoryGif = this.state.player1Score >= 3 ? RouletteMaxGame.PLAYER1_VICTORY_GIF : RouletteMaxGame.PLAYER2_VICTORY_GIF;

    this.state.winner = winner.id;

    const embed = new EmbedBuilder()
      .setTitle('👑 DOMAIN VICTORY')
      .setDescription(
        `<@${winner.id}> has overwhelmed <@${loser.id}>.\n\n` +
        `The battle is decided.`
      )
      .setColor(0xFFD700)
      .setImage(victoryGif);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [],
    });

    // Wait for GIF to play (5 seconds)
    await this.delay(5000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Show final result
    await this.showFinalResult();
  }

  /**
   * Show final result
   */
  private async showFinalResult(): Promise<void> {
    this.state.currentPhase = RouletteMaxPhase.FINISHED;
    this.state.isGameOver = true;
    this.clearTimers();

    const winner = this.state.player1Score >= 3 ? this.state.player1 : this.state.player2;
    const loser = this.state.player1Score >= 3 ? this.state.player2 : this.state.player1;
    const resultGif = this.state.player1Score >= 3 ? RouletteMaxGame.PLAYER1_RESULT_GIF : RouletteMaxGame.PLAYER2_RESULT_GIF;

    const embed = new EmbedBuilder()
      .setTitle('🏆 ROULETTE MAX — VICTORY')
      .setDescription(
        `<@${this.state.player1.id}> VS <@${this.state.player2.id}>\n\n` +
        `👑 WINNER\n<@${winner.id}>\n\n` +
        `⚔️ DOMAIN BATTLE\n` +
        `Score:\n<@${this.state.player1.id}>: ${this.state.player1Score}\n<@${this.state.player2.id}>: ${this.state.player2Score}\n\n` +
        `"The roulette was only the beginning."`
      )
      .setColor(0xFFD700)
      .setImage(resultGif);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [],
    });

    // Call cleanup callback to remove game from active games
    if (this.onGameEnd) {
      this.onGameEnd();
    }
  }

  /**
   * Get current player based on phase
   */
  private getCurrentPlayer(): RouletteMaxPlayer {
    switch (this.state.currentPhase) {
      case RouletteMaxPhase.NORMAL_PLAYER1_SHOT1:
      case RouletteMaxPhase.NORMAL_PLAYER1_SHOT2:
        return this.state.player1;
      case RouletteMaxPhase.NORMAL_PLAYER2_SHOT1:
      case RouletteMaxPhase.NORMAL_PLAYER2_SHOT2:
        return this.state.player2;
      case RouletteMaxPhase.STARTING_PLAYER_SELECTION:
        // This phase doesn't have a current player yet
        return this.state.player1; // Default fallback
      default:
        throw new Error(`Cannot determine current player for phase ${this.state.currentPhase}`);
    }
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
  getState(): RouletteMaxState {
    return { ...this.state };
  }

  /**
   * Check if game is over
   */
  isFinished(): boolean {
    return this.state.isGameOver;
  }
}
