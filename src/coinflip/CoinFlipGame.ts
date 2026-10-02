import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { awardCoins, removeCoins } from '../services/coins.js';
import { getCoinBalanceInfo } from '../services/coins.js';

type CoinFlipState = 'idle' | 'playing' | 'complete' | 'cashout' | 'timeout';

type CoinSide = 'HEADS' | 'TAILS';

interface CoinFlipGameData {
  userId: string;
  username: string;
  avatarUrl: string;
  channelId: string;
  guildId: string | undefined;
  betAmount: number;
  currentPayout: number;
  streak: number;
  lastFlip: CoinSide | null;
  lastCall: CoinSide | null;
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
  flipHistory: FlipResult[];
}

interface FlipResult {
  round: number;
  call: CoinSide;
  result: CoinSide;
  won: boolean;
}

// Game configuration
const GAME_CONFIG = {
  // Multipliers for streak: streak -> multiplier
  streakMultipliers: {
    0: 1.0,
    1: 1.25,
    2: 1.5,
    3: 2.0,
    4: 2.5,
    5: 3.0,
    6: 4.0,
    7: 5.0,
    8: 6.0,
    9: 8.0,
    10: 10.0,
  },
  // Default multiplier for streaks beyond 10
  defaultMultiplier: 12.0,
  // Timeout in milliseconds
  timeoutMs: 5 * 60 * 1000, // 5 minutes
};

/**
 * Get multiplier for current streak
 */
function getMultiplier(streak: number): number {
  if (streak in GAME_CONFIG.streakMultipliers) {
    return GAME_CONFIG.streakMultipliers[streak as keyof typeof GAME_CONFIG.streakMultipliers];
  }
  return GAME_CONFIG.defaultMultiplier;
}

/**
 * Calculate current payout based on bet and streak
 */
function calculatePayout(bet: number, streak: number): number {
  const multiplier = getMultiplier(streak);
  return Math.floor(bet * multiplier);
}

/**
 * Flip a fair coin (50/50)
 */
function flipCoin(): CoinSide {
  return Math.random() < 0.5 ? 'HEADS' : 'TAILS';
}

export class CoinFlipGame {
  private state: CoinFlipState = 'idle';
  private data: CoinFlipGameData;
  private gameTimeout: NodeJS.Timeout | null = null;

  constructor(userId: string, username: string, avatarUrl: string, betAmount: number, channelId: string, guildId: string | undefined) {
    this.data = {
      userId,
      username,
      avatarUrl,
      channelId,
      guildId,
      betAmount,
      currentPayout: betAmount,
      streak: 0,
      lastFlip: null,
      lastCall: null,
      messageId: null,
      message: null,
      gameInstanceId: `cf_${userId}_${Date.now()}`,
      flipHistory: [],
    };
  }

