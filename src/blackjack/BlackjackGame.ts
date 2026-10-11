import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Client } from 'discord.js';
import { awardCoins, removeCoins, getCoinBalanceInfo } from '../services/coins.js';
import { Card, createDeck, calculateHandTotal, isBlackjack, isBust, formatHand } from './CardDeck.js';
import { EMOJIS } from '../utils/emoji-registry.js';
import { CROSS, TICK, coins, signedCoins, respond, nope } from '../utils/casino-ui.js';

type BlackjackState = 'idle' | 'playing' | 'dealer_turn' | 'complete' | 'timeout';

interface BlackjackGameData {
  userId: string;
  username: string;
  avatarUrl: string;
  channelId: string;
  guildId: string | undefined;
  betAmount: number;
  playerHand: Card[];
  dealerHand: Card[];
  deck: Card[];
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
  doubled: boolean;
  client: Client | null;
}

// Game configuration
const GAME_CONFIG = {
  // Blackjack payout multiplier (3:2)
  blackjackMultiplier: 1.5,
  // Timeout in milliseconds
  timeoutMs: 5 * 60 * 1000, // 5 minutes
};

const COLORS = {
  playing: 0x3498db,
  win: 0x2ecc71,
  lose: 0xe74c3c,
  push: 0xffd700,
};

type BlackjackResult = 'win' | 'lose' | 'push' | 'bust';

export class BlackjackGame {
  private state: BlackjackState = 'idle';
  private data: BlackjackGameData;
  private gameTimeout: NodeJS.Timeout | null = null;
  // True while a click is being processed, so a double-click can't draw two cards
  private busy = false;

  constructor(userId: string, username: string, avatarUrl: string, betAmount: number, channelId: string, guildId: string | undefined, client: Client | null = null) {
    this.data = {
      userId,
      username,
      avatarUrl,
      channelId,
      guildId,
      betAmount,
      playerHand: [],
      dealerHand: [],
      deck: createDeck(),
      messageId: null,
      message: null,
      gameInstanceId: `bj_${userId}_${Date.now()}`,
      doubled: false,
      client,
    };
  }

  /**
   * Start the blackjack game
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
      'bj',
      {
        reason: 'Blackjack wager',
        description: 'Single-player blackjack',
      }
    );

    if (deduction === null) {
      await message.reply('Failed to process your wager. Please try again.');
      return;
    }

    this.state = 'playing';

    // Deal initial cards
    this.data.playerHand.push(this.data.deck.pop()!);
    this.data.playerHand.push(this.data.deck.pop()!);
    this.data.dealerHand.push(this.data.deck.pop()!);
    this.data.dealerHand.push(this.data.deck.pop()!);

    // Natural blackjack: settle straight away, no buttons, no timeout
    if (isBlackjack(this.data.playerHand)) {
      const sent = await this.settleNaturalBlackjack(message);
      this.data.message = sent;
      return;
    }

    const sentMessage = await message.reply({
      embeds: [await this.createGameEmbed()],
      components: [this.createGameButtons()],
    });

    this.data.messageId = sentMessage.id;
    this.data.message = sentMessage;

    this.gameTimeout = setTimeout(() => {
      this.timeoutGame(sentMessage).catch((error) => console.error('[Blackjack] Timeout error:', error));
    }, GAME_CONFIG.timeoutMs);
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
        case 'bj_hit':
          await this.handleHit(interaction);
          break;
        case 'bj_stand':
          await this.handleStand(interaction);
          break;
        case 'bj_double':
          await this.handleDouble(interaction);
          break;
        default:
          await nope(interaction, 'Unknown action.');
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * Handle HIT
   */
  private async handleHit(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'playing') {
      await nope(interaction, 'This game is over.');
      return;
    }

    // Draw card
    this.data.playerHand.push(this.data.deck.pop()!);

    // Check for bust
    if (isBust(this.data.playerHand)) {
      this.state = 'complete';
      this.clearTimeout();
      await respond(interaction, {
        embeds: [await this.createResultEmbed('bust', 0)],
        components: [],
      });
      return;
    }

    // Check for 21
    if (calculateHandTotal(this.data.playerHand) === 21) {
      await this.handleStand(interaction);
      return;
    }

