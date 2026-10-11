import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { awardCoins, removeCoins, getCoinBalanceInfo } from '../services/coins.js';
import { EMOJIS } from '../utils/emoji-registry.js';
import { COIN, CROSS, TICK, coins, signedCoins, mult, respond, nope } from '../utils/casino-ui.js';

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

const COLORS = {
  playing: 0x3498db,
  win: 0x2ecc71,
  loss: 0xe74c3c,
  cashout: 0xffd700,
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

function sideEmoji(side: CoinSide): string {
  return side === 'HEADS' ? EMOJIS.heads : EMOJIS.tails;
}

export class CoinFlipGame {
  private state: CoinFlipState = 'idle';
  private data: CoinFlipGameData;
  private gameTimeout: NodeJS.Timeout | null = null;
  // True while a click is being processed, so a double-click can't flip twice
  private busy = false;

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
      await message.reply(`Not enough coins. You need ${coins(this.data.betAmount)} (you have ${coins(coinInfo.balance)}).`);
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

    const sentMessage = await message.reply({
      embeds: [this.createGameEmbed()],
      components: [this.createGameButtons()],
    });

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
      // A previous click is still being handled; just acknowledge this one.
      await interaction.deferUpdate().catch(() => {});
      return;
    }

    this.busy = true;
    try {
      const customId = interaction.customId;

      if (customId === 'cf_heads' || customId === 'cf_tails') {
        await this.handleFlip(interaction, customId === 'cf_heads' ? 'HEADS' : 'TAILS');
      } else if (customId === 'cf_cashout') {
        await this.handleCashout(interaction);
      } else {
        await nope(interaction, 'Unknown action.');
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * Handle flip button
   */
  private async handleFlip(interaction: MessageComponentInteraction, call: CoinSide): Promise<void> {
    if (this.state !== 'playing') {
      await nope(interaction, 'This game is over.');
      return;
    }

    // Flip the coin
    const result = flipCoin();
    const correct = call === result;

    this.data.lastCall = call;
    this.data.lastFlip = result;

    // Record flip in history
    this.data.flipHistory.push({
      round: this.data.flipHistory.length + 1,
      call,
      result,
      won: correct,
    });

    if (correct) {
      this.data.streak++;
      this.data.currentPayout = calculatePayout(this.data.betAmount, this.data.streak);

      await respond(interaction, {
        embeds: [this.createGameEmbed()],
        components: [this.createGameButtons()],
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
      await nope(interaction, 'This game is over.');
      return;
    }

    if (this.data.streak < 1) {
      await nope(interaction, 'Win at least one flip before cashing out!');
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
   * Handle loss
   */
  private async lose(interaction: MessageComponentInteraction): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();

    const flip = this.data.lastFlip!;
    const call = this.data.lastCall!;

    const description =
      `${sideEmoji(flip)} **${flip}** ${CROSS} · called **${call}**\n` +
      `${signedCoins(-this.data.betAmount)}` +
      (this.data.streak > 0 ? ` · ${EMOJIS.fire} **${this.data.streak}**` : '') +
      this.historyLine();

    const embed = new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(description)
      .setColor(COLORS.loss);

    await respond(interaction, {
      embeds: [embed],
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
      'cf',
      {
        reason: 'Coin Flip refund',
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
    }).catch((error) => console.error('[CoinFlip] Failed to edit timeout message:', error));
  }

  private armTimeout(): void {
    this.clearTimeout();
    this.gameTimeout = setTimeout(() => {
      if (this.data.message) {
        this.timeoutGame(this.data.message).catch((error) => console.error('[CoinFlip] Timeout error:', error));
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
   * ever moving to 'playing', the game never began and must not block the player.
   */
  isFinished(): boolean {
    return this.state === 'idle' || this.state === 'complete' || this.state === 'cashout' || this.state === 'timeout';
  }

  // Embed creation methods

  /** One row of coin emojis, oldest to newest. Only shown once there are 2+ flips. */
  private historyLine(): string {
    if (this.data.flipHistory.length < 2) return '';
    const recent = this.data.flipHistory.slice(-10).map((f) => sideEmoji(f.result)).join('');
    return `\n${recent}`;
  }

  private createGameEmbed(): EmbedBuilder {
    let description: string;

    if (this.data.lastFlip === null) {
      description = `${EMOJIS.coinflip} **Heads or tails?**\n${coins(this.data.betAmount)}`;
    } else {
      description =
        `${sideEmoji(this.data.lastFlip)} **${this.data.lastFlip}** ${TICK}\n` +
        `${EMOJIS.fire} **${this.data.streak}** · ${mult(getMultiplier(this.data.streak))} · ${coins(this.data.currentPayout)}` +
        this.historyLine();
    }

    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(description)
      .setColor(this.data.lastFlip === null ? COLORS.playing : COLORS.win);
  }

  private createCashoutEmbed(): EmbedBuilder {
    const netProfit = this.data.currentPayout - this.data.betAmount;

    const description =
      `${EMOJIS.moneybag} **Cashed out** ${signedCoins(netProfit)}\n` +
      `${EMOJIS.fire} **${this.data.streak}** · ${mult(getMultiplier(this.data.streak))}` +
      this.historyLine();

    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(description)
      .setColor(COLORS.cashout);
  }

  // Button creation methods

  private createGameButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('cf_heads')
        .setEmoji(EMOJIS.heads)
        .setLabel('Heads')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('cf_tails')
        .setEmoji(EMOJIS.tails)
        .setLabel('Tails')
        .setStyle(ButtonStyle.Primary)
    );

    // Add cash out button if at least one correct prediction
    if (this.data.streak >= 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('cf_cashout')
          .setEmoji(EMOJIS.moneybag)
          .setLabel('Cash out')
          .setStyle(ButtonStyle.Success)
      );
    }

    return row;
  }
}
