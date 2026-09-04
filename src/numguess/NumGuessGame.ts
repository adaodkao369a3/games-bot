import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

type NumGuessState = 'idle' | 'lobby' | 'playing' | 'complete' | 'timeout';

interface PlayerGuess {
  userId: string;
  username: string;
  guess: number | null;
  distance: number | null;
}

interface NumGuessGameData {
  channelId: string;
  guildId: string | undefined;
  hostId: string;
  players: Map<string, PlayerGuess>;
  hiddenNumber: number;
  minRange: number;
  maxRange: number;
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
}

// Game configuration
const GAME_CONFIG = {
  minPlayers: 2,
  maxPlayers: 20,
  minRange: 1,
  maxRange: 100,
  // Timeout in milliseconds
  timeoutMs: 5 * 60 * 1000, // 5 minutes
  // Guess submission timeout
  guessTimeoutMs: 60 * 1000, // 60 seconds
};

export class NumGuessGame {
  private state: NumGuessState = 'idle';
  private data: NumGuessGameData;
  private gameTimeout: NodeJS.Timeout | null = null;
  private guessTimeout: NodeJS.Timeout | null = null;

  constructor(channelId: string, guildId: string | undefined, hostId: string) {
    this.data = {
      channelId,
      guildId,
      hostId,
      players: new Map(),
      hiddenNumber: 0,
      minRange: GAME_CONFIG.minRange,
      maxRange: GAME_CONFIG.maxRange,
      messageId: null,
      message: null,
      gameInstanceId: `numguess_${channelId}_${Date.now()}`,
    };
  }

  /**
   * Start the numguess game lobby
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
      case 'numguess_join':
        await this.handleJoin(interaction);
        break;
      case 'numguess_start':
        await this.handleStart(interaction);
        break;
      default:
        await interaction.reply({
          content: 'Unknown action.',
          ephemeral: true,
        });
    }
  }

  /**
   * Handle message submissions (guesses)
   */
  async handleMessage(message: Message): Promise<void> {
    if (this.state !== 'playing') {
      return;
    }

    const userId = message.author.id;
    const player = this.data.players.get(userId);

    if (!player) {
      return;
    }

    // Check if already guessed
    if (player.guess !== null) {
      await message.reply('You have already submitted your guess.');
      return;
    }

    // Validate guess
    const content = message.content.trim();
    const guess = parseInt(content, 10);

    if (isNaN(guess)) {
      await message.reply('Your guess must be a number.');
      return;
    }

    if (guess < this.data.minRange || guess > this.data.maxRange) {
      await message.reply(`Your guess must be between ${this.data.minRange} and ${this.data.maxRange}.`);
      return;
    }

    // Record guess
    player.guess = guess;
    player.distance = Math.abs(guess - this.data.hiddenNumber);

    // Update embed
    await this.updateGameEmbed();

    // Check if all players have guessed
    if (this.allGuessesSubmitted()) {
      this.clearGuessTimeout();
      await this.resolveGame();
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
      guess: null,
      distance: null,
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

    // Generate hidden number
    this.data.hiddenNumber = Math.floor(Math.random() * (this.data.maxRange - this.data.minRange + 1)) + this.data.minRange;

    // Start game
    this.state = 'playing';

    const embed = this.createGameEmbed();
    await this.data.message?.edit({
      embeds: [embed],
      components: [],
    });

    // Set guess timeout
    this.guessTimeout = setTimeout(() => {
      this.forceResolve();
    }, GAME_CONFIG.guessTimeoutMs);
  }

  /**
   * Update game embed
   */
  private async updateGameEmbed(): Promise<void> {
    const embed = this.createGameEmbed();
    await this.data.message?.edit({
      embeds: [embed],
    });
  }

  /**
   * Check if all guesses submitted
   */
  private allGuessesSubmitted(): boolean {
    for (const player of this.data.players.values()) {
      if (player.guess === null) {
        return false;
      }
    }
    return true;
  }

  /**
   * Force resolve on timeout
   */
  private async forceResolve(): Promise<void> {
    // Mark players who haven't guessed as having guessed with max distance
    for (const player of this.data.players.values()) {
      if (player.guess === null) {
        player.guess = -1;
        player.distance = this.data.maxRange - this.data.minRange + 1;
      }
    }
    await this.resolveGame();
  }

  /**
   * Resolve game
   */
  private async resolveGame(): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();
    this.clearGuessTimeout();

    // Find winner(s)
    const minDistance = Math.min(...Array.from(this.data.players.values()).map(p => p.distance || Infinity));
    const winners = Array.from(this.data.players.values()).filter(p => p.distance === minDistance);

    const embed = this.createResultEmbed(winners, minDistance);
    await this.data.message?.edit({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Handle game timeout
   */
  private async timeoutGame(message: Message): Promise<void> {
    this.state = 'timeout';
    this.clearTimeout();

    const embed = new EmbedBuilder()
      .setTitle('🔢 NUMGUESS')
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
   * Clear guess timeout
   */
  private clearGuessTimeout(): void {
    if (this.guessTimeout) {
      clearTimeout(this.guessTimeout);
      this.guessTimeout = null;
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
      .setTitle('🔢 NUMGUESS')
      .setDescription(`Guess the hidden number!\n\n` +
        `The number is between ${this.data.minRange} and ${this.data.maxRange}.\n` +
        `The player closest to the number wins!\n\n` +
        `**Players:** ${this.data.players.size}/${GAME_CONFIG.minPlayers}+`)
      .setColor(0x3498db);
  }

  private createGameEmbed(): EmbedBuilder {
    let description = `**NUMGUESS**\n\n`;
    description += `Guess a number between ${this.data.minRange} and ${this.data.maxRange}.\n\n`;

    for (const player of this.data.players.values()) {
      if (player.guess !== null) {
        description += `${player.username} — ${player.guess}\n`;
      } else {
        description += `${player.username} — ...\n`;
      }
    }

    return new EmbedBuilder()
      .setTitle('🔢 NUMGUESS')
      .setDescription(description)
      .setColor(0x3498db);
  }

  private createResultEmbed(winners: PlayerGuess[], minDistance: number): EmbedBuilder {
    let description = `**THE NUMBER WAS ${this.data.hiddenNumber}**\n\n`;

    for (const player of this.data.players.values()) {
      if (player.guess !== null && player.guess >= 0) {
        description += `${player.username} — ${player.guess} (${player.distance} away)\n`;
      } else {
        description += `${player.username} — (no guess)\n`;
      }
    }

    if (winners.length === 1) {
      description += `\n🏆 ${winners[0].username} WINS!`;
    } else {
      description += `\n🏆 TIE: ${winners.map(w => w.username).join(', ')}`;
    }

    return new EmbedBuilder()
      .setTitle('🔢 NUMGUESS')
      .setDescription(description)
      .setColor(0xFFD700);
  }

  // Button creation methods

  private createLobbyButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('numguess_join')
        .setLabel('JOIN GAME')
        .setStyle(ButtonStyle.Primary)
    ).addComponents(
      new ButtonBuilder()
        .setCustomId('numguess_start')
        .setLabel('START GAME')
        .setStyle(ButtonStyle.Success)
    );
  }
}
