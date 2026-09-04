import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { awardCoins, removeCoins } from '../services/coins.js';
import { getCoinBalanceInfo } from '../services/coins.js';

type CoinFlipState = 'idle' | 'playing' | 'complete' | 'cashout' | 'timeout';

type CoinSide = 'HEADS' | 'TAILS';

interface CoinFlipGameData {
  userId: string;
  username: string;
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

  constructor(userId: string, username: string, betAmount: number, channelId: string, guildId: string | undefined) {
    this.data = {
      userId,
      username,
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
        `You don't have enough Bombo Coins for this bet! You need ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>.\n` +
        `Your current balance: ${coinInfo.balance.toLocaleString('en-US')} <:cash:1545149005544165416>`
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

    if (correct) {
      // Correct prediction
      this.data.streak++;
      this.data.currentPayout = calculatePayout(this.data.betAmount, this.data.streak);

      const embed = this.createGameEmbed('✅ CORRECT!', `The coin landed on **${result}**.`);
      const row = this.createGameButtons();

      await interaction.update({
        embeds: [embed],
        components: [row],
      });
    } else {
      // Wrong prediction
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

    const embed = new EmbedBuilder()
      .setTitle('💥 WRONG!')
      .setDescription(`You called **${this.data.lastCall}**.\nThe coin landed on **${this.data.lastFlip}**.\n\n` +
        `**Streak:** ${this.data.streak}\n\n` +
        `**Original Bet:** ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `**Amount Lost:** ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>`)
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
    
    let description = `**STREAK**\n${this.data.streak}\n\n`;
    description += `**CURRENT POTENTIAL WIN**\n${this.data.currentPayout.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n`;

    if (this.data.lastFlip !== null) {
      description += `**LAST FLIP**\n🪙 → ${this.data.lastFlip}\n\n`;
      description += `**YOUR CALL**\n${this.data.lastCall}\n\n`;
      description += `**RESULT**\n${statusMessage}\n\n`;
      if (resultMessage) {
        description += `${resultMessage}\n\n`;
      }
    } else {
      description += `> Call it.\n\n`;
    }

    description += `**BET**\n${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>`;

    return new EmbedBuilder()
      .setTitle('🪙 COIN FLIP')
      .setDescription(description)
      .setColor(0x3498db);
  }

  private createCashoutEmbed(): EmbedBuilder {
    const netProfit = this.data.currentPayout - this.data.betAmount;
    const multiplier = getMultiplier(this.data.streak);
    
    return new EmbedBuilder()
      .setTitle('💰 CASHED OUT!')
      .setDescription(`**STREAK**\n${this.data.streak}\n\n` +
        `**BET**\n${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `**PAYOUT**\n${this.data.currentPayout.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `**NET PROFIT**\n${netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString('en-US')} <:cash:1545149005544165416>`)
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
