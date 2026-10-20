import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Client } from 'discord.js';
import { awardCoins, removeCoins, getCoinBalanceInfo } from '../services/coins.js';
import { EMOJIS } from '../utils/emoji-registry.js';
import { cardEmojiKey } from '../blackjack/CardDeck.js';
import { CROSS, TICK, coins, signedCoins, betWin, mult, respond, nope } from '../utils/casino-ui.js';

type HigherLowerState = 'idle' | 'playing' | 'complete' | 'cashout' | 'timeout';

interface Card {
  rank: string;
  suit: string;
  value: number;
  emojiName: string;
}

interface HigherLowerGameData {
  userId: string;
  username: string;
  avatarUrl: string;
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
  client: Client | null;
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

// Card suits and emoji names
const SUITS = [
  { name: 'Hearts', emojiName: 'hearts' },
  { name: 'Diamonds', emojiName: 'diamonds' },
  { name: 'Clubs', emojiName: 'clubs' },
  { name: 'Spades', emojiName: 'spades' },
];

// Card ranks and values - centered around middle values to make predictions harder
const RANKS = [
  { name: '5', value: 5 },
  { name: '6', value: 6 },
  { name: '7', value: 7 },
  { name: '8', value: 8 },
  { name: '9', value: 9 },
  { name: '10', value: 10 },
  { name: 'J', value: 11 },
  { name: 'Q', value: 12 },
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
        emojiName: cardEmojiKey(suit.emojiName, rank.name),
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

const SUIT_SYMBOLS: Record<string, string> = {
  Hearts: '♥',
  Diamonds: '♦',
  Clubs: '♣',
  Spades: '♠',
};

const COLORS = {
  playing: 0x3498db,
  win: 0x2ecc71,
  loss: 0xe74c3c,
  push: 0xf1c40f,
  cashout: 0xffd700,
};

function cardEmoji(card: Card): string {
  return (EMOJIS as Record<string, string>)[card.emojiName] ?? '';
}

/** K♠ */
function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit] ?? ''}`;
}

export class HigherLowerGame {
  private state: HigherLowerState = 'idle';
  private data: HigherLowerGameData;
  private gameTimeout: NodeJS.Timeout | null = null;
  // True while a click is being processed, so a double-click can't draw two cards
  private busy = false;

  constructor(userId: string, username: string, betAmount: number, channelId: string, guildId: string | undefined, client: Client | null = null, avatarUrl: string = '') {
    this.data = {
      userId,
      username,
      avatarUrl,
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
      client,
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
      await message.reply(`Not enough coins. You need ${coins(this.data.betAmount)} (you have ${coins(coinInfo.balance)}).`);
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

    // Draw first card
    this.data.currentCard = this.data.deck.pop()!;

    let sentMessage: Message;
    try {
      sentMessage = await message.reply({
        embeds: [this.createGameEmbed()],
        components: [this.createGameButtons()],
      });
    } catch (error) {
      // The game could not be posted: give the wager back so nothing is lost.
      this.state = 'complete';
      await awardCoins(this.data.userId, this.data.betAmount, 'higherlower', {
        reason: 'Higher or Lower refund',
        description: 'Could not post the game',
      }).catch((refundError) => console.error('[Refund] Failed:', refundError));
      throw error;
    }

    this.data.messageId = sentMessage.id;
    this.data.message = sentMessage;

    this.armTimeout();
  }

  /**
   * Handle button interactions
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    // Verify user
    if (interaction.user.id !== this.data.userId) {
      await nope(interaction, 'This is not your game!');
      return;
    }

    if (this.busy) {
      await interaction.deferUpdate().catch(() => {});
      return;
    }

    this.busy = true;
    try {
      switch (interaction.customId) {
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
          await nope(interaction, 'Unknown action.');
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * Handle player prediction
   */
  private async handlePrediction(interaction: MessageComponentInteraction, prediction: 'higher' | 'lower'): Promise<void> {
    if (this.state !== 'playing') {
      await nope(interaction, 'This game is over.');
      return;
    }

    // Draw next card
    const nextCard = this.data.deck.pop();
    if (!nextCard) {
      // Deck exhausted - auto cashout (or refund if nothing was won yet)
      await this.handleCashout(interaction);
      return;
    }

    // Store previous card
    this.data.previousCard = this.data.currentCard;
    this.data.currentCard = nextCard;

    // Compare cards
    const result = this.compareCards(this.data.previousCard!, this.data.currentCard);

    // Same rank: nobody wins, nobody loses, carry on with the new card
    if (result === 'push') {
      await respond(interaction, {
        embeds: [this.createGameEmbed('push')],
        components: [this.createGameButtons()],
      });
      return;
    }

    if (prediction === result) {
      // Correct prediction
      this.data.streak++;
      this.data.currentPayout = calculatePayout(this.data.betAmount, this.data.streak);

      await respond(interaction, {
        embeds: [this.createGameEmbed('correct')],
        components: [this.createGameButtons()],
      });
    } else {
      // Incorrect prediction - game over
      await this.endGame(interaction);
    }
  }

  /**
   * Handle cash out
   */
  private async handleCashout(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'playing') {
      await nope(interaction, 'This game is over.');
      return;
    }

    if (this.data.streak < 1) {
      await nope(interaction, 'Get at least one right before cashing out!');
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
      // Payout failed: put the game back so the player can try again instead of losing the bet.
      this.state = 'playing';
      this.armTimeout();
      await nope(interaction, 'Could not pay out right now. Try cashing out again.');
      return;
    }

    await respond(interaction, {
      embeds: [this.createCashoutEmbed()],
      components: [],
    });
  }

  /**
   * End the game (loss)
   */
  private async endGame(interaction: MessageComponentInteraction): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();

    await respond(interaction, {
      embeds: [this.createLossEmbed()],
      components: [],
    });
  }

  /**
   * Handle game timeout
   */
  private async timeoutGame(message: Message): Promise<void> {
    if (this.state !== 'playing') return;
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

    const embed = new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl || undefined })
      .setDescription(`${EMOJIS.alarm1} **Timed out** · ${coins(this.data.betAmount)} refunded`)
      .setColor(COLORS.loss);

    await message.edit({
      embeds: [embed],
      components: [],
    }).catch((error) => console.error('[HigherLower] Failed to edit timeout message:', error));
  }

  private armTimeout(): void {
    this.clearTimeout();
    this.gameTimeout = setTimeout(() => {
      if (this.data.message) {
        this.timeoutGame(this.data.message).catch((error) => console.error('[HigherLower] Timeout error:', error));
      }
    }, GAME_CONFIG.timeoutMs);
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
   * Check if game is finished. 'idle' counts too: if start() returned without
   * dealing, the game never began and must not block the player.
   */
  isFinished(): boolean {
    return this.state === 'idle' || this.state === 'complete' || this.state === 'cashout' || this.state === 'timeout';
  }

  // Embed creation methods

  /** previous + current card emojis and their labels, e.g. "<7♥><K♠> **7♥ → K♠**" */
  private cardsLine(): string {
    const cur = this.data.currentCard!;
    const prev = this.data.previousCard;
    if (!prev) {
      return `${cardEmoji(cur)} **${cardLabel(cur)}**`;
    }
    return `${cardEmoji(prev)}${cardEmoji(cur)}  **${cardLabel(prev)} → ${cardLabel(cur)}**`;
  }

  private createGameEmbed(status: 'correct' | 'push' | null = null): EmbedBuilder {
    let description: string;
    let color = COLORS.playing;

    if (status === 'correct') {
      description =
        `${this.cardsLine()}  ${TICK}\n\n` +
        `${EMOJIS.fire} **${this.data.streak}**  ·  ${mult(getMultiplier(this.data.streak))}  ·  ${coins(this.data.currentPayout)}`;
      color = COLORS.win;
    } else if (status === 'push') {
      description =
        `${this.cardsLine()}  ${EMOJIS.hand_emoji}  same rank\n\n` +
        `${EMOJIS.fire} **${this.data.streak}**  ·  ${mult(getMultiplier(this.data.streak))}  ·  ${coins(this.data.currentPayout)}`;
      color = COLORS.push;
    } else {
      description = `${this.cardsLine()}  ·  higher or lower?\n\n${coins(this.data.betAmount)}`;
    }

    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl || undefined })
      .setDescription(description)
      .setColor(color);
  }

  private createCashoutEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl || undefined })
      .setDescription(
        `${EMOJIS.moneybag}  **Cashed out**  ·  ${betWin(this.data.betAmount, this.data.currentPayout)}\n\n` +
        `${this.cardsLine()}\n\n${EMOJIS.fire} **${this.data.streak}**  ·  ${mult(getMultiplier(this.data.streak))}`
      )
      .setColor(COLORS.cashout);
  }

  private createLossEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl || undefined })
      .setDescription(
        `${this.cardsLine()}  ${CROSS}\n\n` +
        `${betWin(this.data.betAmount, 0)}` +
        (this.data.streak > 0 ? `  ·  ${EMOJIS.fire} **${this.data.streak}**` : '')
      )
      .setColor(COLORS.loss);
  }

  // Button creation methods

  private createGameButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('higherlower_higher')
        .setEmoji('⬆️')
        .setLabel('Higher')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('higherlower_lower')
        .setEmoji('⬇️')
        .setLabel('Lower')
        .setStyle(ButtonStyle.Primary)
    );

    // Add cash out button if streak >= 1
    if (this.data.streak >= 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('higherlower_cashout')
          .setEmoji(EMOJIS.moneybag)
          .setLabel('Cash out')
          .setStyle(ButtonStyle.Success)
      );
    }

    return row;
  }
}
