import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Client } from 'discord.js';
import { awardCoins, removeCoins, getCoinBalanceInfo } from '../services/coins.js';
import { Card, createDeck, calculateHandTotal, isBust, formatHand } from './CardDeck.js';
import { EMOJIS } from '../utils/emoji-registry.js';
import { CROSS, TICK, coins, num, betWin, respond, nope, COIN } from '../utils/casino-ui.js';

type Blackjack2State = 'idle' | 'challenging' | 'playing' | 'dealer_turn' | 'complete' | 'declined' | 'timeout';

interface PlayerHand {
  userId: string;
  username: string;
  avatarUrl: string;
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
  client: Client | null;
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

const COLORS = {
  playing: 0x3498db,
  done: 0xffd700,
  fail: 0xe74c3c,
};

export class Blackjack2Game {
  private state: Blackjack2State = 'idle';
  private data: Blackjack2GameData;
  private gameTimeout: NodeJS.Timeout | null = null;
  private acceptTimeout: NodeJS.Timeout | null = null;
  // True while a click is being processed, so two quick clicks can't both act
  private busy = false;

  constructor(player1Id: string, player2Id: string, player1Name: string, player2Name: string, player1AvatarUrl: string, player2AvatarUrl: string, betAmount: number, channelId: string, guildId: string | undefined, client: Client | null = null) {
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
        avatarUrl: player1AvatarUrl,
        hand: [],
        betAmount,
        doubled: false,
        finished: false,
        result: null,
      },
      player2Hand: {
        userId: player2Id,
        username: player2Name,
        avatarUrl: player2AvatarUrl,
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
      client,
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
        `Both players need ${coins(this.data.betAmount)} to play.\n` +
        `${this.data.player1Name}: ${coins(p1Balance.balance)} · ${this.data.player2Name}: ${coins(p2Balance.balance)}`
      );
      return;
    }

    this.state = 'challenging';

    const sentMessage = await message.reply({
      embeds: [this.createChallengeEmbed()],
      components: [this.createChallengeButtons()],
    });

    this.data.messageId = sentMessage.id;
    this.data.message = sentMessage;

