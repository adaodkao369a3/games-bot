import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { awardCoins, removeCoins } from '../services/coins.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { Card, createDeck, calculateHandTotal, isBlackjack, isBust, formatCard, formatHand } from './CardDeck.js';

type BlackjackState = 'idle' | 'playing' | 'dealer_turn' | 'complete' | 'timeout';

interface BlackjackGameData {
  userId: string;
  username: string;
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
}

// Game configuration
const GAME_CONFIG = {
  // Blackjack payout multiplier (3:2)
  blackjackMultiplier: 1.5,
  // Timeout in milliseconds
  timeoutMs: 5 * 60 * 1000, // 5 minutes
};

export class BlackjackGame {
  private state: BlackjackState = 'idle';
  private data: BlackjackGameData;
  private gameTimeout: NodeJS.Timeout | null = null;

  constructor(userId: string, username: string, betAmount: number, channelId: string, guildId: string | undefined) {
    this.data = {
      userId,
      username,
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
    this.data.messageId = message.id;
    this.data.message = message;

    // Deal initial cards
    this.data.playerHand.push(this.data.deck.pop()!);
    this.data.playerHand.push(this.data.deck.pop()!);
    this.data.dealerHand.push(this.data.deck.pop()!);
    this.data.dealerHand.push(this.data.deck.pop()!);

    // Check for natural blackjack
    if (isBlackjack(this.data.playerHand)) {
      await this.handleNaturalBlackjack();
      return;
    }

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
        await interaction.reply({
          content: 'Unknown action.',
          ephemeral: true,
        });
    }
  }

  /**
   * Handle HIT
   */
  private async handleHit(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'playing') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    // Draw card
    this.data.playerHand.push(this.data.deck.pop()!);

    // Check for bust
    if (isBust(this.data.playerHand)) {
      this.state = 'complete';
      this.clearTimeout();
      const embed = this.createBustEmbed();
      await interaction.update({
        embeds: [embed],
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
    const embed = this.createGameEmbed();
    const row = this.createGameButtons();
    await interaction.update({
      embeds: [embed],
      components: [row],
    });
  }

  /**
   * Handle STAND
   */
  private async handleStand(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'playing') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
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
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    // Only allow double on initial hand
    if (this.data.playerHand.length !== 2) {
      await interaction.reply({
        content: 'You can only double on your initial hand.',
        ephemeral: true,
      });
      return;
    }

    // Check if user has enough coins for double
    const coinInfo = await getCoinBalanceInfo(this.data.userId);
    if (!coinInfo || coinInfo.balance < this.data.betAmount) {
      await interaction.reply({
        content: 'You don\'t have enough coins to double down.',
        ephemeral: true,
      });
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
      await interaction.reply({
        content: 'Failed to process double down wager.',
        ephemeral: true,
      });
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
      const embed = this.createBustEmbed();
      await interaction.update({
        embeds: [embed],
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

    let result: 'win' | 'lose' | 'push';
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
      result = 'lose';
    } else if (playerTotal > dealerTotal) {
      result = 'win';
      payout = this.data.betAmount * 2;
    } else if (dealerTotal > playerTotal) {
      result = 'lose';
    } else {
      result = 'push';
      payout = this.data.betAmount;
    }

    if (result === 'win' || result === 'push') {
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

    const embed = this.createResultEmbed(result, payout, playerTotal, dealerTotal);
    await interaction.update({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Handle natural blackjack
   */
  private async handleNaturalBlackjack(): Promise<void> {
    this.state = 'complete';

    const dealerBlackjack = isBlackjack(this.data.dealerHand);
    let result: 'win' | 'push';
    let payout = 0;

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

    const embed = this.createResultEmbed(result, payout, calculateHandTotal(this.data.playerHand), calculateHandTotal(this.data.dealerHand));
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
      .setTitle('🃏 BLACKJACK')
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
    return this.state === 'complete' || this.state === 'timeout';
  }

  // Embed creation methods

  private createGameEmbed(): EmbedBuilder {
    const playerTotal = calculateHandTotal(this.data.playerHand);
    const dealerShowing = this.data.dealerHand[0].value;

    return new EmbedBuilder()
      .setTitle('🃏 BLACKJACK')
      .setDescription(`**YOUR HAND**\n${formatHand(this.data.playerHand)}\n**TOTAL: ${playerTotal}**\n\n` +
        `**DEALER**\n${formatHand(this.data.dealerHand, true)}\n**SHOWING: ${dealerShowing}**\n\n` +
        `**BET**\n${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>`)
      .setColor(0x3498db);
  }

  private createBustEmbed(): EmbedBuilder {
    const playerTotal = calculateHandTotal(this.data.playerHand);
    const dealerTotal = calculateHandTotal(this.data.dealerHand);

    return new EmbedBuilder()
      .setTitle('💥 BUST')
      .setDescription(`**YOUR HAND**\n${formatHand(this.data.playerHand)}\n**TOTAL: ${playerTotal}**\n\n` +
        `**DEALER**\n${formatHand(this.data.dealerHand)}\n**TOTAL: ${dealerTotal}**\n\n` +
        `**BET LOST**\n${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>`)
      .setColor(0xe74c3c);
  }

  private createResultEmbed(result: 'win' | 'lose' | 'push', payout: number, playerTotal: number, dealerTotal: number): EmbedBuilder {
    const title = result === 'win' ? '🎉 YOU WIN!' : result === 'lose' ? '💀 YOU LOSE' : '🤝 PUSH';
    const color = result === 'win' ? 0x00ff00 : result === 'lose' ? 0xe74c3c : 0xFFD700;

    let description = `**YOUR HAND**\n${formatHand(this.data.playerHand)}\n**TOTAL: ${playerTotal}**\n\n` +
      `**DEALER**\n${formatHand(this.data.dealerHand)}\n**TOTAL: ${dealerTotal}**\n\n` +
      `**BET**\n${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n`;

    if (result === 'win') {
      const netProfit = payout - this.data.betAmount;
      description += `**PAYOUT**\n+${payout.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `**NET PROFIT**\n+${netProfit.toLocaleString('en-US')} <:cash:1545149005544165416>`;
    } else if (result === 'lose') {
      description += `**AMOUNT LOST**\n${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>`;
    } else {
      description += `**RETURNED**\n${payout.toLocaleString('en-US')} <:cash:1545149005544165416>`;
    }

    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color);
  }

  // Button creation methods

  private createGameButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('bj_hit')
        .setLabel('HIT')
        .setStyle(ButtonStyle.Primary)
    );
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('bj_stand')
        .setLabel('STAND')
        .setStyle(ButtonStyle.Primary)
    );

    // Only allow double on initial hand
    if (this.data.playerHand.length === 2) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('bj_double')
          .setLabel('DOUBLE')
          .setStyle(ButtonStyle.Success)
      );
    }

    return row;
  }
}
