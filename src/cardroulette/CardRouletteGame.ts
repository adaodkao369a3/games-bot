import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Client } from 'discord.js';
import { awardCoins, removeCoins } from '../services/coins.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { getEmoji } from '../utils/emoji-resolver.js';

type CardRouletteState = 'idle' | 'playing' | 'complete' | 'cashout' | 'timeout';

interface CardOutcome {
  id: string;
  name: string;
  emoji: string;
  description: string;
  type: 'safe' | 'lose_turn' | 'double_turn' | 'elimination';
  weight: number;
  payoutModifier: number;
  terminal: boolean;
}

interface CardRouletteGameData {
  userId: string;
  username: string;
  channelId: string;
  guildId: string | undefined;
  betAmount: number;
  currentPayout: number;
  drawsSurvived: number;
  cardsDrawn: CardOutcome[];
  deck: CardOutcome[];
  currentCard: CardOutcome | null;
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
  skipNextDraw: boolean;
  extraDraw: boolean;
  client: Client | null;
}

// Game configuration
const GAME_CONFIG = {
  // Multipliers for draws survived: draws -> multiplier
  drawMultipliers: {
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
  // Default multiplier for draws beyond 10
  defaultMultiplier: 12.0,
  // Timeout in milliseconds
  timeoutMs: 5 * 60 * 1000, // 5 minutes
};

// Card outcome configuration
const CARD_OUTCOMES: CardOutcome[] = [
  {
    id: 'safe_1',
    name: 'Safe',
    emoji: '🟢',
    description: 'Nothing bad happens. You survive.',
    type: 'safe',
    weight: 50,
    payoutModifier: 1.0,
    terminal: false,
  },
  {
    id: 'lose_turn',
    name: 'Lose Turn',
    emoji: '⏭️',
    description: 'You lose your next draw.',
    type: 'lose_turn',
    weight: 15,
    payoutModifier: 1.0,
    terminal: false,
  },
  {
    id: 'double_turn',
    name: 'Double Turn',
    emoji: '🔁',
    description: 'You get an extra draw!',
    type: 'double_turn',
    weight: 10,
    payoutModifier: 1.0,
    terminal: false,
  },
  {
    id: 'elimination',
    name: 'Elimination',
    emoji: '💀',
    description: 'You have been eliminated!',
    type: 'elimination',
    weight: 25,
    payoutModifier: 0.0,
    terminal: true,
  },
];

/**
 * Create and shuffle a deck based on card weights
 */
function createDeck(): CardOutcome[] {
  const deck: CardOutcome[] = [];
  
  // Add cards based on weights
  for (const outcome of CARD_OUTCOMES) {
    for (let i = 0; i < outcome.weight; i++) {
      deck.push({ ...outcome });
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
 * Get multiplier for current draws survived
 */
function getMultiplier(drawsSurvived: number): number {
  if (drawsSurvived in GAME_CONFIG.drawMultipliers) {
    return GAME_CONFIG.drawMultipliers[drawsSurvived as keyof typeof GAME_CONFIG.drawMultipliers];
  }
  return GAME_CONFIG.defaultMultiplier;
}

/**
 * Calculate current payout based on bet and draws survived
 */
function calculatePayout(bet: number, drawsSurvived: number): number {
  const multiplier = getMultiplier(drawsSurvived);
  return Math.floor(bet * multiplier);
}

export class CardRouletteGame {
  private state: CardRouletteState = 'idle';
  private data: CardRouletteGameData;
  private gameTimeout: NodeJS.Timeout | null = null;

  constructor(userId: string, username: string, betAmount: number, channelId: string, guildId: string | undefined, client: Client | null = null) {
    this.data = {
      userId,
      username,
      channelId,
      guildId,
      betAmount,
      currentPayout: betAmount,
      drawsSurvived: 0,
      cardsDrawn: [],
      deck: createDeck(),
      currentCard: null,
      messageId: null,
      message: null,
      gameInstanceId: `croulette_${userId}_${Date.now()}`,
      skipNextDraw: false,
      extraDraw: false,
      client,
    };
  }

  /**
   * Start the card roulette game
   */
  async start(message: Message): Promise<void> {
    // Check if user has enough coins
    const coinInfo = await getCoinBalanceInfo(this.data.userId);
    if (!coinInfo) {
      await message.reply('Unable to retrieve your Bombo Coin balance. Please try again later.');
      return;
    }

    if (coinInfo.balance < this.data.betAmount) {
      const coinEmoji = await getEmoji(this.data.client, 'bombocoin');
      await message.reply(
        `You don't have enough Bombo Coins for this bet! You need ${this.data.betAmount.toLocaleString('en-US')} ${coinEmoji}.\n` +
        `Your current balance: ${coinInfo.balance.toLocaleString('en-US')} ${coinEmoji}`
      );
      return;
    }

    // Deduct bet
    const deduction = await removeCoins(
      this.data.userId,
      this.data.betAmount,
      'croulette',
      {
        reason: 'Card Roulette wager',
        description: 'Bet on card roulette',
      }
    );

    if (deduction === null) {
      await message.reply('Failed to process your wager. Please try again.');
      return;
    }

    this.state = 'playing';
    this.data.messageId = message.id;
    this.data.message = message;

    const initialEmbed = await this.createGameEmbed();
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
      case 'croulette_draw':
        await this.handleDraw(interaction);
        break;
      case 'croulette_cashout':
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
   * Handle draw button
   */
  private async handleDraw(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'playing') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    // Check if player should skip this turn
    if (this.data.skipNextDraw) {
      this.data.skipNextDraw = false;
      
      const embed = await this.createGameEmbed('⏭️ Turn skipped! Draw again.');
      const row = this.createGameButtons();

      await interaction.update({
        embeds: [embed],
        components: [row],
      });
      return;
    }

    // Draw card
    const card = this.data.deck.pop();
    if (!card) {
      // Deck exhausted - auto cashout
      await this.handleCashout(interaction);
      return;
    }

    this.data.currentCard = card;
    this.data.cardsDrawn.push(card);

    // Handle card outcome
    await this.handleCardOutcome(interaction, card);
  }

  /**
   * Handle card outcome
   */
  private async handleCardOutcome(interaction: MessageComponentInteraction, card: CardOutcome): Promise<void> {
    // Update payout based on card modifier
    this.data.currentPayout = calculatePayout(this.data.betAmount, this.data.drawsSurvived);

    if (card.terminal) {
      // Elimination - game over
      this.data.drawsSurvived++;
      await this.endGame(interaction, false);
      return;
    }

    // Non-terminal outcomes
    this.data.drawsSurvived++;

    if (card.type === 'lose_turn') {
      this.data.skipNextDraw = true;
      const embed = await this.createGameEmbed(`${card.emoji} ${card.name}: ${card.description}`);
      const row = this.createGameButtons();

      await interaction.update({
        embeds: [embed],
        components: [row],
      });
    } else if (card.type === 'double_turn') {
      this.data.extraDraw = true;
      const embed = await this.createGameEmbed(`${card.emoji} ${card.name}: ${card.description}`);
      const row = this.createGameButtons();

      await interaction.update({
        embeds: [embed],
        components: [row],
      });

      // Auto-draw again after a short delay
      setTimeout(async () => {
        if (this.state === 'playing' && this.data.extraDraw) {
          this.data.extraDraw = false;
          await this.handleDraw(interaction);
        }
      }, 1000);
    } else {
      // Safe card
      const embed = await this.createGameEmbed(`${card.emoji} ${card.name}: ${card.description}`);
      const row = this.createGameButtons();

      await interaction.update({
        embeds: [embed],
        components: [row],
      });
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

    if (this.data.drawsSurvived < 1) {
      await interaction.reply({
        content: 'You need to survive at least one draw to cash out!',
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
      'croulette',
      {
        reason: 'Card Roulette cash out',
        description: `Draws survived: ${this.data.drawsSurvived}`,
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

    const embed = await this.createCashoutEmbed();

    await interaction.update({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * End the game (elimination)
   */
  private async endGame(interaction: MessageComponentInteraction, won: boolean): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();

    if (!won) {
      const embed = await this.createEliminationEmbed();

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
      'croulette',
      {
        reason: 'Card Roulette refund',
        description: 'Game timeout',
      }
    );

    const embed = await this.createTimeoutEmbed();

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

  private async createGameEmbed(statusMessage: string = ''): Promise<EmbedBuilder> {
    const multiplier = getMultiplier(this.data.drawsSurvived);
    const coinEmoji = await getEmoji(this.data.client, 'bombocoin');
    
    let description = `**${this.data.betAmount.toLocaleString('en-US')}** ${coinEmoji} • **${this.data.drawsSurvived}** cards • **x${multiplier.toFixed(2)}**\n`;
    description += `Win: **${this.data.currentPayout.toLocaleString('en-US')}** ${coinEmoji}\n\n`;

    if (this.data.currentCard) {
      description += `${this.data.currentCard.emoji}\n\n`;
      description += `**${this.data.currentCard.name}**\n${this.data.currentCard.description}\n\n`;
    } else {
      description += `🎲 Draw a card\n\n`;
    }

    if (statusMessage) {
      description += `${statusMessage}\n\n`;
    }

    return new EmbedBuilder()
      .setTitle('🃏🔫 CARD ROULETTE')
      .setDescription(description)
      .setColor(0x3498db);
  }

  private async createCashoutEmbed(): Promise<EmbedBuilder> {
    const netProfit = this.data.currentPayout - this.data.betAmount;
    const multiplier = getMultiplier(this.data.drawsSurvived);
    const coinEmoji = await getEmoji(this.data.client, 'bombocoin');
    
    let description = `**${this.data.drawsSurvived}** cards survived • **x${multiplier.toFixed(2)}**\n\n`;
    description += `Cards: ${this.data.cardsDrawn.map(card => card.emoji).join(' ')}\n\n`;
    description += `Won: **${this.data.currentPayout.toLocaleString('en-US')}** ${coinEmoji}\n`;
    description += `Bet: **${this.data.betAmount.toLocaleString('en-US')}** ${coinEmoji}\n`;
    description += `Profit: **${netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString('en-US')}** ${coinEmoji}`;

    return new EmbedBuilder()
      .setTitle('💰 CASHED OUT!')
      .setDescription(description)
      .setColor(0xFFD700);
  }

  private async createEliminationEmbed(): Promise<EmbedBuilder> {
    const card = this.data.currentCard!;
    const coinEmoji = await getEmoji(this.data.client, 'bombocoin');
    
    return new EmbedBuilder()
      .setTitle('💀 ELIMINATED')
      .setDescription(`${card.emoji}\n\n` +
        `**${card.name}**\n${card.description}\n\n` +
        `**${this.data.drawsSurvived}** cards survived\n` +
        `Lost: **${this.data.betAmount.toLocaleString('en-US')}** ${coinEmoji}`)
      .setColor(0xe74c3c);
  }

  private async createTimeoutEmbed(): Promise<EmbedBuilder> {
    return new EmbedBuilder()
      .setTitle('🃏🔫 CARD ROULETTE')
      .setDescription(`Game timed out. Your bet has been refunded.`)
      .setColor(0xe74c3c);
  }

  // Button creation methods

  private createGameButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('croulette_draw')
        .setLabel('🎲 DRAW')
        .setStyle(ButtonStyle.Primary)
    );

    // Add cash out button if at least one draw survived
    if (this.data.drawsSurvived >= 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('croulette_cashout')
          .setLabel('💰 CASH OUT')
          .setStyle(ButtonStyle.Success)
      );
    }

    return row;
  }
}