    // Set accept timeout
    this.acceptTimeout = setTimeout(() => {
      this.declineChallenge().catch((error) => console.error('[Blackjack2] Accept timeout error:', error));
    }, GAME_CONFIG.acceptTimeoutMs);
  }

  /**
   * Handle button interactions
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    const userId = interaction.user.id;
    if (userId !== this.data.player1Id && userId !== this.data.player2Id) {
      await nope(interaction, 'You are not in this game.');
      return;
    }

    if (this.busy) {
      await interaction.deferUpdate().catch(() => {});
      return;
    }

    this.busy = true;
    try {
      switch (interaction.customId) {
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
          await nope(interaction, 'Unknown action.');
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * Handle ACCEPT
   */
  private async handleAccept(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'challenging') {
      await nope(interaction, 'This challenge is over.');
      return;
    }

    // Only player 2 can accept
    if (interaction.user.id !== this.data.player2Id) {
      await nope(interaction, 'Only the challenged player can accept.');
      return;
    }

    // Defer the interaction to avoid timeout
    await interaction.deferUpdate();

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
      // Only give money back to whoever was actually charged
      if (p1Deduction !== null) {
        await this.refund(this.data.player1Id, this.data.betAmount, 'Game cancelled');
      }
      if (p2Deduction !== null) {
        await this.refund(this.data.player2Id, this.data.betAmount, 'Game cancelled');
      }
      this.state = 'declined';
      const embed = new EmbedBuilder()
        .setDescription(`${CROSS} **Cancelled** · someone can't cover ${coins(this.data.betAmount)}`)
        .setColor(COLORS.fail);
      await interaction.editReply({ embeds: [embed], components: [] });
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

    await respond(interaction, {
      embeds: [await this.createGameEmbed()],
      components: [this.createGameButtons()],
    });

    // Set game timeout
    this.gameTimeout = setTimeout(() => {
      this.timeoutGame().catch((error) => console.error('[Blackjack2] Timeout error:', error));
    }, GAME_CONFIG.timeoutMs);
  }

  /**
   * Handle DECLINE
   */
  private async handleDecline(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'challenging') {
      await nope(interaction, 'This challenge is over.');
      return;
    }

    // Only player 2 can decline
    if (interaction.user.id !== this.data.player2Id) {
      await nope(interaction, 'Only the challenged player can decline.');
      return;
    }

    await this.declineChallenge(interaction);
  }

  /**
   * Decline challenge
   */
  private async declineChallenge(interaction?: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'challenging') return;
    this.state = 'declined';
    this.clearAcceptTimeout();

    const embed = new EmbedBuilder()
      .setDescription(`${CROSS} **${this.data.player2Name}** declined`)
      .setColor(COLORS.fail);

    if (interaction) {
      await respond(interaction, {
        embeds: [embed],
        components: [],
      });
    } else {
      await this.data.message?.edit({
        embeds: [embed],
        components: [],
      }).catch((error) => console.error('[Blackjack2] Failed to edit decline message:', error));
    }
  }

  /**
   * Make sure it's this user's turn. Returns the hand, or null after telling them off.
   */
  private async checkTurn(interaction: MessageComponentInteraction): Promise<PlayerHand | null> {
    if (this.state !== 'playing') {
      await nope(interaction, 'This game is over.');
      return null;
    }

    const currentHand = this.getCurrentHand();
    if (interaction.user.id !== currentHand.userId) {
      await nope(interaction, "It's not your turn!");
      return null;
    }
    return currentHand;
  }

  /**
   * Handle HIT
   */
  private async handleHit(interaction: MessageComponentInteraction): Promise<void> {
    const currentHand = await this.checkTurn(interaction);
    if (!currentHand) return;

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
      currentHand.finished = true;
      await this.moveToNextPlayer(interaction);
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
    const currentHand = await this.checkTurn(interaction);
    if (!currentHand) return;

    currentHand.finished = true;
    await this.moveToNextPlayer(interaction);
  }

  /**
   * Handle DOUBLE
   */
  private async handleDouble(interaction: MessageComponentInteraction): Promise<void> {
    const currentHand = await this.checkTurn(interaction);
    if (!currentHand) return;

    // Only allow double on initial hand
    if (currentHand.hand.length !== 2) {
      await nope(interaction, 'You can only double on your first two cards.');
      return;
    }

    // Check if user has enough coins for double
    const coinInfo = await getCoinBalanceInfo(currentHand.userId);
    if (!coinInfo || coinInfo.balance < this.data.betAmount) {
      await nope(interaction, "You don't have enough coins to double down.");
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
      await nope(interaction, 'Failed to process the double down.');
      return;
    }

    currentHand.betAmount *= 2;
    currentHand.doubled = true;

    // Draw one card and stand
    currentHand.hand.push(this.data.deck.pop()!);

    if (isBust(currentHand.hand)) {
      currentHand.result = 'bust';
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

    // Switch to the other player (if the current one is still unfinished, e.g. never the case here, keep them)
    if (this.getCurrentHand().finished) {
      this.data.currentPlayer = this.data.currentPlayer === 'player1' ? 'player2' : 'player1';
    }

    await respond(interaction, {
      embeds: [await this.createGameEmbed()],
      components: [this.createGameButtons()],
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
   * Payout for a finished hand (0 for a loss/bust)
   */
  private payoutFor(hand: PlayerHand): number {
    if (hand.result === 'win') {
      return hand.betAmount * 2;
    }
    if (hand.result === 'push') {
      return hand.betAmount;
    }
    return 0;
  }

  /**
   * Determine winners for both players
   */
  private async determineWinners(interaction: MessageComponentInteraction): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();

    const dealerTotal = calculateHandTotal(this.data.dealerHand);

    // Determine results for each player
    for (const hand of [this.data.player1Hand, this.data.player2Hand]) {
      if (hand.result === 'bust') continue;

      const playerTotal = calculateHandTotal(hand.hand);

      if (isBust(this.data.dealerHand)) {
        hand.result = 'win';
      } else if (playerTotal > dealerTotal) {
        hand.result = 'win';
      } else if (dealerTotal > playerTotal) {
        hand.result = 'lose';
      } else {
        hand.result = 'push';
      }
    }

    // Award payouts. Each player needs their own transaction id: the id is unique
    // in the database, so sharing one id meant the second player was never paid.
    for (const hand of [this.data.player1Hand, this.data.player2Hand]) {
      const payout = this.payoutFor(hand);
      if (payout > 0) {
        await awardCoins(
          hand.userId,
          payout,
          'bj2',
          {
            reason: '2-Player Blackjack winnings',
            description: hand.result === 'win' ? 'Won' : 'Push',
            gameInstanceId: `${this.data.gameInstanceId}_${hand.userId}`,
          }
        );
      }
    }

    await respond(interaction, {
      embeds: [await this.createResultEmbed()],
      components: [],
    });
  }

  /**
   * Get current player's hand
   */
  private getCurrentHand(): PlayerHand {
    return this.data.currentPlayer === 'player1' ? this.data.player1Hand : this.data.player2Hand;
  }

  private async refund(userId: string, amount: number, description: string): Promise<void> {
    await awardCoins(userId, amount, 'bj2', {
      reason: '2-Player Blackjack refund',
      description,
    });
  }

  /**
   * Handle game timeout
   */
  private async timeoutGame(): Promise<void> {
    if (this.state !== 'playing') return;
    this.state = 'timeout';
    this.clearTimeout();
    this.clearAcceptTimeout();

    // Refund what each player actually put in (including doubles)
    await this.refund(this.data.player1Id, this.data.player1Hand.betAmount, 'Game timeout');
    await this.refund(this.data.player2Id, this.data.player2Hand.betAmount, 'Game timeout');

    const embed = new EmbedBuilder()
      .setDescription(`${EMOJIS.alarm1} **Timed out** · both players refunded`)
      .setColor(COLORS.fail);

    await this.data.message?.edit({
      embeds: [embed],
      components: [],
    }).catch((error) => console.error('[Blackjack2] Failed to edit timeout message:', error));
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
   * Check if game is finished. 'idle' counts too: if start() returned without
   * posting the challenge, the game never began and must not block the players.
   */
  isFinished(): boolean {
    return this.state === 'idle' || this.state === 'complete' || this.state === 'declined' || this.state === 'timeout';
  }

  // Embed creation methods

  private createChallengeEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setDescription(
        `${EMOJIS.cards}  **${this.data.player1Name}**  ${EMOJIS.swords}  **${this.data.player2Name}**\n\n` +
        `${coins(this.data.betAmount)} each\n\n` +
        `${this.data.player2Name}, accept?`
      )
      .setColor(COLORS.playing);
  }

  private playerStatus(hand: PlayerHand, key: 'player1' | 'player2'): string {
    if (hand.result === 'bust') return EMOJIS.fire;
    if (this.data.currentPlayer === key && !hand.finished) return EMOJIS.arrow_right;
    if (hand.finished) return TICK;
    return EMOJIS.statustyping;
  }

  private async createGameEmbed(): Promise<EmbedBuilder> {
    const dealerShowing = this.data.dealerHand[0].value === 1 ? 11 : this.data.dealerHand[0].value;
    const dealerCards = await formatHand(this.data.dealerHand, true);

    let description = `**Dealer**  ·  **${dealerShowing}**\n${dealerCards}\n\n`;

    for (const [key, hand] of [['player1', this.data.player1Hand], ['player2', this.data.player2Hand]] as const) {
      const total = calculateHandTotal(hand.hand);
      const cards = await formatHand(hand.hand, false);
      description += `${this.playerStatus(hand, key)} **${hand.username}**  ·  **${hand.result === 'bust' ? 'BUST' : total}**  ·  ${coins(hand.betAmount)}\n${cards}\n\n`;
    }

    return new EmbedBuilder()
      .setDescription(description.trimEnd())
      .setColor(COLORS.playing);
  }

  private async createResultEmbed(): Promise<EmbedBuilder> {
    const dealerTotal = calculateHandTotal(this.data.dealerHand);
    const dealerCards = await formatHand(this.data.dealerHand, false);

    let description = `**Dealer**  ·  **${isBust(this.data.dealerHand) ? 'BUST' : dealerTotal}**\n${dealerCards}\n\n`;

    for (const hand of [this.data.player1Hand, this.data.player2Hand]) {
      const total = calculateHandTotal(hand.hand);
      const cards = await formatHand(hand.hand, false);
      const payout = this.payoutFor(hand);
      const net = payout - hand.betAmount;

      let icon: string;
      let outcome: string;
      if (hand.result === 'win') {
        icon = TICK;
        outcome = betWin(hand.betAmount, payout);
      } else if (hand.result === 'push') {
        icon = EMOJIS.hand_emoji;
        outcome = 'push';
      } else if (hand.result === 'bust') {
        icon = EMOJIS.fire;
        outcome = betWin(hand.betAmount, 0);
      } else {
        icon = CROSS;
        outcome = betWin(hand.betAmount, 0);
      }

      description += `${icon} **${hand.username}**  ·  **${hand.result === 'bust' ? 'BUST' : total}**  ·  ${outcome}\n${cards}\n\n`;
    }

    return new EmbedBuilder()
      .setDescription(description.trimEnd())
      .setColor(COLORS.done);
  }

  // Button creation methods

  private createChallengeButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('bj2_accept')
        .setEmoji(EMOJIS.tick)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('bj2_decline')
        .setEmoji(EMOJIS.cross)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger)
    );
  }

  private createGameButtons(): ActionRowBuilder<ButtonBuilder> {
    const currentHand = this.getCurrentHand();
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('bj2_hit')
        .setEmoji(EMOJIS.cards)
        .setLabel('Hit')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('bj2_stand')
        .setEmoji(EMOJIS.tick)
        .setLabel('Stand')
        .setStyle(ButtonStyle.Secondary)
    );

    // Only allow double on initial hand
    if (currentHand.hand.length === 2) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('bj2_double')
          .setEmoji(EMOJIS.two)
          .setLabel('Double')
          .setStyle(ButtonStyle.Success)
      );
    }

    return row;
  }
}
