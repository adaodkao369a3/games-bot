import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { awardCoins, removeCoins } from '../services/coins.js';
import { getCoinBalanceInfo } from '../services/coins.js';

type HigherLowerState = 'idle' | 'playing' | 'complete' | 'cashout' | 'timeout';

interface Card {
  rank: string;
  suit: string;
  value: number;
  emoji: string;
}

interface HigherLowerGameData {
  userId: string;
  username: string;
  channelId: string;
  guildId: string | undefined;
  betAmount: number;
  currentPayout: number;
  streak: number;
  deck: Card[];
  currentCard: Card | null;
  previousCard: Card | null;
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
}

// Game configuration
const GAME_CONFIG = {
  // Multipliers for streak: streak -> multiplier
  streakMultipliers: {
    1: 1.2,
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

// Card suits and emojis
const SUITS = [
  { name: 'Hearts', emoji: '♥️' },
  { name: 'Diamonds', emoji: '♦️' },
  { name: 'Clubs', emoji: '♣️' },
  { name: 'Spades', emoji: '♠️' },
];

// Card ranks and values
const RANKS = [
  { name: 'A', value: 1 },
  { name: '2', value: 2 },
  { name: '3', value: 3 },
  { name: '4', value: 4 },
  { name: '5', value: 5 },
  { name: '6', value: 6 },
  { name: '7', value: 7 },
  { name: '8', value: 8 },
  { name: '9', value: 9 },
  { name: '10', value: 10 },
  { name: 'J', value: 11 },
  { name: 'Q', value: 12 },
  { name: 'K', value: 13 },
];

/**
 * Create and shuffle a standard 52-card deck
 */
function createDeck(): Card[] {
  const deck: Card[] = [];
  
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        rank: rank.name,
        suit: suit.name,
        value: rank.value,
        emoji: suit.emoji,
      });
    }
  }
  
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

/**
 * Get multiplier for current streak
 */
