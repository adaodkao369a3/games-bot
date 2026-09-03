import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction, EmbedBuilder, TextChannel } from 'discord.js';
import { awardGameReward } from '../utils/game-rewards.js';

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
  player3?: RouletteMaxPlayer; // Optional for 3-player mode
  isGameOver: boolean;
  winner?: string;
  messageId?: string;
  currentPhase: RouletteMaxPhase;
  startingPlayer: number; // 1, 2, or 3
  playerCount: number; // 2 or 3
  player1SecretMoveActivated: boolean;
  player2SecretMoveActivated: boolean;
  player3SecretMoveActivated?: boolean; // Optional for 3-player mode
  player1Score: number;
  player2Score: number;
  player3Score?: number; // Optional for 3-player mode
  currentRound: number;
  roundInSet: number;
  roundStartTime?: number;
  roundDecided: boolean;
  gameInstanceId: string;
}

export enum RouletteMaxPhase {
  STARTING = 'STARTING',
  STARTING_PLAYER_SELECTION = 'STARTING_PLAYER_SELECTION',
  NORMAL_PLAYER1_SHOT1 = 'NORMAL_PLAYER1_SHOT1',
  NORMAL_PLAYER2_SHOT1 = 'NORMAL_PLAYER2_SHOT1',
  NORMAL_PLAYER3_SHOT1 = 'NORMAL_PLAYER3_SHOT1',
  NORMAL_PLAYER1_SHOT2 = 'NORMAL_PLAYER1_SHOT2',
  NORMAL_PLAYER2_SHOT2 = 'NORMAL_PLAYER2_SHOT2',
  NORMAL_PLAYER3_SHOT2 = 'NORMAL_PLAYER3_SHOT2',
  SECRET_MOVE_WAITING = 'SECRET_MOVE_WAITING',
  PLAYER1_DOMAIN = 'PLAYER1_DOMAIN',
  PLAYER2_DOMAIN = 'PLAYER2_DOMAIN',
  PLAYER3_DOMAIN = 'PLAYER3_DOMAIN',
  DOMAIN_CLASH = 'DOMAIN_CLASH',
  THREE_WAY_DOMAIN_CLASH = 'THREE_WAY_DOMAIN_CLASH',
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

  // 3-Player GIF URLs
  private static readonly THREE_WAY_DOMAIN_CLASH_GIF = 'https://c.tenor.com/VmXPg8_Z7bEAAAAd/tenor.gif';
  
  // Player 1 (Yuta) attack GIFs
  private static readonly PLAYER1_HIT1_GIF = 'https://64.media.tumblr.com/9aa93eb56c2017b2ff8f91a4822006b9/282df0d954912229-4b/s540x810/836a427a2f3ce9290fcd9d3eb1f416fe0840e6da.gif';
  private static readonly PLAYER1_HIT2_GIF = 'https://c.tenor.com/1j1_GFWlXn4AAAAd/tenor.gif';
  private static readonly PLAYER1_HIT3_GIF = 'https://c.tenor.com/VL_XybtZNeQAAAAC/tenor.gif';
  private static readonly PLAYER1_VICTORY_3P_GIF = 'https://media.tenor.com/OZBTwYULrNAAAAAM/yuta-yuta-okkotsu.gif';
  
  // Player 2 (Ryu) attack GIFs
  private static readonly PLAYER2_HIT1_GIF = 'https://c.tenor.com/jiwmE-ReojUAAAAd/tenor.gif';
  private static readonly PLAYER2_HIT2_GIF = 'https://c.tenor.com/6TgBQ86GGKAAAAAd/tenor.gif';
  private static readonly PLAYER2_HIT3_GIF = 'https://c.tenor.com/KfTQoMJB72gAAAAd/tenor.gif';
  private static readonly PLAYER2_VICTORY_3P_GIF = 'https://c.tenor.com/a3n2_w0wYo0AAAAC/tenor.gif';
  
