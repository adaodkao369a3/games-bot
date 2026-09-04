import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { awardCoins, removeCoins } from '../services/coins.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import { Card, createDeck, calculateHandTotal, isBlackjack, isBust, formatCard, formatHand } from './CardDeck.js';

type Blackjack2State = 'idle' | 'challenging' | 'playing' | 'dealer_turn' | 'complete' | 'declined' | 'timeout';

interface PlayerHand {
  userId: string;
  username: string;
  hand: Card[];
  betAmount: number;
  doubled: boolean;
  finished: boolean;
  result: 'win' | 'lose' | 'push' | 'bust' | null;
}

interface Blackjack2GameData {
  player1Id: string;
  player2Id: string;
  player1Name: string;
  player2Name: string;
  channelId: string;
  guildId: string | undefined;
  betAmount: number;
  player1Hand: PlayerHand;
  player2Hand: PlayerHand;
  dealerHand: Card[];
  deck: Card[];
  currentPlayer: 'player1' | 'player2' | null;
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
}

// Game configuration
const GAME_CONFIG = {
  // Blackjack payout multiplier (3:2)
  blackjackMultiplier: 1.5,
  // Timeout in milliseconds
  timeoutMs: 5 * 60 * 1000, // 5 minutes
  // Accept timeout in milliseconds
  acceptTimeoutMs: 2 * 60 * 1000, // 2 minutes
};

export class Blackjack2Game {
  private state: Blackjack2State = 'idle';
  private data: Blackjack2GameData;
  private gameTimeout: NodeJS.Timeout | null = null;
  private acceptTimeout: NodeJS.Timeout | null = null;

  constructor(player1Id: string, player2Id: string, player1Name: string, player2Name: string, betAmount: number, channelId: string, guildId: string | undefined) {
    this.data = {
      player1Id,
      player2Id,
      player1Name,
      player2Name,
      channelId,
      guildId,
      betAmount,
      player1Hand: {
        userId: player1Id,
        username: player1Name,
        hand: [],
        betAmount,
        doubled: false,
        finished: false,
        result: null,
      },
      player2Hand: {
        userId: player2Id,
        username: player2Name,
        hand: [],
        betAmount,
        doubled: false,
        finished: false,
        result: null,
      },
      dealerHand: [],
      deck: createDeck(),
      currentPlayer: null,
      messageId: null,
      message: null,
      gameInstanceId: `bj2_${player1Id}_${player2Id}_${Date.now()}`,
    };
  }

  /**
   * Start the 2-player blackjack challenge
   */
  async start(message: Message): Promise<void> {
    // Check if both players have enough coins
    const p1Balance = await getCoinBalanceInfo(this.data.player1Id);
    const p2Balance = await getCoinBalanceInfo(this.data.player2Id);

    if (!p1Balance || !p2Balance) {
      await message.reply('Unable to retrieve Bombo Coin balances. Please try again later.');
      return;
    }

    if (p1Balance.balance < this.data.betAmount || p2Balance.balance < this.data.betAmount) {
      await message.reply(
        `Both players need at least ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416> to play.\n` +
        `${this.data.player1Name}: ${p1Balance.balance.toLocaleString('en-US')} <:cash:1545149005544165416>\n` +
        `${this.data.player2Name}: ${p2Balance.balance.toLocaleString('en-US')} <:cash:1545149005544165416>`
      );
      return;
    }

    this.state = 'challenging';
    this.data.messageId = message.id;
    this.data.message = message;

    const initialEmbed = this.createChallengeEmbed();
    const row = this.createChallengeButtons();

    const sentMessage = await message.reply({
      embeds: [initialEmbed],
      components: [row],
    });

    this.data.messageId = sentMessage.id;
    this.data.message = sentMessage;

    // Set accept timeout
    this.acceptTimeout = setTimeout(() => {
      this.declineChallenge();
    }, GAME_CONFIG.acceptTimeoutMs);
  }

