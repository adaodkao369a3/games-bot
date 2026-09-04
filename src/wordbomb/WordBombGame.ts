import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel } from 'discord.js';
import { DatamuseWordProvider } from '../wordle/datamuseProvider.js';
import { awardCoins } from '../services/coins.js';

type WordBombState = 'idle' | 'joining' | 'playing' | 'complete' | 'timeout';

interface WordBombGameData {
  channelId: string;
  guildId: string | undefined;
  players: Set<string>;
  eliminatedPlayers: Set<string>;
  currentRound: number;
  currentCombination: string;
  currentPlayerIndex: number;
  currentPlayer: string | null;
  timeLeft: number;
  usedWords: Set<string>;
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
}

// Game configuration
const GAME_CONFIG = {
  // Joining duration in seconds
  joinDuration: 10,
  // Round timer in seconds
  roundTimer: 10,
  // Letter combinations by difficulty
  combinations: {
    easy: ['AR', 'IN', 'ST', 'ON', 'ER', 'AN', 'AT', 'OR', 'IS', 'IT'],
    medium: ['CH', 'OO', 'EA', 'OU', 'TR', 'TH', 'SH', 'ND', 'RE', 'AL'],
    hard: ['TION', 'OUGH', 'IGHT', 'STR', 'PH', 'QU', 'SCI', 'ENT', 'PRE', 'SCH'],
  },
  // Difficulty progression: round -> difficulty
  difficultyProgression: {
    1: 'easy',
    2: 'easy',
    3: 'medium',
    4: 'medium',
    5: 'hard',
  },
  // Default difficulty for rounds beyond 5
  defaultDifficulty: 'hard',
  // Reward for winner
  winnerReward: 100,
  // Minimum word length
  minWordLength: 3,
  // Maximum game duration in seconds
  maxGameDuration: 300, // 5 minutes
};

export class WordBombGame {
  private state: WordBombState = 'idle';
  private data: WordBombGameData;
  private wordProvider: DatamuseWordProvider;
  private joinTimeout: NodeJS.Timeout | null = null;
  private roundTimeout: NodeJS.Timeout | null = null;
  private gameStartTime: number;
  private playerOrder: string[] = [];

  constructor(channelId: string, guildId: string | undefined, wordProvider: DatamuseWordProvider) {
    this.wordProvider = wordProvider;
    this.gameStartTime = Date.now();
    this.data = {
      channelId,
      guildId,
      players: new Set(),
      eliminatedPlayers: new Set(),
      currentRound: 0,
      currentCombination: '',
      currentPlayerIndex: 0,
      currentPlayer: null,
      timeLeft: 0,
      usedWords: new Set(),
      messageId: null,
      message: null,
      gameInstanceId: `wordbomb_${channelId}_${Date.now()}`,
    };
  }

  /**
   * Start the word bomb game
   */
  async start(message: Message): Promise<void> {
    this.state = 'joining';
    this.data.messageId = message.id;
    this.data.message = message;

    const initialEmbed = this.createJoiningEmbed();
    const row = this.createJoinButton();

    const sentMessage = await message.reply({
      embeds: [initialEmbed],
      components: [row],
    });

    this.data.messageId = sentMessage.id;
    this.data.message = sentMessage;

    // Set join timeout
    this.joinTimeout = setTimeout(() => {
      this.endJoiningPhase();
    }, GAME_CONFIG.joinDuration * 1000);
  }

  /**
   * Handle join button click
   */
  async handleJoin(userId: string): Promise<boolean> {
    if (this.state !== 'joining') return false;

    if (this.data.players.has(userId)) return false; // Already joined

    this.data.players.add(userId);

    // Update embed
    const embed = this.createJoiningEmbed();
    await this.data.message?.edit({
      embeds: [embed],
    });

    return true;
  }

  /**
   * End joining phase and start game
   */
  private async endJoiningPhase(): Promise<void> {
    if (this.state !== 'joining') return;

    this.clearJoinTimeout();

    if (this.data.players.size < 2) {
      // Not enough players
      this.state = 'complete';
      const embed = new EmbedBuilder()
        .setTitle('💣 WORD BOMB')
        .setDescription('Not enough players joined. Game cancelled.')
        .setColor(0xe74c3c);

      await this.data.message?.edit({
        embeds: [embed],
        components: [],
      });
      return;
    }

    // Start game
    this.state = 'playing';
    this.playerOrder = Array.from(this.data.players);
    this.data.currentPlayerIndex = 0;
    this.data.currentPlayer = this.playerOrder[0];

    await this.startRound();
  }