  // Player 3 (Uro) attack GIFs
  private static readonly PLAYER3_HIT1_GIF = 'https://c.tenor.com/5-_Ja_jFujUAAAAC/tenor.gif';
  private static readonly PLAYER3_HIT2_GIF = 'https://c.tenor.com/UeF_vSMKsUYAAAAd/tenor.gif';
  private static readonly PLAYER3_HIT3_GIF = 'https://c.tenor.com/Zv9Z6Wo0VyYAAAAd/tenor.gif';
  private static readonly PLAYER3_VICTORY_3P_GIF = 'https://c.tenor.com/cckRZdARE0MAAAAC/tenor.gif';

  constructor(
    channelId: string,
    guildId: string | undefined,
    player1: RouletteMaxPlayer,
    player2: RouletteMaxPlayer,
    player3?: RouletteMaxPlayer,
    onGameEnd?: () => void
  ) {
    const playerCount = player3 ? 3 : 2;
    this.state = {
      channelId,
      guildId,
      player1,
      player2,
      player3,
      isGameOver: false,
      currentPhase: RouletteMaxPhase.STARTING,
      startingPlayer: 1,
      playerCount,
      player1SecretMoveActivated: false,
      player2SecretMoveActivated: false,
      player3SecretMoveActivated: false,
      player1Score: 0,
      player2Score: 0,
      player3Score: 0,
      currentRound: 1,
      roundInSet: 1,
      roundDecided: false,
      gameInstanceId: `roulettemax_${channelId}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
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
      .setTitle('<:gunpoint:1545149018160631868> ROULETTE MAX')
      .setDescription('<a:dice:1545149015652307104> Choosing the first player...\n\nThe chamber is ready.')
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

    // Randomly select starting player (1, 2, or 3 for 3-player mode)
    if (this.state.playerCount === 3) {
      this.state.startingPlayer = Math.floor(Math.random() * 3) + 1;
    } else {
      this.state.startingPlayer = Math.random() < 0.5 ? 1 : 2;
    }

    // Reveal first player
    await this.revealFirstPlayer();
  }

  /**
   * Reveal the first player
   */
  private async revealFirstPlayer(): Promise<void> {
    let firstPlayer: RouletteMaxPlayer;
    
    if (this.state.playerCount === 3) {
      if (this.state.startingPlayer === 2) {
        firstPlayer = this.state.player2;
      } else if (this.state.startingPlayer === 3) {
        firstPlayer = this.state.player3!;
      } else {
        firstPlayer = this.state.player1;
      }
    } else {
      firstPlayer = this.state.startingPlayer === 1 ? this.state.player1 : this.state.player2;
    }
    
    const embed = new EmbedBuilder()
      .setTitle('<a:cargando:1545149001983197364> FIRST TURN')
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
    // Handle 3-player mode starting player
    if (this.state.playerCount === 3) {
      if (this.state.startingPlayer === 2) {
        this.state.currentPhase = RouletteMaxPhase.NORMAL_PLAYER2_SHOT1;
        await this.showBarrelSpin(this.state.player2);
      } else if (this.state.startingPlayer === 3) {
        this.state.currentPhase = RouletteMaxPhase.NORMAL_PLAYER3_SHOT1;
        await this.showBarrelSpin(this.state.player3!);
      } else {
        this.state.currentPhase = RouletteMaxPhase.NORMAL_PLAYER1_SHOT1;
        await this.showBarrelSpin(this.state.player1);
      }
    } else {
      // 2-player mode
      if (this.state.startingPlayer === 2) {
        this.state.currentPhase = RouletteMaxPhase.NORMAL_PLAYER2_SHOT1;
        await this.showBarrelSpin(this.state.player2);
      } else {
        this.state.currentPhase = RouletteMaxPhase.NORMAL_PLAYER1_SHOT1;
        await this.showBarrelSpin(this.state.player1);
      }
    }
  }

  /**
   * Show barrel spin GIF
   */
  private async showBarrelSpin(player: RouletteMaxPlayer): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('<:gunpoint:1545149018160631868> RUSSIAN ROULETTE')
      .setDescription(`<a:cargando:1545149001983197364> <@${player.id}>\n\nThe barrel spins...`)
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
        .setLabel('PULL TRIGGER')
        .setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setTitle('<:gunpoint:1545149018160631868> RUSSIAN ROULETTE')
      .setDescription(
        `<a:cargando:1545149001983197364> <@${player.id}>\n\nThe barrel has stopped.\n\n<@${player.id}>, pull the trigger.`
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
      .setTitle('<a:alarm1:1545148991782518844> TIMEOUT')
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

      // Check if all players have activated
      if (this.allSecretMovesActivated()) {
        // Clear the auto-selection timer since all players have activated
        this.clearTimers();
        await this.startDomainSequence();
      } else {
        // Restart the timer for remaining players
        this.clearTimers();
        const timeout = setTimeout(() => {
          if (!this.state.isGameOver && this.state.currentPhase === RouletteMaxPhase.SECRET_MOVE_WAITING) {
            this.handleSecretMoveTimeout();
          }
        }, 5000);
        this.timers.push(timeout);
        await this.updateSecretMoveWaitingStatus();
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

      // Check if all players have activated
      if (this.allSecretMovesActivated()) {
        // Clear the auto-selection timer since all players have activated
        this.clearTimers();
        await this.startDomainSequence();
      } else {
        // Restart the timer for remaining players
        this.clearTimers();
        const timeout = setTimeout(() => {
          if (!this.state.isGameOver && this.state.currentPhase === RouletteMaxPhase.SECRET_MOVE_WAITING) {
            this.handleSecretMoveTimeout();
          }
        }, 5000);
        this.timers.push(timeout);
        await this.updateSecretMoveWaitingStatus();
      }
    }
    else if (customId === 'roulettemax_secret_p3') {
      if (!this.state.player3 || userId !== this.state.player3.id) {
        await interaction.reply({
          content: "This isn't your button.",
          ephemeral: true,
        });
        return;
      }

      if (this.state.player3SecretMoveActivated) {
        await interaction.reply({
          content: "You've already activated your Secret Move.",
          ephemeral: true,
        });
        return;
      }

      this.state.player3SecretMoveActivated = true;
      
      await interaction.update({
        components: this.getSecretMoveButtons(),
      });

      // Check if all players have activated
      if (this.allSecretMovesActivated()) {
        // Clear the auto-selection timer since all players have activated
        this.clearTimers();
        await this.startDomainSequence();
      } else {
        // Restart the timer for remaining players
        this.clearTimers();
        const timeout = setTimeout(() => {
          if (!this.state.isGameOver && this.state.currentPhase === RouletteMaxPhase.SECRET_MOVE_WAITING) {
            this.handleSecretMoveTimeout();
          }
        }, 5000);
        this.timers.push(timeout);
        await this.updateSecretMoveWaitingStatus();
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
    else if (customId === 'roulettemax_attack_p3') {
      if (!this.state.player3 || userId !== this.state.player3.id) {
        await interaction.reply({
          content: "This isn't your button.",
          ephemeral: true,
        });
        return;
      }

      await interaction.update({
        components: [],
      });

      await this.handleAttack(3);
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
      .setTitle('<:gunpoint:1545149018160631868> RUSSIAN ROULETTE')
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
    // Handle 3-player mode transitions
    if (this.state.playerCount === 3) {
      switch (this.state.currentPhase) {
        case RouletteMaxPhase.NORMAL_PLAYER1_SHOT1:
          this.state.currentPhase = RouletteMaxPhase.NORMAL_PLAYER2_SHOT1;
          await this.showBarrelSpin(this.state.player2);
          break;
        case RouletteMaxPhase.NORMAL_PLAYER2_SHOT1:
          this.state.currentPhase = RouletteMaxPhase.NORMAL_PLAYER3_SHOT1;
          await this.showBarrelSpin(this.state.player3!);
          break;
        case RouletteMaxPhase.NORMAL_PLAYER3_SHOT1:
          // Scripted phase complete, move to Secret Move (only one turn per player)
          await this.showSecretMovePhase();
          break;
        default:
          console.error(`[RouletteMax] Invalid phase transition from ${this.state.currentPhase}`);
      }
    } else {
      // Handle 2-player mode transitions (only one turn per player)
      switch (this.state.currentPhase) {
        case RouletteMaxPhase.NORMAL_PLAYER1_SHOT1:
          this.state.currentPhase = RouletteMaxPhase.NORMAL_PLAYER2_SHOT1;
          await this.showBarrelSpin(this.state.player2);
          break;
        case RouletteMaxPhase.NORMAL_PLAYER2_SHOT1:
          // Scripted phase complete, move to Secret Move (only one turn per player)
          await this.showSecretMovePhase();
          break;
        default:
          console.error(`[RouletteMax] Invalid phase transition from ${this.state.currentPhase}`);
      }
    }
  }

  /**
   * Show Secret Move phase
   */
  private async showSecretMovePhase(): Promise<void> {
    this.state.currentPhase = RouletteMaxPhase.SECRET_MOVE_WAITING;
    this.state.player1SecretMoveActivated = false;
    this.state.player2SecretMoveActivated = false;
    this.state.player3SecretMoveActivated = false;

    let description: string;
    if (this.state.playerCount === 3) {
      description = 
        `<@${this.state.player1.id}>\n      VS\n<@${this.state.player2.id}>\n      VS\n<@${this.state.player3!.id}>\n\n` +
        `The revolver has gone silent.\n\n` +
        `But this game isn't over.\n\n` +
        `Three sorcerers remain.\n\n` +
        `One final battle will decide who walks away.`;
    } else {
      description = 
        `<@${this.state.player1.id}>\n      VS\n<@${this.state.player2.id}>\n\n` +
        `The revolver has gone silent.\n\n` +
        `But this game isn't over.\n\n` +
        `One final battle will decide who walks away.`;
    }

    const embed = new EmbedBuilder()
      .setTitle('⚔️ ROULETTE MAX')
      .setDescription(description)
      .setColor(0xFFD700);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: this.getSecretMoveButtons(),
    });

    // Start 5-second auto-selection timer
    const timeout = setTimeout(() => {
      if (!this.state.isGameOver && this.state.currentPhase === RouletteMaxPhase.SECRET_MOVE_WAITING) {
        this.handleSecretMoveTimeout();
      }
    }, 5000);

    this.timers.push(timeout);
  }

  /**
   * Handle Secret Move timeout - auto-activate for players who haven't clicked
   */
  private async handleSecretMoveTimeout(): Promise<void> {
    if (this.state.isGameOver) return;

    // Auto-activate for any players who haven't clicked yet
    if (!this.state.player1SecretMoveActivated) {
      this.state.player1SecretMoveActivated = true;
    }
    if (!this.state.player2SecretMoveActivated) {
      this.state.player2SecretMoveActivated = true;
    }
    if (this.state.playerCount === 3 && !this.state.player3SecretMoveActivated) {
      this.state.player3SecretMoveActivated = true;
    }

    // Update the display to show all techniques activated
    await this.currentMessage?.edit({
      components: this.getSecretMoveButtons(),
    });

    // Immediately proceed to domain sequence
    await this.startDomainSequence();
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

    if (this.state.playerCount === 3 && this.state.player3) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('roulettemax_secret_p3')
          .setLabel(`SECRET TECHNIQUE? (${this.state.player3.name})`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(this.state.player3SecretMoveActivated!)
      );
    }

    return [row];
  }

  /**
   * Check if all secret moves have been activated
   */
  private allSecretMovesActivated(): boolean {
    if (this.state.playerCount === 3) {
      return this.state.player1SecretMoveActivated && 
             this.state.player2SecretMoveActivated && 
             this.state.player3SecretMoveActivated!;
    } else {
      return this.state.player1SecretMoveActivated && this.state.player2SecretMoveActivated;
    }
  }

  /**
   * Update secret move waiting status with dramatic dialogue
   */
  private async updateSecretMoveWaitingStatus(): Promise<void> {
    let description = '⚠️ THE AIR HAS CHANGED...\n\n';
    
    if (this.state.player1SecretMoveActivated) {
      description += `<@${this.state.player1.id}> has prepared their technique.\n`;
    }
    if (this.state.player2SecretMoveActivated) {
      description += `<@${this.state.player2.id}> has prepared their technique.\n`;
    }
    if (this.state.playerCount === 3 && this.state.player3SecretMoveActivated) {
      description += `<@${this.state.player3!.id}> has prepared their technique.\n`;
    }

    // Show who hasn't activated yet
    const notActivated: string[] = [];
    if (!this.state.player1SecretMoveActivated) notActivated.push(`<@${this.state.player1.id}>`);
    if (!this.state.player2SecretMoveActivated) notActivated.push(`<@${this.state.player2.id}>`);
    if (this.state.playerCount === 3 && !this.state.player3SecretMoveActivated) notActivated.push(`<@${this.state.player3!.id}>`);

    if (notActivated.length > 0) {
      description += `\n${notActivated.join(', ')} ${notActivated.length === 1 ? 'has' : 'have'} not yet revealed ${notActivated.length === 1 ? 'their' : 'their'} technique...\n\n`;
      description += 'The domain clash cannot begin until all are ready.';
    }

    const embed = new EmbedBuilder()
      .setTitle('⚔️ ROULETTE MAX')
      .setDescription(description)
      .setColor(0xFFA500);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: this.getSecretMoveButtons(),
    });
  }

  /**
   * Start domain sequence based on player count
   */
  private async startDomainSequence(): Promise<void> {
    if (this.state.playerCount === 3) {
      await this.startThreeWayDomainClash();
    } else {
      await this.startPlayer1Domain();
    }
  }

  /**
   * Start Player 1 Domain (2-player mode)
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
   * Start Player 2 Domain (2-player mode)
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
   * Start 3-Way Domain Clash (3-player mode)
   */
  private async startThreeWayDomainClash(): Promise<void> {
    this.state.currentPhase = RouletteMaxPhase.THREE_WAY_DOMAIN_CLASH;

    const embed = new EmbedBuilder()
      .setTitle('⚠️ DOMAIN EXPANSION')
      .setDescription(
        `THREE DOMAINS COLLIDE.\n\n` +
        `The barrier is tearing apart.\n\n` +
        `Three sorcerers.\nOne battlefield.\n\n` +
        `There is nowhere left to run.\n\n` +
        `THE CLASH BEGINS.`
      )
      .setColor(0xFF4500)
      .setImage(RouletteMaxGame.THREE_WAY_DOMAIN_CLASH_GIF);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [],
    });

    // Wait for GIF to play (11 seconds exactly)
    await this.delay(11000);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Start attack rounds
    await this.startAttackRound();
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

    let description: string;
    if (this.state.playerCount === 3) {
      description = 
        `⚠️ THE DOMAIN IS UNSTABLE.\n\n` +
        `Nobody moves.\n\n` +
        `Then—\n\n` +
        `ATTACK.\n\n` +
        `Score:\n<@${this.state.player1.id}>: ${this.state.player1Score} ⚔️\n<@${this.state.player2.id}>: ${this.state.player2Score} ⚔️\n<@${this.state.player3!.id}>: ${this.state.player3Score} ⚔️`;
    } else {
      description = 
        `The domains collide.\n\n` +
        `ATTACK!\n\n` +
        `Score:\n<@${this.state.player1.id}>: ${this.state.player1Score}\n<@${this.state.player2.id}>: ${this.state.player2Score}`;
    }

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ DOMAIN BATTLE — ROUND ${this.state.currentRound}`)
      .setDescription(description)
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

    if (this.state.playerCount === 3 && this.state.player3) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('roulettemax_attack_p3')
          .setLabel(`⚔️ ATTACK (${this.state.player3.name})`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(false)
      );
    }

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

    if (this.state.playerCount === 3 && this.state.player3) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('roulettemax_attack_p3')
          .setLabel(`⚔️ ATTACK (${this.state.player3.name})`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      );
    }

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
    
    // Get winner based on player number
    let winner: RouletteMaxPlayer;
    let loser1: RouletteMaxPlayer;
    let loser2: RouletteMaxPlayer | undefined;
    
    if (playerNum === 1) {
      winner = this.state.player1;
      loser1 = this.state.player2;
      loser2 = this.state.player3;
      this.state.player1Score++;
    } else if (playerNum === 2) {
      winner = this.state.player2;
      loser1 = this.state.player1;
      loser2 = this.state.player3;
      this.state.player2Score++;
    } else {
      winner = this.state.player3!;
      loser1 = this.state.player1;
      loser2 = this.state.player2;
      this.state.player3Score!++;
    }

    // Show round result
    await this.showRoundResult(winner, loser1, loser2, playerNum);
  }

  /**
   * Handle attack timeout
   */
  private async handleAttackTimeout(): Promise<void> {
    if (this.state.isGameOver) return;

    this.state.currentPhase = RouletteMaxPhase.ROUND_RESULT;

    const embed = new EmbedBuilder()
      .setTitle('<a:alarm1:1545148991782518844> TIMEOUT')
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
  private async showRoundResult(winner: RouletteMaxPlayer, loser1: RouletteMaxPlayer, loser2: RouletteMaxPlayer | undefined, winnerNum: number): Promise<void> {
    this.state.currentPhase = RouletteMaxPhase.ROUND_RESULT;

    // Determine which GIF to use based on winner and their current win count
    let gifUrl: string;
    let gifDuration: number;
    let description: string;

    if (this.state.playerCount === 3) {
      // 3-player mode with specific GIFs
      const winnerScore = winnerNum === 1 ? this.state.player1Score : (winnerNum === 2 ? this.state.player2Score : this.state.player3Score);
      
      if (winnerNum === 1) {
        // Player 1 (Yuta) attack GIFs
        if (winnerScore === 1) {
          gifUrl = RouletteMaxGame.PLAYER1_HIT1_GIF;
          gifDuration = 2900;
          description = `⚔️ YUTA STRIKES!\n\n<@${winner.id}> lands the first hit!\n\nThe clash has begun.`;
        } else if (winnerScore === 2) {
          gifUrl = RouletteMaxGame.PLAYER1_HIT2_GIF;
          gifDuration = 5000;
          description = `⚔️ SECOND HIT!\n\n<@${winner.id}> is taking control.\n\nThe other domains are starting to collapse.`;
        } else {
          gifUrl = RouletteMaxGame.PLAYER1_HIT3_GIF;
          gifDuration = 3000;
          description = `⚔️ FINAL STRIKE!\n\n<@${winner.id}> delivers the decisive blow!\n\nThe battle is decided.`;
        }
      } else if (winnerNum === 2) {
        // Player 2 (Ryu) attack GIFs
        if (winnerScore === 1) {
          gifUrl = RouletteMaxGame.PLAYER2_HIT1_GIF;
          gifDuration = 7500;
          description = `<a:purplebomb:1545149042378407986> RYU STRIKES!\n\n<@${winner.id}> lands the first hit!\n\nThe battlefield shakes.`;
        } else if (winnerScore === 2) {
          gifUrl = RouletteMaxGame.PLAYER2_HIT2_GIF;
          gifDuration = 3000;
          description = `<a:purplebomb:1545149042378407986> SECOND HIT!\n\n<@${winner.id}> refuses to fall behind.\n\nOne more decisive strike could end this.`;
        } else {
          gifUrl = RouletteMaxGame.PLAYER2_HIT3_GIF;
          gifDuration = 9630;
          description = `<a:purplebomb:1545149042378407986> FINAL STRIKE!\n\n<@${winner.id}> delivers the decisive blow!\n\nThe battle is decided.`;
        }
      } else {
        // Player 3 (Uro) attack GIFs
        if (winnerScore === 1) {
          gifUrl = RouletteMaxGame.PLAYER3_HIT1_GIF;
          gifDuration = 3000;
          description = `🌪️ URO STRIKES!\n\n<@${winner.id}> lands the first hit!\n\nThe balance has shifted.`;
        } else if (winnerScore === 2) {
          gifUrl = RouletteMaxGame.PLAYER3_HIT2_GIF;
          gifDuration = 14000;
          description = `🌪️ SECOND HIT!\n\n<@${winner.id}> is now one strike away.\n\nThe domain is becoming unstable...`;
        } else {
          gifUrl = RouletteMaxGame.PLAYER3_HIT3_GIF;
          gifDuration = 14000;
          description = `🌪️ FINAL STRIKE!\n\n<@${winner.id}> delivers the decisive blow!\n\nThe battle is decided.`;
        }
      }
    } else {
      // 2-player mode (existing logic)
      const winnerScore = winnerNum === 1 ? this.state.player1Score : this.state.player2Score;
      
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
      description = `<@${winner.id}> strikes first!\n\n`;
    }

    // Add score display
    if (this.state.playerCount === 3) {
      description += `\nScore:\n<@${this.state.player1.id}>: ${this.state.player1Score} ⚔️\n<@${this.state.player2.id}>: ${this.state.player2Score} ⚔️\n<@${this.state.player3!.id}>: ${this.state.player3Score} ⚔️`;
    } else {
      description += `Score:\n<@${this.state.player1.id}>: ${this.state.player1Score}\n<@${this.state.player2.id}>: ${this.state.player2Score}`;
    }

    const embed = new EmbedBuilder()
      .setTitle('🔥 ATTACK SUCCESSFUL')
      .setDescription(description)
      .setColor(0xFF4500)
      .setImage(gifUrl);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: this.getDisabledAttackButtons(),
    });

    // Wait for GIF to play (exact duration)
    await this.delay(gifDuration);

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Check for victory condition (first to 3 wins)
    if (this.state.playerCount === 3) {
      if (this.state.player1Score >= 3 || this.state.player2Score >= 3 || this.state.player3Score! >= 3) {
        await this.showVictory();
      } else {
        // Continue to next round
        this.state.currentRound++;
        await this.startAttackRound();
      }
    } else {
      // 2-player mode logic
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

    let winner: RouletteMaxPlayer;
    let victoryGif: string;
    let description: string;

    if (this.state.playerCount === 3) {
      // 3-player mode
      if (this.state.player1Score >= 3) {
        winner = this.state.player1;
        victoryGif = RouletteMaxGame.PLAYER1_VICTORY_3P_GIF;
      } else if (this.state.player2Score >= 3) {
        winner = this.state.player2;
        victoryGif = RouletteMaxGame.PLAYER2_VICTORY_3P_GIF;
      } else {
        winner = this.state.player3!;
        victoryGif = RouletteMaxGame.PLAYER3_VICTORY_3P_GIF;
      }

      description = 
        `THE CLASH IS OVER.\n\n` +
        `<@${winner.id}> HAS WON THE DOMAIN BATTLE.\n\n` +
        `The other two domains have been crushed.`;
    } else {
      // 2-player mode
      winner = this.state.player1Score >= 3 ? this.state.player1 : this.state.player2;
      const loser = this.state.player1Score >= 3 ? this.state.player2 : this.state.player1;
      victoryGif = this.state.player1Score >= 3 ? RouletteMaxGame.PLAYER1_VICTORY_GIF : RouletteMaxGame.PLAYER2_VICTORY_GIF;

      description = 
        `<@${winner.id}> has overwhelmed <@${loser.id}>.\n\n` +
        `The battle is decided.`;
    }

    this.state.winner = winner.id;

    const embed = new EmbedBuilder()
      .setTitle('<:15394trophy:1545135066148118628> DOMAIN VICTORY')
      .setDescription(description)
      .setColor(0xFFD700)
      .setImage(victoryGif);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [],
    });

    // Check if game is still active
    if (this.state.isGameOver) return;

    // Show final result (no delay for victory GIFs)
    await this.showFinalResult();
  }

  /**
   * Show final result
   */
  private async showFinalResult(): Promise<void> {
    this.state.currentPhase = RouletteMaxPhase.FINISHED;
    this.state.isGameOver = true;
    this.clearTimers();

    let winner: RouletteMaxPlayer;
    let resultGif: string;
    let description: string;

    if (this.state.playerCount === 3) {
      // 3-player mode
      if (this.state.player1Score >= 3) {
        winner = this.state.player1;
        resultGif = RouletteMaxGame.PLAYER1_VICTORY_3P_GIF;
      } else if (this.state.player2Score >= 3) {
        winner = this.state.player2;
        resultGif = RouletteMaxGame.PLAYER2_VICTORY_3P_GIF;
      } else {
        winner = this.state.player3!;
        resultGif = RouletteMaxGame.PLAYER3_VICTORY_3P_GIF;
      }

      description = 
        `<:15394trophy:1545135066148118628>DOMAIN BATTLE — VICTORY\n\n` +
        `<@${winner.id}> HAS WON!\n\n` +
        `Final Score\n<@${this.state.player1.id}>  ${this.state.player1Score}\n<@${this.state.player2.id}>  ${this.state.player2Score}\n<@${this.state.player3!.id}>  ${this.state.player3Score}\n\n` +
        `The roulette was only the beginning.`;
    } else {
      // 2-player mode
      winner = this.state.player1Score >= 3 ? this.state.player1 : this.state.player2;
      resultGif = this.state.player1Score >= 3 ? RouletteMaxGame.PLAYER1_RESULT_GIF : RouletteMaxGame.PLAYER2_RESULT_GIF;

      description = 
        `<:15394trophy:1545135066148118628>ROULETTE MAX — VICTORY\n\n` +
        `<@${this.state.player1.id}> VS <@${this.state.player2.id}>\n\n` +
        `<:15394trophy:1545135066148118628> WINNER\n<@${winner.id}>\n\n` +
        `⚔️ DOMAIN BATTLE\n` +
        `Score:\n<@${this.state.player1.id}>: ${this.state.player1Score}\n<@${this.state.player2.id}>: ${this.state.player2Score}\n\n` +
        `"The roulette was only the beginning."`;
    }

    const embed = new EmbedBuilder()
      .setTitle('<:15394trophy:1545135066148118628>DOMAIN BATTLE — VICTORY')
      .setDescription(description)
      .setColor(0xFFD700)
      .setImage(resultGif);

    await this.currentMessage?.edit({
      embeds: [embed],
      components: [],
    });

    // Award Bombo Coins to the winner
    if (this.currentMessage?.channel) {
      await awardGameReward(winner.id, 1200, 'Roulette Max', this.currentMessage.channel as TextChannel, this.state.gameInstanceId);
    }

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
      case RouletteMaxPhase.NORMAL_PLAYER3_SHOT1:
      case RouletteMaxPhase.NORMAL_PLAYER3_SHOT2:
        return this.state.player3!;
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
