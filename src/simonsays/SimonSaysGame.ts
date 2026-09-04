import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel } from 'discord.js';

type SimonSaysState = 'idle' | 'lobby' | 'playing' | 'complete' | 'timeout';

type SimonSaysColor = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';

interface SimonSaysCommand {
  isSimonSays: boolean;
  action: 'PRESS' | 'DONT_PRESS' | 'SEQUENCE';
  colors: SimonSaysColor[];
  reactionTime: number;
}

interface Player {
  userId: string;
  username: string;
  lives: number;
  isEliminated: boolean;
  responded: boolean;
  response: SimonSaysColor[] | null;
}

interface SimonSaysGameData {
  channelId: string;
  guildId: string | undefined;
  hostId: string;
  players: Map<string, Player>;
  currentCommand: SimonSaysCommand | null;
  commandNumber: number;
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
  commandTimeout: NodeJS.Timeout | null;
}

// Game configuration
const GAME_CONFIG = {
  minPlayers: 2,
  maxPlayers: 20,
  initialLives: 3,
  // Timeout in milliseconds
  timeoutMs: 10 * 60 * 1000, // 10 minutes
  // Reaction times by phase (early, mid, late game)
  reactionTimes: {
    early: 5000,    // 5 seconds
    mid: 3000,      // 3 seconds
    late: 2000,     // 2 seconds
  },
  // Phase thresholds
  phaseThresholds: {
    early: 5,
    mid: 10,
  },
};

export class SimonSaysGame {
  private state: SimonSaysState = 'idle';
  private data: SimonSaysGameData;
  private gameTimeout: NodeJS.Timeout | null = null;

  constructor(channelId: string, guildId: string | undefined, hostId: string) {
    this.data = {
      channelId,
      guildId,
      hostId,
      players: new Map(),
      currentCommand: null,
      commandNumber: 0,
      messageId: null,
      message: null,
      gameInstanceId: `simonsays_${channelId}_${Date.now()}`,
      commandTimeout: null,
    };
  }

  /**
   * Start the simon says game lobby
   */
  async start(message: Message): Promise<void> {
    this.state = 'lobby';
    this.data.messageId = message.id;
    this.data.message = message;

    const embed = this.createLobbyEmbed();
    const row = this.createLobbyButtons();

    const sentMessage = await message.reply({
      embeds: [embed],
      components: [row],
    });

    this.data.messageId = sentMessage.id;
    this.data.message = sentMessage;

    // Set timeout
    this.gameTimeout = setTimeout(() => {
      this.timeoutGame(sentMessage);
    }, GAME_CONFIG.timeoutMs);
  }