  /**
   * Start a new round
   */
  private async startRound(): Promise<void> {
    // Check if game should end
    if (this.data.players.size <= 1) {
      await this.endGame();
      return;
    }

    // Check max game duration
    if (Date.now() - this.gameStartTime > GAME_CONFIG.maxGameDuration * 1000) {
      await this.endGame();
      return;
    }

    this.data.currentRound++;
    this.data.currentCombination = this.generateCombination();
    this.data.timeLeft = GAME_CONFIG.roundTimer;

    const embed = this.createRoundEmbed();
    await this.data.message?.edit({
      embeds: [embed],
      components: [],
    });

    // Send ping message to current player
    const channel = this.data.message?.channel as TextChannel;
    if (channel) {
      await channel.send({
        content: `<@!${this.data.currentPlayer}>, guess a word containing **${this.data.currentCombination}**! Time: ${this.data.timeLeft} seconds`,
      }).catch(() => {});
    }

    // Start round timer
    this.startRoundTimer();
  }

  /**
   * Generate a letter combination based on difficulty
   */
  private generateCombination(): string {
    const round = this.data.currentRound;
    let difficulty = GAME_CONFIG.difficultyProgression[round as keyof typeof GAME_CONFIG.difficultyProgression] || GAME_CONFIG.defaultDifficulty;
    const combinations = GAME_CONFIG.combinations[difficulty as keyof typeof GAME_CONFIG.combinations];
    return combinations[Math.floor(Math.random() * combinations.length)];
  }

  /**
   * Start the round timer
   */
  private startRoundTimer(): void {
    this.data.timeLeft = GAME_CONFIG.roundTimer;

    const updateTimer = () => {
      if (this.state !== 'playing') {
        this.clearRoundTimeout();
        return;
      }

      this.data.timeLeft--;

      if (this.data.timeLeft <= 0) {
        this.clearRoundTimeout();
        this.explode();
      } else {
        // Update embed with new time
        const embed = this.createRoundEmbed();
        this.data.message?.edit({
          embeds: [embed],
        }).catch(() => {});

        this.roundTimeout = setTimeout(updateTimer, 1000);
      }
    };

    this.roundTimeout = setTimeout(updateTimer, 1000);
  }

  /**
   * Handle player word submission
   */
  async handleWordSubmission(userId: string, word: string): Promise<void> {
    if (this.state !== 'playing') return;

    // Check if user is in the game
    if (!this.data.players.has(userId)) return;

    // Check if user is eliminated
    if (this.data.eliminatedPlayers.has(userId)) return;

    // Check if it's this player's turn
    if (userId !== this.data.currentPlayer) return;

    // Validate word
    const validation = await this.validateWord(word);

    if (!validation.valid) {
      // Invalid word - send ephemeral message
      const channel = this.data.message?.channel as TextChannel;
      if (channel) {
        await channel.send({
          content: `❌ ${validation.reason}`,
        }).catch(() => {});
      }
      return;
    }

    // Valid word - player is safe
    this.clearRoundTimeout();

    const embed = new EmbedBuilder()
      .setTitle('💣 WORD BOMB')
      .setDescription(`✅ SAFE!\n\n<@!${userId}> used **${word.toUpperCase()}**.`)
      .setColor(0x00ff00);

    await this.data.message?.edit({
      embeds: [embed],
    });

    // Move to next player
    this.data.currentPlayerIndex = (this.data.currentPlayerIndex + 1) % this.playerOrder.length;
    
    // Skip eliminated players
    while (this.data.eliminatedPlayers.has(this.playerOrder[this.data.currentPlayerIndex])) {
      this.data.currentPlayerIndex = (this.data.currentPlayerIndex + 1) % this.playerOrder.length;
    }

    this.data.currentPlayer = this.playerOrder[this.data.currentPlayerIndex];

    // Start next round after short delay
    setTimeout(() => {
      this.startRound();
    }, 1500);
  }

  /**
   * Validate a word
   */
  private async validateWord(word: string): Promise<{ valid: boolean; reason: string }> {
    const normalized = word.toLowerCase().trim();

    // Check basic format (reject emojis and special characters)
    if (!/^[a-z]+$/.test(normalized)) {
      return { valid: false, reason: 'Word must contain only letters (no emojis or special characters).' };
    }

    // Check minimum length
    if (normalized.length < GAME_CONFIG.minWordLength) {
      return { valid: false, reason: `Word must be at least ${GAME_CONFIG.minWordLength} letters.` };
    }

    // Check if word contains the combination
    if (!normalized.includes(this.data.currentCombination.toLowerCase())) {
      return { valid: false, reason: `Word must contain "${this.data.currentCombination}".` };
    }

    // Check if word was already used
    if (this.data.usedWords.has(normalized)) {
      return { valid: false, reason: 'Word already used in this game.' };
    }

    // Check if word is valid using Datamuse
    const isValid = await this.wordProvider.isValidWord(normalized);
    if (!isValid) {
      return { valid: false, reason: 'Not a valid English word.' };
    }

    // Add to used words
    this.data.usedWords.add(normalized);

    return { valid: true, reason: '' };
  }