  /**
   * Start the coin flip game
   */
  async start(message: Message): Promise<void> {
    // Check if user has enough coins
    const coinInfo = await getCoinBalanceInfo(this.data.userId);
    if (!coinInfo) {
      await message.reply('Unable to retrieve your Bombo Coin balance. Please try again later.');
      return;
    }

    if (coinInfo.balance < this.data.betAmount) {
      await message.reply(
        `You don't have enough Bombo Coins for this bet! You need ${this.data.betAmount.toLocaleString('en-US')} <:bombocoin:1545139736312815840>.\n` +
        `Your current balance: ${coinInfo.balance.toLocaleString('en-US')} <:bombocoin:1545139736312815840>`
      );
      return;
    }

    // Deduct bet
    const deduction = await removeCoins(
      this.data.userId,
      this.data.betAmount,
      'cf',
      {
        reason: 'Coin Flip wager',
        description: 'Single-player coin flip',
      }
    );

    if (deduction === null) {
      await message.reply('Failed to process your wager. Please try again.');
      return;
    }

    this.state = 'playing';
    this.data.messageId = message.id;
    this.data.message = message;

    const initialEmbed = this.createGameEmbed();
    const row = this.createGameButtons();

    const sentMessage = await message.reply({
      embeds: [initialEmbed],
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
    // Verify user
    if (interaction.user.id !== this.data.userId) {
      await interaction.reply({
        content: 'This is not your game!',
        ephemeral: true,
      });
      return;
    }

    const customId = interaction.customId;

    if (customId === 'cf_heads' || customId === 'cf_tails') {
      await this.handleFlip(interaction, customId === 'cf_heads' ? 'HEADS' : 'TAILS');
    } else if (customId === 'cf_cashout') {
      await this.handleCashout(interaction);
    } else {
      await interaction.reply({
        content: 'Unknown action.',
        ephemeral: true,
      });
    }
  }

  /**
   * Handle flip button
   */
  private async handleFlip(interaction: MessageComponentInteraction, call: CoinSide): Promise<void> {
    if (this.state !== 'playing') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    // Flip the coin
    const result = flipCoin();
    const correct = call === result;

    this.data.lastCall = call;
    this.data.lastFlip = result;

    // Record flip in history
    const roundNumber = this.data.flipHistory.length + 1;
    this.data.flipHistory.push({
      round: roundNumber,
      call,
      result,
      won: correct,
    });

    if (correct) {
      // Correct prediction
      this.data.streak++;
      this.data.currentPayout = calculatePayout(this.data.betAmount, this.data.streak);

      const embed = this.createGameEmbed();
      const row = this.createGameButtons();

      await interaction.update({
        embeds: [embed],
        components: [row],
      });
    } else {
      // Wrong prediction - end game immediately
      await this.lose(interaction);
    }
  }

  /**
   * Handle cash out
   */
  private async handleCashout(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'playing') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    if (this.data.streak < 1) {
      await interaction.reply({
        content: 'You need at least one correct prediction to cash out!',
        ephemeral: true,
      });
      return;
    }

    this.state = 'cashout';
    this.clearTimeout();

    // Award winnings
    const awardResult = await awardCoins(
      this.data.userId,
      this.data.currentPayout,
      'cf',
      {
        reason: 'Coin Flip cash out',
        description: `Streak: ${this.data.streak}`,
        gameInstanceId: this.data.gameInstanceId,
      }
    );

    if (awardResult === null) {
      await interaction.update({
        content: 'Failed to award winnings. Please contact support.',
        components: [],
      });
      return;
    }

    const embed = this.createCashoutEmbed();

    await interaction.update({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Handle loss
   */
  private async lose(interaction: MessageComponentInteraction): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();

    const flipEmoji = this.data.lastFlip === 'HEADS' ? '<:heads:1555524163853226025>' : '<:tails:1555524166264823891>';

    // GAME OVER EMBED
    let description = `**GAME OVER**\n\n`;
    description += `${flipEmoji} **${this.data.lastFlip}**\n\n`;
    description += `You called **${this.data.lastCall}**.\n\n`;
    description += `─────────────────\n\n`;
    description += `**WIN STREAK:** ${this.data.streak}\n\n`;
    description += `**ORIGINAL BET:** ${this.data.betAmount.toLocaleString('en-US')} <:bombocoin:1545139736312815840>\n\n`;
    description += `**AMOUNT LOST:** ${this.data.betAmount.toLocaleString('en-US')} <:bombocoin:1545139736312815840>\n\n`;
    description += `─────────────────\n\n`;

    // FLIP HISTORY
    description += `📜 **FLIP HISTORY**\n\n`;
    if (this.data.flipHistory.length === 0) {
      description += `No flips yet.\n\n`;
    } else {
      const recentHistory = this.data.flipHistory.slice(-8).reverse();
      recentHistory.forEach((flip) => {
        const flipEmoji = flip.result === 'HEADS' ? '<:heads:1555524163853226025>' : '<:tails:1555524166264823891>';
        const resultText = flip.won ? '✅ WIN' : '❌ LOSS';
        description += `R${flip.round} | ${flip.call} → ${flipEmoji} | ${resultText}\n`;
      });
      description += `\n`;
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
      .setTitle('💥 WRONG!')
      .setDescription(description)
      .setColor(0xe74c3c);

    await interaction.update({
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

    // Refund bet on timeout
    await awardCoins(
      this.data.userId,
      this.data.betAmount,
      'cf',
      {
        reason: 'Coin Flip refund',
        description: 'Game timeout',
      }
    );

    const embed = new EmbedBuilder()
      .setTitle('🪙 COIN FLIP')
      .setDescription(`━━━━━━━━━━━━━━\n\n` +
        `**Game timed out.\n\n` +
        `Your bet has been refunded.\n\n` +
        `━━━━━━━━━━━━━━`)
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
   * Check if game is finished
   */
  isFinished(): boolean {
    return this.state === 'complete' || this.state === 'cashout' || this.state === 'timeout';
  }

  // Embed creation methods

  private createGameEmbed(statusMessage: string = '', resultMessage: string = ''): EmbedBuilder {
    const multiplier = getMultiplier(this.data.streak);

    // TOP - CURRENT GAME STATS
    let description = `**WIN STREAK**\n${this.data.streak}\n\n`;
    description += `**CURRENT BET**\n${this.data.betAmount.toLocaleString('en-US')} <:bombocoin:1545139736312815840>\n\n`;
    description += `**POTENTIAL WIN**\n${this.data.currentPayout.toLocaleString('en-US')} <:bombocoin:1545139736312815840>\n\n`;
    description += `─────────────────\n\n`;

    // MIDDLE - FLIP AREA
    if (this.data.lastFlip !== null) {
      const flipEmoji = this.data.lastFlip === 'HEADS' ? '<:heads:1555524163853226025>' : '<:tails:1555524166264823891>';
      description += `${flipEmoji}\n\n`;
      description += `**YOUR CALL:** ${this.data.lastCall}\n\n`;
      description += `**RESULT:** ${statusMessage}\n\n`;
      if (resultMessage) {
        description += `${resultMessage}\n\n`;
      }
    } else {
      description += `<a:coinflip:1555521942205767711>\n\n`;
      description += `**CALL YOUR SIDE**\n\n`;
    }

    description += `─────────────────\n\n`;

    // BOTTOM - FLIP HISTORY
    description += `📜 **FLIP HISTORY**\n\n`;
    if (this.data.flipHistory.length === 0) {
      description += `No flips yet.\n\n`;
    } else {
      const recentHistory = this.data.flipHistory.slice(-8).reverse();
      recentHistory.forEach((flip) => {
        const flipEmoji = flip.result === 'HEADS' ? '<:heads:1555524163853226025>' : '<:tails:1555524166264823891>';
        const resultText = flip.won ? '✅ WIN' : '❌ LOSS';
        description += `R${flip.round} | ${flip.call} → ${flipEmoji} | ${resultText}\n`;
      });
      description += `\n`;
    }

    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setTitle('🪙 COIN FLIP')
      .setDescription(description)
      .setColor(0x3498db);
  }

  private createCashoutEmbed(): EmbedBuilder {
    const netProfit = this.data.currentPayout - this.data.betAmount;
    const multiplier = getMultiplier(this.data.streak);

    let description = `**WIN STREAK**\n${this.data.streak}\n\n`;
    description += `**ORIGINAL BET**\n${this.data.betAmount.toLocaleString('en-US')} <:bombocoin:1545139736312815840>\n\n`;
    description += `**PAYOUT**\n${this.data.currentPayout.toLocaleString('en-US')} <:bombocoin:1545139736312815840>\n\n`;
    description += `**NET PROFIT**\n${netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString('en-US')} <:bombocoin:1545139736312815840>\n\n`;
    description += `─────────────────\n\n`;

    // FLIP HISTORY
    description += `📜 **FLIP HISTORY**\n\n`;
    if (this.data.flipHistory.length === 0) {
      description += `No flips yet.\n\n`;
    } else {
      const recentHistory = this.data.flipHistory.slice(-8).reverse();
      recentHistory.forEach((flip) => {
        const flipEmoji = flip.result === 'HEADS' ? '<:heads:1555524163853226025>' : '<:tails:1555524166264823891>';
        const resultText = flip.won ? '✅ WIN' : '❌ LOSS';
        description += `R${flip.round} | ${flip.call} → ${flipEmoji} | ${resultText}\n`;
      });
      description += `\n`;
    }

    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setTitle('💰 CASHED OUT!')
      .setDescription(description)
      .setColor(0xFFD700);
  }

  // Button creation methods

  private createGameButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('cf_heads')
        .setLabel('HEADS')
        .setStyle(ButtonStyle.Primary)
    );
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('cf_tails')
        .setLabel('TAILS')
        .setStyle(ButtonStyle.Primary)
    );

    // Add cash out button if at least one correct prediction
    if (this.data.streak >= 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('cf_cashout')
          .setLabel('💰 CASH OUT')
          .setStyle(ButtonStyle.Success)
      );
    }

    return row;
  }
}
