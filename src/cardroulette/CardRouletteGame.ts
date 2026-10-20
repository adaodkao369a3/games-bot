import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Client } from 'discord.js';
import { awardCoins, removeCoins, getCoinBalanceInfo } from '../services/coins.js';
import { EMOJIS } from '../utils/emoji-registry.js';
import { CROSS, coins, signedCoins, betWin, mult, respond, nope } from '../utils/casino-ui.js';

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
  avatarUrl: string;
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
    emoji: '<:tick:1558430105120804884>',
    description: '',
    type: 'safe',
    weight: 50,
    payoutModifier: 1.0,
    terminal: false,
  },
  {
    id: 'lose_turn',
    name: 'Lose Turn',
    emoji: '<:rightarrow:1558430102755213405>',
    description: 'next draw skipped',
    type: 'lose_turn',
    weight: 15,
    payoutModifier: 1.0,
    terminal: false,
  },
  {
    id: 'double_turn',
    name: 'Double Turn',
    emoji: '<:two:1545379099394969660>',
    description: 'free extra draw',
    type: 'double_turn',
    weight: 10,
    payoutModifier: 1.0,
    terminal: false,
  },
  {
    id: 'elimination',
    name: 'Elimination',
    emoji: '<:cross:1558430092043096154>',
    description: '',
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

const COLORS = {
  playing: 0x3498db,
  safe: 0x2ecc71,
  loss: 0xe74c3c,
  cashout: 0xffd700,
};

export class CardRouletteGame {
  private state: CardRouletteState = 'idle';
  private data: CardRouletteGameData;
  private gameTimeout: NodeJS.Timeout | null = null;
  private autoDrawTimer: NodeJS.Timeout | null = null;
  // True while a click is being processed (or an automatic extra draw is pending)
  private busy = false;

  constructor(userId: string, username: string, avatarUrl: string, betAmount: number, channelId: string, guildId: string | undefined, client: Client | null = null) {
    this.data = {
      userId,
      username,
      avatarUrl,
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
      await message.reply(`Not enough coins. You need ${coins(this.data.betAmount)} (you have ${coins(coinInfo.balance)}).`);
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

    let sentMessage: Message;
    try {
      sentMessage = await message.reply({
        embeds: [this.createGameEmbed()],
        components: [this.createGameButtons()],
      });
    } catch (error) {
      // The game could not be posted: give the wager back so nothing is lost.
      this.state = 'complete';
      await awardCoins(this.data.userId, this.data.betAmount, 'croulette', {
        reason: 'Card Roulette refund',
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
        case 'croulette_draw':
          await this.handleDraw(interaction);
          break;
        case 'croulette_cashout':
          await this.handleCashout(interaction);
          break;
        default:
          await nope(interaction, 'Unknown action.');
      }
    } finally {
      // An automatic extra draw keeps the game locked until it has happened
      this.busy = this.autoDrawTimer !== null;
    }
  }

  /**
   * Show a new screen. Uses the interaction when there is a fresh one, otherwise edits the
   * game message directly (needed for the automatic extra draw, which has no new click).
   */
  private async show(
    interaction: MessageComponentInteraction | null,
    embed: EmbedBuilder,
    components: ActionRowBuilder<ButtonBuilder>[]
  ): Promise<void> {
    if (interaction && !interaction.replied && !interaction.deferred) {
      await respond(interaction, { embeds: [embed], components });
      return;
    }
    if (interaction && (interaction.replied || interaction.deferred)) {
      await interaction.editReply({ embeds: [embed], components });
      return;
    }
    await this.data.message?.edit({ embeds: [embed], components });
  }

  /**
   * Handle draw button (interaction is null for the automatic extra draw)
   */
  private async handleDraw(interaction: MessageComponentInteraction | null): Promise<void> {
    if (this.state !== 'playing') {
      if (interaction) await nope(interaction, 'This game is over.');
      return;
    }

    // Check if player should skip this turn
    if (this.data.skipNextDraw) {
      this.data.skipNextDraw = false;
      this.data.currentCard = null;
      await this.show(interaction, this.createGameEmbed('skipped'), [this.createGameButtons()]);
      return;
    }

    // Draw card
    const card = this.data.deck.pop();
    if (!card) {
      // Deck exhausted - auto cashout
      if (interaction) {
        await this.handleCashout(interaction);
      }
      return;
    }

    this.data.currentCard = card;
    this.data.cardsDrawn.push(card);

    await this.handleCardOutcome(interaction, card);
  }

  /**
   * Handle card outcome
   */
  private async handleCardOutcome(interaction: MessageComponentInteraction | null, card: CardOutcome): Promise<void> {
    if (card.terminal) {
      // Elimination - game over
      this.state = 'complete';
      this.clearTimeout();
      await this.show(interaction, this.createEliminationEmbed(), []);
      return;
    }

    // Survived this card: the payout follows the multiplier shown on screen
    this.data.drawsSurvived++;
    this.data.currentPayout = calculatePayout(this.data.betAmount, this.data.drawsSurvived);

    if (card.type === 'lose_turn') {
      this.data.skipNextDraw = true;
    }

    if (card.type === 'double_turn') {
      // Show the card with buttons locked, then draw again by itself
      this.data.extraDraw = true;
      await this.show(interaction, this.createGameEmbed(), [this.createGameButtons(true)]);

      this.autoDrawTimer = setTimeout(async () => {
        this.autoDrawTimer = null;
        try {
          if (this.state === 'playing' && this.data.extraDraw) {
            this.data.extraDraw = false;
            await this.handleDraw(null);
          }
        } catch (error) {
          console.error('[CardRoulette] Extra draw error:', error);
        } finally {
          this.busy = false;
        }
      }, 1200);
      return;
    }

    await this.show(interaction, this.createGameEmbed(), [this.createGameButtons()]);
  }

  /**
   * Handle cash out
   */
  private async handleCashout(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'playing') {
      await nope(interaction, 'This game is over.');
      return;
    }

    if (this.data.drawsSurvived < 1) {
      await nope(interaction, 'Survive at least one card before cashing out!');
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
      // Payout failed: put the game back so the player can try again instead of losing the bet.
      this.state = 'playing';
      this.armTimeout();
      await nope(interaction, 'Could not pay out right now. Try cashing out again.');
      return;
    }

    await this.show(interaction, this.createCashoutEmbed(), []);
  }

  /**
   * Handle game timeout
   */
  private async timeoutGame(message: Message): Promise<void> {
    if (this.state !== 'playing') return;
    this.state = 'timeout';
    this.clearTimeout();
    if (this.autoDrawTimer) {
      clearTimeout(this.autoDrawTimer);
      this.autoDrawTimer = null;
    }

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

    const embed = new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(`${EMOJIS.alarm1} **Timed out** · ${coins(this.data.betAmount)} refunded`)
      .setColor(COLORS.loss);

    await message.edit({
      embeds: [embed],
      components: [],
    }).catch((error) => console.error('[CardRoulette] Failed to edit timeout message:', error));
  }

  private armTimeout(): void {
    this.clearTimeout();
    this.gameTimeout = setTimeout(() => {
      if (this.data.message) {
        this.timeoutGame(this.data.message).catch((error) => console.error('[CardRoulette] Timeout error:', error));
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
   * Check if game is finished. 'idle' counts too: if start() returned without
   * posting the game, it never began and must not block the player.
   */
  isFinished(): boolean {
    return this.state === 'idle' || this.state === 'complete' || this.state === 'cashout' || this.state === 'timeout';
  }

  // Embed creation methods

  /** Everything drawn so far as a row of emojis (shown once there are 2+ cards) */
  private historyLine(): string {
    if (this.data.cardsDrawn.length < 2) return '';
    return `\n\n${this.data.cardsDrawn.slice(-12).map((c) => c.emoji).join('')}`;
  }

  private createGameEmbed(status: 'skipped' | null = null): EmbedBuilder {
    const stats = `${EMOJIS.cards} **${this.data.drawsSurvived}**  ·  ${mult(getMultiplier(this.data.drawsSurvived))}  ·  ${coins(this.data.currentPayout)}`;

    let description: string;
    let color = COLORS.playing;

    if (status === 'skipped') {
      description = `${EMOJIS.arrow_right}  **Turn skipped**  ·  draw again\n\n${stats}${this.historyLine()}`;
    } else if (this.data.currentCard) {
      const card = this.data.currentCard;
      description =
        `${card.emoji}  **${card.name}**${card.description ? `  ·  ${card.description}` : ''}\n\n` +
        `${stats}${this.historyLine()}`;
      color = COLORS.safe;
    } else {
      description = `${EMOJIS.card_back}  **Draw a card**\n\n${coins(this.data.betAmount)}`;
    }

    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(description)
      .setColor(color);
  }

  private createCashoutEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(
        `${EMOJIS.moneybag}  **Cashed out**  ·  ${betWin(this.data.betAmount, this.data.currentPayout)}\n\n` +
        `${EMOJIS.cards} **${this.data.drawsSurvived}**  ·  ${mult(getMultiplier(this.data.drawsSurvived))}${this.historyLine()}`
      )
      .setColor(COLORS.cashout);
  }

  private createEliminationEmbed(): EmbedBuilder {
    const card = this.data.currentCard!;

    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(
        `${card.emoji}  **${card.name.toUpperCase()}**  ${CROSS}  ·  ${betWin(this.data.betAmount, 0)}\n\n` +
        `${EMOJIS.cards} survived **${this.data.drawsSurvived}**${this.historyLine()}`
      )
      .setColor(COLORS.loss);
  }

  // Button creation methods

  private createGameButtons(disabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('croulette_draw')
        .setEmoji(EMOJIS.cards)
        .setLabel('Draw')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    );

    // Add cash out button if at least one draw survived
    if (this.data.drawsSurvived >= 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('croulette_cashout')
          .setEmoji(EMOJIS.moneybag)
          .setLabel('Cash out')
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled)
      );
    }

    return row;
  }
}