function getMultiplier(streak: number): number {
  if (streak <= 0) return 1.0;
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

export class HigherLowerGame {
  private state: HigherLowerState = 'idle';
  private data: HigherLowerGameData;
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
      deck: createDeck(),
      currentCard: null,
      previousCard: null,
      messageId: null,
      message: null,
      gameInstanceId: `higherlower_${userId}_${Date.now()}`,
    };
  }

  /**
   * Start the higher or lower game
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
      'higherlower',
      {
        reason: 'Higher or Lower wager',
        description: 'Bet on card prediction',
      }
    );

    if (deduction === null) {
      await message.reply('Failed to process your wager. Please try again.');
      return;
    }

    this.state = 'playing';
    this.data.messageId = message.id;
    this.data.message = message;

    // Draw first card
    this.data.currentCard = this.data.deck.pop()!;

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

    switch (customId) {
      case 'higherlower_higher':
        await this.handlePrediction(interaction, 'higher');
        break;
      case 'higherlower_lower':
        await this.handlePrediction(interaction, 'lower');
        break;
      case 'higherlower_cashout':
        await this.handleCashout(interaction);
        break;
      default:
        await interaction.reply({
          content: 'Unknown action.',
          ephemeral: true,
        });
    }
  }

  /**
   * Handle player prediction
   */
  private async handlePrediction(interaction: MessageComponentInteraction, prediction: 'higher' | 'lower'): Promise<void> {
    if (this.state !== 'playing') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    // Store previous card
    this.data.previousCard = this.data.currentCard;

    // Draw next card
    const nextCard = this.data.deck.pop();
    if (!nextCard) {
      // Deck exhausted - auto cashout
      await this.handleCashout(interaction);
      return;
    }

    this.data.currentCard = nextCard;

    // Compare cards
    const result = this.compareCards(this.data.previousCard!, this.data.currentCard);

    // Check for push (same rank)
    if (result === 'push') {
      const embed = this.createGameEmbed('PUSH! Same rank - continue with new card');
      const row = this.createGameButtons();

      await interaction.update({
        embeds: [embed],
        components: [row],
      });
      return;
    }

    // Check if prediction was correct
    const correct = (prediction === 'higher' && result === 'higher') || (prediction === 'lower' && result === 'lower');

    if (correct) {
      // Correct prediction
      this.data.streak++;
      this.data.currentPayout = calculatePayout(this.data.betAmount, this.data.streak);

      const embed = this.createGameEmbed('✅ CORRECT!');
      const row = this.createGameButtons();

      await interaction.update({
        embeds: [embed],
        components: [row],
      });
    } else {
      // Incorrect prediction - game over
      await this.endGame(interaction, false);
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
      'higherlower',
      {
        reason: 'Higher or Lower cash out',
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
   * End the game (loss)
   */
  private async endGame(interaction: MessageComponentInteraction, won: boolean): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();

    if (!won) {
      const embed = this.createLossEmbed();

      await interaction.update({
        embeds: [embed],
        components: [],
      });
    }
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
      'higherlower',
      {
        reason: 'Higher or Lower refund',
        description: 'Game timeout',
      }
    );

    const embed = this.createTimeoutEmbed();

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
   * Compare two cards
   */
  private compareCards(card1: Card, card2: Card): 'higher' | 'lower' | 'push' {
    if (card1.value === card2.value) return 'push';
    return card2.value > card1.value ? 'higher' : 'lower';
  }

  /**
   * Check if game is finished
   */
  isFinished(): boolean {
    return this.state === 'complete' || this.state === 'cashout' || this.state === 'timeout';
  }

  // Embed creation methods

  private createGameEmbed(statusMessage: string = ''): EmbedBuilder {
    const cardDisplay = this.formatCard(this.data.currentCard!);
    const multiplier = getMultiplier(this.data.streak);
    
    let description = `Predict the next card.\n\n`;
    description += `**CURRENT CARD**\n${cardDisplay}\n\n`;
    description += `**BET**\n${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n`;
    description += `**STREAK**\n${this.data.streak}\n\n`;
    description += `**MULTIPLIER**\nx${multiplier.toFixed(1)}\n\n`;
    description += `**POTENTIAL WIN**\n${this.data.currentPayout.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n`;

    if (this.data.previousCard) {
      description += `**PREVIOUS CARD**\n${this.formatCard(this.data.previousCard)}\n\n`;
    }

    if (statusMessage) {
      description += `**${statusMessage}**\n\n`;
    }

    return new EmbedBuilder()
      .setTitle('🃏 HIGHER OR LOWER')
      .setDescription(description)
      .setColor(0x3498db);
  }

  private createCashoutEmbed(): EmbedBuilder {
    const netProfit = this.data.currentPayout - this.data.betAmount;
    
    return new EmbedBuilder()
      .setTitle('💰 CASHED OUT!')
      .setDescription(`━━━━━━━━━━━━━━\n\n` +
        `**Final Streak:** ${this.data.streak}\n\n` +
        `**Amount Won:** ${this.data.currentPayout.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `**Original Bet:** ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `**Net Profit:** ${netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `━━━━━━━━━━━━━━`)
      .setColor(0xFFD700);
  }

  private createLossEmbed(): EmbedBuilder {
    const cardDisplay = this.formatCard(this.data.currentCard!);
    
    return new EmbedBuilder()
      .setTitle('💥 YOU LOST!')
      .setDescription(`━━━━━━━━━━━━━━\n\n` +
        `**Card that caused the loss:**\n${cardDisplay}\n\n` +
        `**Streak:** ${this.data.streak}\n\n` +
        `**Amount Lost:** ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `━━━━━━━━━━━━━━`)
      .setColor(0xe74c3c);
  }

  private createTimeoutEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('🃏 HIGHER OR LOWER')
      .setDescription(`━━━━━━━━━━━━━━\n\n` +
        `**Game timed out.\n\n` +
        `Your bet has been refunded.\n\n` +
        `━━━━━━━━━━━━━━`)
      .setColor(0xe74c3c);
  }

  /**
   * Format a card for display
   */
  private formatCard(card: Card): string {
    return `${card.emoji} **${card.rank}** of ${card.suit}`;
  }

  // Button creation methods

  private createGameButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('higherlower_higher')
        .setLabel('⬆️ HIGHER')
        .setStyle(ButtonStyle.Primary)
    );
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('higherlower_lower')
        .setLabel('⬇️ LOWER')
        .setStyle(ButtonStyle.Primary)
    );

    // Add cash out button if streak >= 1
    if (this.data.streak >= 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('higherlower_cashout')
          .setLabel('💰 CASH OUT')
          .setStyle(ButtonStyle.Success)
      );
    }

    return row;
  }
}