  /**
   * Handle button interactions
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    const customId = interaction.customId;

    switch (customId) {
      case 'bj2_accept':
        await this.handleAccept(interaction);
        break;
      case 'bj2_decline':
        await this.handleDecline(interaction);
        break;
      case 'bj2_hit':
        await this.handleHit(interaction);
        break;
      case 'bj2_stand':
        await this.handleStand(interaction);
        break;
      case 'bj2_double':
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
   * Handle ACCEPT
   */
  private async handleAccept(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'challenging') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    // Only player 2 can accept
    if (interaction.user.id !== this.data.player2Id) {
      await interaction.reply({
        content: 'Only the challenged player can accept.',
        ephemeral: true,
      });
      return;
    }

    this.clearAcceptTimeout();

    // Deduct both bets
    const p1Deduction = await removeCoins(
      this.data.player1Id,
      this.data.betAmount,
      'bj2',
      {
        reason: '2-Player Blackjack wager',
        description: 'Player 1 wager',
      }
    );

    const p2Deduction = await removeCoins(
      this.data.player2Id,
      this.data.betAmount,
      'bj2',
      {
        reason: '2-Player Blackjack wager',
        description: 'Player 2 wager',
      }
    );

    if (p1Deduction === null || p2Deduction === null) {
      await interaction.reply('Failed to process wagers. Please try again.');
      await this.refundBothPlayers();
      return;
    }

    this.state = 'playing';

    // Deal cards
    this.data.player1Hand.hand.push(this.data.deck.pop()!);
    this.data.player1Hand.hand.push(this.data.deck.pop()!);
    this.data.player2Hand.hand.push(this.data.deck.pop()!);
    this.data.player2Hand.hand.push(this.data.deck.pop()!);
    this.data.dealerHand.push(this.data.deck.pop()!);
    this.data.dealerHand.push(this.data.deck.pop()!);

    // Player 1 starts
    this.data.currentPlayer = 'player1';

    // Check for natural blackjacks
    const p1Blackjack = isBlackjack(this.data.player1Hand.hand);
    const p2Blackjack = isBlackjack(this.data.player2Hand.hand);

    if (p1Blackjack) {
      this.data.player1Hand.finished = true;
    }
    if (p2Blackjack) {
      this.data.player2Hand.finished = true;
    }

    if (p1Blackjack && p2Blackjack) {
      // Both have blackjack - go to dealer
      await this.playDealer(interaction);
      return;
    }

    if (p1Blackjack) {
      // Player 1 has blackjack, move to player 2
      this.data.currentPlayer = 'player2';
    }

    const embed = this.createGameEmbed();
    const row = this.createGameButtons();
    await interaction.update({
      embeds: [embed],
      components: [row],
    });