  /**
   * Handle button interactions
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    const customId = interaction.customId;

    switch (customId) {
      case 'simonsays_join':
        await this.handleJoin(interaction);
        break;
      case 'simonsays_start':
        await this.handleStart(interaction);
        break;
      case 'simonsays_red':
      case 'simonsays_blue':
      case 'simonsays_green':
      case 'simonsays_yellow':
        await this.handleColorPress(interaction, customId.replace('simonsays_', '').toUpperCase() as SimonSaysColor);
        break;
      default:
        await interaction.reply({
          content: 'Unknown action.',
          ephemeral: true,
        });
    }
  }

  /**
   * Handle JOIN button
   */
  private async handleJoin(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'lobby') {
      await interaction.reply({
        content: 'Game has already started.',
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;
    const username = interaction.user.username;

    if (this.data.players.has(userId)) {
      await interaction.reply({
        content: 'You have already joined the game.',
        ephemeral: true,
      });
      return;
    }

    if (this.data.players.size >= GAME_CONFIG.maxPlayers) {
      await interaction.reply({
        content: 'Game is full.',
        ephemeral: true,
      });
      return;
    }

    this.data.players.set(userId, {
      userId,
      username,
      lives: GAME_CONFIG.initialLives,
      isEliminated: false,
      responded: false,
      response: null,
    });

    const embed = this.createLobbyEmbed();
    const row = this.createLobbyButtons();
    await interaction.update({
      embeds: [embed],
      components: [row],
    });
  }

  /**
   * Handle START button
   */
  private async handleStart(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'lobby') {
      await interaction.reply({
        content: 'Game has already started.',
        ephemeral: true,
      });
      return;
    }

    if (interaction.user.id !== this.data.hostId) {
      await interaction.reply({
        content: 'Only the host can start the game.',
        ephemeral: true,
      });
      return;
    }

    if (this.data.players.size < GAME_CONFIG.minPlayers) {
      await interaction.reply({
        content: `Need at least ${GAME_CONFIG.minPlayers} players to start.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    // Start game
    this.state = 'playing';

    // Send first command
    await this.sendNextCommand();
  }

  /**
   * Handle color press
   */
  private async handleColorPress(interaction: MessageComponentInteraction, color: SimonSaysColor): Promise<void> {
    if (this.state !== 'playing') {
      await interaction.reply({
        content: 'Game is not in progress.',
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;
    const player = this.data.players.get(userId);

    if (!player || player.isEliminated) {
      await interaction.reply({
        content: 'You are not in the game.',
        ephemeral: true,
      });
      return;
    }

    if (player.responded) {
      await interaction.reply({
        content: 'You have already responded to this command.',
        ephemeral: true,
      });
      return;
    }

    const command = this.data.currentCommand;
    if (!command) {
      return;
    }

    // Record response
    player.responded = true;
    player.response = [color];

    await interaction.deferUpdate();

    // Check if all active players have responded
    if (this.allPlayersResponded()) {
      this.clearCommandTimeout();
      await this.resolveCommand();
    }
  }

  /**
   * Send next command
   */
  private async sendNextCommand(): Promise<void> {
    this.data.commandNumber++;
    
    // Generate command based on difficulty
    const command = this.generateCommand();
    this.data.currentCommand = command;

    // Reset player responses
    for (const player of this.data.players.values()) {
      player.responded = false;
      player.response = null;
    }

    // Send new message (not editing previous)
    const channel = this.data.message?.channel as TextChannel;
    const embed = this.createCommandEmbed(command);
    const row = this.createCommandButtons(command);

    const sentMessage = await channel.send({
      embeds: [embed],
      components: [row],
    });

    // Set command timeout
    this.data.commandTimeout = setTimeout(() => {
      this.resolveCommand();
    }, command.reactionTime);
  }

  /**
   * Generate command based on difficulty
   */
  private generateCommand(): SimonSaysCommand {
    const phase = this.getPhase();
    const reactionTime = this.getReactionTime(phase);
    
    // Determine command type based on phase
    const rand = Math.random();
    let command: SimonSaysCommand;

    if (phase === 'early') {
      // Early game: mostly simple Simon Says
      if (rand < 0.8) {
        command = {
          isSimonSays: true,
          action: 'PRESS',
          colors: [this.getRandomColor()],
          reactionTime,
        };
      } else {
        command = {
          isSimonSays: false,
          action: 'PRESS',
          colors: [this.getRandomColor()],
          reactionTime,
        };
      }
    } else if (phase === 'mid') {
      // Mid game: mix of commands
      if (rand < 0.6) {
        command = {
          isSimonSays: true,
          action: 'PRESS',
          colors: [this.getRandomColor()],
          reactionTime,
        };
      } else if (rand < 0.8) {
        command = {
          isSimonSays: false,
          action: 'PRESS',
          colors: [this.getRandomColor()],
          reactionTime,
        };
      } else {
        command = {
          isSimonSays: true,
          action: 'DONT_PRESS',
          colors: [],
          reactionTime,
        };
      }
    } else {
      // Late game: complex commands
      if (rand < 0.5) {
        command = {
          isSimonSays: true,
          action: 'PRESS',
          colors: [this.getRandomColor(), this.getRandomColor()],
          reactionTime,
        };
      } else if (rand < 0.75) {
        command = {
          isSimonSays: false,
          action: 'PRESS',
          colors: [this.getRandomColor()],
          reactionTime,
        };
      } else {
        command = {
          isSimonSays: true,
          action: 'DONT_PRESS',
          colors: [],
          reactionTime,
        };
      }
    }

    return command;
  }

  /**
   * Get current game phase
   */
  private getPhase(): 'early' | 'mid' | 'late' {
    if (this.data.commandNumber <= GAME_CONFIG.phaseThresholds.early) {
      return 'early';
    } else if (this.data.commandNumber <= GAME_CONFIG.phaseThresholds.mid) {
      return 'mid';
    }
    return 'late';
  }

  /**
   * Get reaction time for current phase
   */
  private getReactionTime(phase: 'early' | 'mid' | 'late'): number {
    return GAME_CONFIG.reactionTimes[phase];
  }

  /**
   * Get random color
   */
  private getRandomColor(): SimonSaysColor {
    const colors: SimonSaysColor[] = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Check if all players have responded
   */
  private allPlayersResponded(): boolean {
    for (const player of this.data.players.values()) {
      if (!player.isEliminated && !player.responded) {
        return false;
      }
    }
    return true;
  }

  /**
   * Resolve command
   */
  private async resolveCommand(): Promise<void> {
    this.clearCommandTimeout();

    const command = this.data.currentCommand;
    if (!command) {
      return;
    }

    // Process each player's response
    for (const player of this.data.players.values()) {
      if (player.isEliminated) continue;

      let correct = false;

      if (command.action === 'DONT_PRESS') {
        // Player should not press anything
        correct = !player.responded;
      } else if (command.action === 'PRESS') {
        if (command.isSimonSays) {
          // Player should press the correct color(s)
          if (player.response && player.response.length === command.colors.length) {
            correct = player.response.every((c, i) => c === command.colors[i]);
          }
        } else {
          // Fake command - player should not press
          correct = !player.responded;
        }
      }

      if (!correct) {
        player.lives--;
        if (player.lives <= 0) {
          player.isEliminated = true;
        }
      }
    }

    // Check win conditions
    const activePlayers = Array.from(this.data.players.values()).filter(p => !p.isEliminated);
    
    if (activePlayers.length <= 1) {
      await this.endGame(activePlayers.length === 1 ? activePlayers[0] : null);
      return;
    }

    // Send next command
    await this.sendNextCommand();
  }

  /**
   * End game
   */
  private async endGame(winner: Player | null): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();
    this.clearCommandTimeout();

    const channel = this.data.message?.channel as TextChannel;

    let embed: EmbedBuilder;
    if (winner) {
      embed = new EmbedBuilder()
        .setTitle('🏆 SIMON SAYS')
        .setDescription(`**WINNER**\n${winner.username}\n\n` +
          `**Commands Survived:** ${this.data.commandNumber}`)
        .setColor(0x00ff00);
    } else {
      embed = new EmbedBuilder()
        .setTitle('🏆 SIMON SAYS')
        .setDescription(`**NO WINNER**\n\nAll players were eliminated.`)
        .setColor(0xe74c3c);
    }

    await channel.send({
      embeds: [embed],
    });
  }

  /**
   * Handle game timeout
   */
  private async timeoutGame(message: Message): Promise<void> {
    this.state = 'timeout';
    this.clearTimeout();
    this.clearCommandTimeout();

    const embed = new EmbedBuilder()
      .setTitle('🗣️ SIMON SAYS')
      .setDescription(`Game timed out.`)
      .setColor(0xe74c3c);

    await message.edit({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Clear timeout
   */
  private clearTimeout(): void {
    if (this.gameTimeout) {
      clearTimeout(this.gameTimeout);
      this.gameTimeout = null;
    }
  }

  /**
   * Clear command timeout
   */
  private clearCommandTimeout(): void {
    if (this.data.commandTimeout) {
      clearTimeout(this.data.commandTimeout);
      this.data.commandTimeout = null;
    }
  }

  /**
   * Check if game is finished
   */
  isFinished(): boolean {
    return this.state === 'complete' || this.state === 'timeout';
  }

  // Embed creation methods

  private createLobbyEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('🗣️ SIMON SAYS')
      .setDescription(`Follow the commands!\n\n` +
        `Press the correct button when Simon says.\n` +
        `Don't press when it's a fake command!\n\n` +
        `Each player starts with ${GAME_CONFIG.initialLives} lives.\n\n` +
        `**Players:** ${this.data.players.size}/${GAME_CONFIG.minPlayers}+`)
      .setColor(0x3498db);
  }

  private createCommandEmbed(command: SimonSaysCommand): EmbedBuilder {
    let description = '';
    
    if (command.isSimonSays) {
      description += '**SIMON SAYS**\n\n';
    } else {
      description += '**FAKE COMMAND**\n\n';
    }

    if (command.action === 'PRESS') {
      const colorEmojis: Record<SimonSaysColor, string> = {
        RED: '🔴',
        BLUE: '🔵',
        GREEN: '🟢',
        YELLOW: '🟡',
      };
      description += command.colors.map(c => colorEmojis[c]).join(' → ');
    } else if (command.action === 'DONT_PRESS') {
      description += '**DON\'T PRESS ANYTHING**';
    }

    // Show player lives
    description += '\n\n**Lives:**\n';
    for (const player of this.data.players.values()) {
      if (!player.isEliminated) {
        description += `${player.username}: ${'❤️'.repeat(player.lives)}\n`;
      }
    }

    return new EmbedBuilder()
      .setTitle('🗣️ SIMON SAYS')
      .setDescription(description)
      .setColor(0x3498db);
  }

  // Button creation methods

  private createLobbyButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('simonsays_join')
        .setLabel('JOIN GAME')
        .setStyle(ButtonStyle.Primary)
    ).addComponents(
      new ButtonBuilder()
        .setCustomId('simonsays_start')
        .setLabel('START GAME')
        .setStyle(ButtonStyle.Success)
    );
  }

  private createCommandButtons(command: SimonSaysCommand): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    const colorEmojis: Record<SimonSaysColor, string> = {
      RED: '🔴',
      BLUE: '🔵',
      GREEN: '🟢',
      YELLOW: '🟡',
    };

    const colorStyles: Record<SimonSaysColor, ButtonStyle> = {
      RED: ButtonStyle.Danger,
      BLUE: ButtonStyle.Primary,
      GREEN: ButtonStyle.Success,
      YELLOW: ButtonStyle.Secondary,
    };

    for (const color of ['RED', 'BLUE', 'GREEN', 'YELLOW'] as SimonSaysColor[]) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`simonsays_${color.toLowerCase()}`)
          .setLabel(colorEmojis[color])
          .setStyle(colorStyles[color])
      );
    }

    return row;
  }
}