  /**
   * Handle explosion (player failed to answer in time)
   */
  private async explode(): Promise<void> {
    const currentPlayer = this.data.currentPlayer!;
    
    // Eliminate player
    this.data.players.delete(currentPlayer);
    this.data.eliminatedPlayers.add(currentPlayer);

    const embed = new EmbedBuilder()
      .setTitle('💥 BOOM!')
      .setDescription(`<@!${currentPlayer}> didn't find a word in time.\n\n**Eliminated!**`)
      .setColor(0xe74c3c);

    await this.data.message?.edit({
      embeds: [embed],
    });

    // Check if game should end
    if (this.data.players.size <= 1) {
      setTimeout(() => {
        this.endGame();
      }, 1500);
    } else {
      // Move to next player
      this.data.currentPlayerIndex = (this.data.currentPlayerIndex + 1) % this.playerOrder.length;
      
      // Skip eliminated players
      while (this.data.eliminatedPlayers.has(this.playerOrder[this.data.currentPlayerIndex])) {
        this.data.currentPlayerIndex = (this.data.currentPlayerIndex + 1) % this.playerOrder.length;
      }

      this.data.currentPlayer = this.playerOrder[this.data.currentPlayerIndex];

      // Start next round after short delay
      setTimeout(() => {
        this.startRound();
      }, 1500);
    }
  }

  /**
   * End the game
   */
  private async endGame(): Promise<void> {
    this.state = 'complete';
    this.clearJoinTimeout();
    this.clearRoundTimeout();

    const winner = Array.from(this.data.players)[0];

    if (winner) {
      // Award reward
      await awardCoins(
        winner,
        GAME_CONFIG.winnerReward,
        'wordbomb',
        {
          reason: 'Word Bomb winner',
          description: 'Won word bomb game',
        }
      );

      const embed = new EmbedBuilder()
        .setTitle('🏆 WORD BOMB CHAMPION')
        .setDescription(`━━━━━━━━━━━━━━\n\n` +
          `**Winner:** <@!${winner}>\n\n` +
          `**Players Eliminated:** ${this.data.eliminatedPlayers.size}\n\n` +
          `**Total Rounds:** ${this.data.currentRound}\n\n` +
          `**Words Played:** ${this.data.usedWords.size}\n\n` +
          `**Reward:** +${GAME_CONFIG.winnerReward} <:cash:1545149005544165416>\n\n` +
          `━━━━━━━━━━━━━━`)
        .setColor(0xFFD700);

      await this.data.message?.edit({
        embeds: [embed],
      });
    } else {
      const embed = new EmbedBuilder()
        .setTitle('💣 WORD BOMB')
        .setDescription('Game ended with no winner.')
        .setColor(0xe74c3c);

      await this.data.message?.edit({
        embeds: [embed],
      });
    }
  }

  /**
   * Clear join timeout
   */
  private clearJoinTimeout(): void {
    if (this.joinTimeout) {
      clearTimeout(this.joinTimeout);
      this.joinTimeout = null;
    }
  }

  /**
   * Clear round timeout
   */
  private clearRoundTimeout(): void {
    if (this.roundTimeout) {
      clearTimeout(this.roundTimeout);
      this.roundTimeout = null;
    }
  }

  /**
   * Check if game is finished
   */
  isFinished(): boolean {
    return this.state === 'complete' || this.state === 'timeout';
  }

  /**
   * Get current players
   */
  getPlayers(): Set<string> {
    return this.data.players;
  }

  // Embed creation methods

  private createJoiningEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('💣 WORD BOMB')
      .setDescription('The bomb is armed.\nJoin the game before the countdown ends!\n\n' +
        `**PLAYERS**\n${this.data.players.size}\n\n` +
        `**JOINING**\n${GAME_CONFIG.joinDuration} seconds`)
      .setColor(0xe74c3c);
  }

  private createRoundEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('💣 WORD BOMB')
      .setDescription(`**LETTER COMBINATION**\n\n### \`${this.data.currentCombination}\`\n\n` +
        `**TIME LEFT**\n${this.data.timeLeft} seconds\n\n` +
        `**💥 CURRENT PLAYER**\n<@!${this.data.currentPlayer}>\n\n` +
        `Type a valid word containing **${this.data.currentCombination}** before the bomb explodes!`)
      .setColor(0xe74c3c);
  }

  // Button creation methods

  private createJoinButton(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('wordbomb_join')
        .setLabel('JOIN GAME')
        .setStyle(ButtonStyle.Primary)
    );
  }
}