    // Continue playing
    await respond(interaction, {
      embeds: [await this.createGameEmbed()],
      components: [this.createGameButtons()],
    });
  }

  /**
   * Handle STAND
   */
  private async handleStand(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'playing') {
      await nope(interaction, 'This game is over.');
      return;
    }

    this.state = 'dealer_turn';
    await this.playDealer(interaction);
  }

  /**
   * Handle DOUBLE
   */
  private async handleDouble(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'playing') {
      await nope(interaction, 'This game is over.');
      return;
    }

    // Only allow double on initial hand
    if (this.data.playerHand.length !== 2) {
      await nope(interaction, 'You can only double on your first two cards.');
      return;
    }

    // Check if user has enough coins for double
    const coinInfo = await getCoinBalanceInfo(this.data.userId);
    if (!coinInfo || coinInfo.balance < this.data.betAmount) {
      await nope(interaction, "You don't have enough coins to double down.");
      return;
    }

    // Deduct additional bet
    const deduction = await removeCoins(
      this.data.userId,
      this.data.betAmount,
      'bj',
      {
        reason: 'Blackjack double down',
        description: 'Double down wager',
      }
    );

    if (deduction === null) {
      await nope(interaction, 'Failed to process the double down.');
      return;
    }

    this.data.betAmount *= 2;
    this.data.doubled = true;

    // Draw one card and stand
    this.data.playerHand.push(this.data.deck.pop()!);

    // Check for bust
    if (isBust(this.data.playerHand)) {
      this.state = 'complete';
      this.clearTimeout();
      await respond(interaction, {
        embeds: [await this.createResultEmbed('bust', 0)],
        components: [],
      });
      return;
    }

    // Stand
    this.state = 'dealer_turn';
    await this.playDealer(interaction);
  }

  /**
   * Play dealer turn
   */
  private async playDealer(interaction: MessageComponentInteraction): Promise<void> {
    // Dealer hits on 16 or less, stands on 17 or higher
    while (calculateHandTotal(this.data.dealerHand) <= 16) {
      this.data.dealerHand.push(this.data.deck.pop()!);
    }

    await this.determineWinner(interaction);
  }

  /**
   * Determine winner
   */
  private async determineWinner(interaction: MessageComponentInteraction): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();

    const playerTotal = calculateHandTotal(this.data.playerHand);
    const dealerTotal = calculateHandTotal(this.data.dealerHand);
    const playerBlackjack = isBlackjack(this.data.playerHand);
    const dealerBlackjack = isBlackjack(this.data.dealerHand);

    let result: BlackjackResult;
    let payout = 0;

    if (playerBlackjack && !dealerBlackjack) {
      result = 'win';
      payout = Math.floor(this.data.betAmount * GAME_CONFIG.blackjackMultiplier);
    } else if (dealerBlackjack && !playerBlackjack) {
      result = 'lose';
    } else if (isBust(this.data.dealerHand)) {
      result = 'win';
      payout = this.data.betAmount * 2;
    } else if (isBust(this.data.playerHand)) {
      result = 'bust';
    } else if (playerTotal > dealerTotal) {
      result = 'win';
      payout = this.data.betAmount * 2;
    } else if (dealerTotal > playerTotal) {
      result = 'lose';
    } else {
      result = 'push';
      payout = this.data.betAmount;
    }

    if (payout > 0) {
      await awardCoins(
        this.data.userId,
        payout,
        'bj',
        {
          reason: 'Blackjack winnings',
          description: result === 'win' ? 'Won blackjack' : 'Push',
          gameInstanceId: this.data.gameInstanceId,
        }
      );
    }

    await respond(interaction, {
      embeds: [await this.createResultEmbed(result, payout)],
      components: [],
    });
  }

  /**
   * Natural blackjack on the deal: pay out and show the result directly.
   */
  private async settleNaturalBlackjack(message: Message): Promise<Message> {
    this.state = 'complete';

    const dealerBlackjack = isBlackjack(this.data.dealerHand);
    let result: 'win' | 'push';
    let payout: number;

    if (dealerBlackjack) {
      result = 'push';
      payout = this.data.betAmount;
    } else {
      result = 'win';
      payout = Math.floor(this.data.betAmount * GAME_CONFIG.blackjackMultiplier);
    }

    await awardCoins(
      this.data.userId,
      payout,
      'bj',
      {
        reason: 'Blackjack winnings',
        description: result === 'win' ? 'Natural blackjack' : 'Push against dealer blackjack',
        gameInstanceId: this.data.gameInstanceId,
      }
    );

    return message.reply({
      embeds: [await this.createResultEmbed(result, payout)],
      components: [],
    });
  }

  /**
   * Handle game timeout
   */
  private async timeoutGame(message: Message): Promise<void> {
    // Only an unfinished game may time out (never refund a game that already paid out)
    if (this.state !== 'playing') return;
    this.state = 'timeout';
    this.clearTimeout();

    // Refund bet on timeout
    await awardCoins(
      this.data.userId,
      this.data.betAmount,
      'bj',
      {
        reason: 'Blackjack refund',
        description: 'Game timeout',
      }
    );

    const embed = new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(`${EMOJIS.alarm1} **Timed out** · ${coins(this.data.betAmount)} refunded`)
      .setColor(COLORS.lose);

    await message.edit({
      embeds: [embed],
      components: [],
    }).catch((error) => console.error('[Blackjack] Failed to edit timeout message:', error));
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
   * dealing, the game never began and must not block the player.
   */
  isFinished(): boolean {
    return this.state === 'idle' || this.state === 'complete' || this.state === 'timeout';
  }

  // Embed creation methods

  private async createGameEmbed(): Promise<EmbedBuilder> {
    const playerTotal = calculateHandTotal(this.data.playerHand);
    const dealerShowing = this.data.dealerHand[0].value === 1 ? 11 : this.data.dealerHand[0].value;

    const playerCards = await formatHand(this.data.playerHand, false);
    const dealerCards = await formatHand(this.data.dealerHand, true);

    const description =
      `**You** · **${playerTotal}** · ${coins(this.data.betAmount)}\n` +
      `${playerCards}\n` +
      `**Dealer** · **${dealerShowing}**\n` +
      `${dealerCards}`;

    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(description)
      .setColor(COLORS.playing);
  }

  private async createResultEmbed(result: BlackjackResult, payout: number): Promise<EmbedBuilder> {
    const playerTotal = calculateHandTotal(this.data.playerHand);
    const dealerTotal = calculateHandTotal(this.data.dealerHand);
    const net = payout - this.data.betAmount;

    let headline: string;
    let color: number;

    if (result === 'win') {
      const label = isBlackjack(this.data.playerHand) ? 'BLACKJACK' : 'WIN';
      headline = `${TICK} **${label}** ${signedCoins(net)}`;
      color = COLORS.win;
    } else if (result === 'push') {
      headline = `${EMOJIS.hand_emoji} **PUSH** · ${coins(payout)} back`;
      color = COLORS.push;
    } else if (result === 'bust') {
      headline = `${EMOJIS.fire} **BUST** ${signedCoins(-this.data.betAmount)}`;
      color = COLORS.lose;
    } else {
      headline = `${CROSS} **LOSE** ${signedCoins(-this.data.betAmount)}`;
      color = COLORS.lose;
    }

    const playerCards = await formatHand(this.data.playerHand, false);
    const dealerCards = await formatHand(this.data.dealerHand, false);

    const description =
      `${headline}\n` +
      `**You** · **${playerTotal}**\n` +
      `${playerCards}\n` +
      `**Dealer** · **${dealerTotal}**\n` +
      `${dealerCards}`;

    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(description)
      .setColor(color);
  }

  // Button creation methods

  private createGameButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('bj_hit')
        .setEmoji(EMOJIS.cards)
        .setLabel('Hit')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('bj_stand')
        .setEmoji(EMOJIS.tick)
        .setLabel('Stand')
        .setStyle(ButtonStyle.Secondary)
    );

    // Only allow double on initial hand
    if (this.data.playerHand.length === 2) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('bj_double')
          .setEmoji(EMOJIS.two)
          .setLabel('Double')
          .setStyle(ButtonStyle.Success)
      );
    }

    return row;
  }
}