    // Set game timeout
    this.gameTimeout = setTimeout(() => {
      this.timeoutGame();
    }, GAME_CONFIG.timeoutMs);
  }

  /**
   * Handle DECLINE
   */
  private async handleDecline(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'challenging') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    // Only player 2 can decline
    if (interaction.user.id !== this.data.player2Id) {
      await interaction.reply({
        content: 'Only the challenged player can decline.',
        ephemeral: true,
      });
      return;
    }

    await this.declineChallenge(interaction);
  }

  /**
   * Decline challenge
   */
  private async declineChallenge(interaction?: MessageComponentInteraction): Promise<void> {
    this.state = 'declined';
    this.clearAcceptTimeout();

    const embed = new EmbedBuilder()
      .setTitle('🃏 2-PLAYER BLACKJACK')
      .setDescription(`**${this.data.player2Name} declined the challenge.**`)
      .setColor(0xe74c3c);

    if (interaction) {
      await interaction.update({
        embeds: [embed],
        components: [],
      });
    } else {
      await this.data.message?.edit({
        embeds: [embed],
        components: [],
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

    // Verify it's this player's turn
    const currentHand = this.getCurrentHand();
    if (interaction.user.id !== currentHand.userId) {
      await interaction.reply({
        content: 'It\'s not your turn!',
        ephemeral: true,
      });
      return;
    }

    // Draw card
    currentHand.hand.push(this.data.deck.pop()!);

    // Check for bust
    if (isBust(currentHand.hand)) {
      currentHand.finished = true;
      currentHand.result = 'bust';
      await this.moveToNextPlayer(interaction);
      return;
    }

    // Check for 21
    if (calculateHandTotal(currentHand.hand) === 21) {
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

    // Verify it's this player's turn
    const currentHand = this.getCurrentHand();
    if (interaction.user.id !== currentHand.userId) {
      await interaction.reply({
        content: 'It\'s not your turn!',
        ephemeral: true,
      });
      return;
    }

    currentHand.finished = true;
    await this.moveToNextPlayer(interaction);
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

    // Verify it's this player's turn
    const currentHand = this.getCurrentHand();
    if (interaction.user.id !== currentHand.userId) {
      await interaction.reply({
        content: 'It\'s not your turn!',
        ephemeral: true,
      });
      return;
    }

    // Only allow double on initial hand
    if (currentHand.hand.length !== 2) {
      await interaction.reply({
        content: 'You can only double on your initial hand.',
        ephemeral: true,
      });
      return;
    }

    // Check if user has enough coins for double
    const coinInfo = await getCoinBalanceInfo(currentHand.userId);
    if (!coinInfo || coinInfo.balance < this.data.betAmount) {
      await interaction.reply({
        content: 'You don\'t have enough coins to double down.',
        ephemeral: true,
      });
      return;
    }

    // Deduct additional bet
    const deduction = await removeCoins(
      currentHand.userId,
      this.data.betAmount,
      'bj2',
      {
        reason: '2-Player Blackjack double down',
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

    currentHand.betAmount *= 2;
    currentHand.doubled = true;

    // Draw one card and stand
    currentHand.hand.push(this.data.deck.pop()!);

    // Check for bust
    if (isBust(currentHand.hand)) {
      currentHand.finished = true;
      currentHand.result = 'bust';
      await this.moveToNextPlayer(interaction);
      return;
    }

    currentHand.finished = true;
    await this.moveToNextPlayer(interaction);
  }

  /**
   * Move to next player
   */
  private async moveToNextPlayer(interaction: MessageComponentInteraction): Promise<void> {
    // Check if both players are finished
    if (this.data.player1Hand.finished && this.data.player2Hand.finished) {
      await this.playDealer(interaction);
      return;
    }

    // Switch to other player
    if (this.data.currentPlayer === 'player1') {
      this.data.currentPlayer = 'player2';
    } else {
      this.data.currentPlayer = 'player1';
    }

    // Skip if already finished
    const nextHand = this.getCurrentHand();
    if (nextHand.finished) {
      await this.moveToNextPlayer(interaction);
      return;
    }

    const embed = this.createGameEmbed();
    const row = this.createGameButtons();
    await interaction.update({
      embeds: [embed],
      components: [row],
    });
  }

  /**
   * Play dealer turn
   */
  private async playDealer(interaction: MessageComponentInteraction): Promise<void> {
    this.state = 'dealer_turn';

    // Dealer hits on 16 or less, stands on 17 or higher
    while (calculateHandTotal(this.data.dealerHand) <= 16) {
      this.data.dealerHand.push(this.data.deck.pop()!);
    }

    await this.determineWinners(interaction);
  }

  /**
   * Determine winners for both players
   */
  private async determineWinners(interaction: MessageComponentInteraction): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();

    const dealerTotal = calculateHandTotal(this.data.dealerHand);
    const dealerBlackjack = isBlackjack(this.data.dealerHand);

    // Determine results for each player
    for (const hand of [this.data.player1Hand, this.data.player2Hand]) {
      if (hand.result === 'bust') continue;

      const playerTotal = calculateHandTotal(hand.hand);
      const playerBlackjack = isBlackjack(hand.hand);

      if (playerBlackjack && !dealerBlackjack) {
        hand.result = 'win';
      } else if (dealerBlackjack && !playerBlackjack) {
        hand.result = 'lose';
      } else if (isBust(this.data.dealerHand)) {
        hand.result = 'win';
      } else if (playerTotal > dealerTotal) {
        hand.result = 'win';
      } else if (dealerTotal > playerTotal) {
        hand.result = 'lose';
      } else {
        hand.result = 'push';
      }
    }

    // Award payouts
    for (const hand of [this.data.player1Hand, this.data.player2Hand]) {
      if (hand.result === 'bust') continue;

      let payout = 0;
      const playerBlackjack = isBlackjack(hand.hand);

      if (hand.result === 'win') {
        if (playerBlackjack) {
          payout = Math.floor(hand.betAmount * GAME_CONFIG.blackjackMultiplier);
        } else {
          payout = hand.betAmount * 2;
        }
      } else if (hand.result === 'push') {
        payout = hand.betAmount;
      }

      if (payout > 0) {
        await awardCoins(
          hand.userId,
          payout,
          'bj2',
          {
            reason: '2-Player Blackjack winnings',
            description: hand.result === 'win' ? 'Won blackjack' : 'Push',
            gameInstanceId: this.data.gameInstanceId,
          }
        );
      }
    }

    const embed = this.createResultEmbed();
    await interaction.update({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Get current player's hand
   */
  private getCurrentHand(): PlayerHand {
    return this.data.currentPlayer === 'player1' ? this.data.player1Hand : this.data.player2Hand;
  }

  /**
   * Refund both players
   */
  private async refundBothPlayers(): Promise<void> {
    await awardCoins(
      this.data.player1Id,
      this.data.betAmount,
      'bj2',
      {
        reason: '2-Player Blackjack refund',
        description: 'Game cancelled',
      }
    );
    await awardCoins(
      this.data.player2Id,
      this.data.betAmount,
      'bj2',
      {
        reason: '2-Player Blackjack refund',
        description: 'Game cancelled',
      }
    );
  }

  /**
   * Handle game timeout
   */
  private async timeoutGame(): Promise<void> {
    this.state = 'timeout';
    this.clearTimeout();
    this.clearAcceptTimeout();

    await this.refundBothPlayers();

    const embed = new EmbedBuilder()
      .setTitle('🃏 2-PLAYER BLACKJACK')
      .setDescription(`━━━━━━━━━━━━━━\n\n` +
        `**Game timed out.\n\n` +
        `Both players have been refunded.\n\n` +
        `━━━━━━━━━━━━━━`)
      .setColor(0xe74c3c);

    await this.data.message?.edit({
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
   * Clear accept timeout
   */
  private clearAcceptTimeout(): void {
    if (this.acceptTimeout) {
      clearTimeout(this.acceptTimeout);
      this.acceptTimeout = null;
    }
  }

  /**
   * Check if game is finished
   */
  isFinished(): boolean {
    return this.state === 'complete' || this.state === 'declined' || this.state === 'timeout';
  }

  // Embed creation methods

  private createChallengeEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('🃏 2-PLAYER BLACKJACK')
      .setDescription(`**${this.data.player1Name}**\nvs\n**${this.data.player2Name}**\n\n` +
        `**BET**\n${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416> each\n\n` +
        `*${this.data.player2Name} has been challenged to Blackjack.*`)
      .setColor(0x3498db);
  }

  private createGameEmbed(): EmbedBuilder {
    const dealerShowing = this.data.dealerHand[0].value;
    const p1Total = calculateHandTotal(this.data.player1Hand.hand);
    const p2Total = calculateHandTotal(this.data.player2Hand.hand);

    let description = `**DEALER**\n${formatHand(this.data.dealerHand, true)}\n**SHOWING: ${dealerShowing}**\n\n`;
    description += `━━━━━━━━━━━━━━\n\n`;
    description += `**${this.data.player1Name}**\n${formatHand(this.data.player1Hand.hand)}\n**TOTAL: ${p1Total}**\n\n`;
    description += `**BET**\n${this.data.player1Hand.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n`;
    description += `**STATUS**\n${this.data.currentPlayer === 'player1' ? 'Your turn' : this.data.player1Hand.finished ? 'Finished' : 'Waiting for ' + this.data.player2Name}\n\n`;
    description += `━━━━━━━━━━━━━━\n\n`;
    description += `**${this.data.player2Name}**\n${formatHand(this.data.player2Hand.hand)}\n**TOTAL: ${p2Total}**\n\n`;
    description += `**BET**\n${this.data.player2Hand.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n`;
    description += `**STATUS**\n${this.data.currentPlayer === 'player2' ? 'Your turn' : this.data.player2Hand.finished ? 'Finished' : 'Waiting for ' + this.data.player1Name}`;

    return new EmbedBuilder()
      .setTitle('🃏 2-PLAYER BLACKJACK')
      .setDescription(description)
      .setColor(0x3498db);
  }

  private createResultEmbed(): EmbedBuilder {
    const dealerTotal = calculateHandTotal(this.data.dealerHand);
    const p1Total = calculateHandTotal(this.data.player1Hand.hand);
    const p2Total = calculateHandTotal(this.data.player2Hand.hand);

    let description = `**DEALER**\n${formatHand(this.data.dealerHand)}\n**${dealerTotal}**\n\n`;
    description += `━━━━━━━━━━━━━━\n\n`;

    // Player 1 result
    const p1Result = this.data.player1Hand.result;
    const p1Emoji = p1Result === 'win' ? '🎉' : p1Result === 'lose' ? '💀' : p1Result === 'push' ? '🤝' : '💥';
    const p1Payout = p1Result === 'win' ? (isBlackjack(this.data.player1Hand.hand) ? Math.floor(this.data.player1Hand.betAmount * GAME_CONFIG.blackjackMultiplier) : this.data.player1Hand.betAmount * 2) : p1Result === 'push' ? this.data.player1Hand.betAmount : 0;
    
    description += `**${this.data.player1Name}**\n${formatHand(this.data.player1Hand.hand)}\n**${this.data.player1Hand.result === 'bust' ? 'BUST' : p1Total}**\n`;
    description += `${p1Emoji} **${p1Result?.toUpperCase()}**\n`;
    if (p1Payout > 0) {
      description += `+${p1Payout.toLocaleString('en-US')} <:cash:1545149005544165416>\n`;
    }
    description += `\n`;

    description += `━━━━━━━━━━━━━━\n\n`;

    // Player 2 result
    const p2Result = this.data.player2Hand.result;
    const p2Emoji = p2Result === 'win' ? '🎉' : p2Result === 'lose' ? '💀' : p2Result === 'push' ? '🤝' : '💥';
    const p2Payout = p2Result === 'win' ? (isBlackjack(this.data.player2Hand.hand) ? Math.floor(this.data.player2Hand.betAmount * GAME_CONFIG.blackjackMultiplier) : this.data.player2Hand.betAmount * 2) : p2Result === 'push' ? this.data.player2Hand.betAmount : 0;
    
    description += `**${this.data.player2Name}**\n${formatHand(this.data.player2Hand.hand)}\n**${this.data.player2Hand.result === 'bust' ? 'BUST' : p2Total}**\n`;
    description += `${p2Emoji} **${p2Result?.toUpperCase()}**\n`;
    if (p2Payout > 0) {
      description += `+${p2Payout.toLocaleString('en-US')} <:cash:1545149005544165416>\n`;
    }

    return new EmbedBuilder()
      .setTitle('🃏 BLACKJACK RESULTS')
      .setDescription(description)
      .setColor(0x3498db);
  }

  // Button creation methods

  private createChallengeButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('bj2_accept')
        .setLabel('ACCEPT')
        .setStyle(ButtonStyle.Success)
    ).addComponents(
      new ButtonBuilder()
        .setCustomId('bj2_decline')
        .setLabel('DECLINE')
        .setStyle(ButtonStyle.Danger)
    );
  }

  private createGameButtons(): ActionRowBuilder<ButtonBuilder> {
    const currentHand = this.getCurrentHand();
    const row = new ActionRowBuilder<ButtonBuilder>();
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('bj2_hit')
        .setLabel('HIT')
        .setStyle(ButtonStyle.Primary)
    );
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('bj2_stand')
        .setLabel('STAND')
        .setStyle(ButtonStyle.Primary)
    );

    // Only allow double on initial hand
    if (currentHand.hand.length === 2) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('bj2_double')
          .setLabel('DOUBLE')
          .setStyle(ButtonStyle.Success)
      );
    }

    return row;
  }
}
