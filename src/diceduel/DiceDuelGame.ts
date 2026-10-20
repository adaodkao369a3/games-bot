import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { awardCoins, removeCoins, getCoinBalanceInfo } from '../services/coins.js';
import { EMOJIS } from '../utils/emoji-registry.js';
import { coins, betWin, respond, nope } from '../utils/casino-ui.js';

type DiceDuelState = 'idle' | 'challenging' | 'accepted' | 'rolling_p1' | 'rolling_p2' | 'round_result' | 'complete' | 'declined' | 'expired';

interface DiceDuelGameData {
  player1Id: string;
  player2Id: string;
  player1Name: string;
  player2Name: string;
  channelId: string;
  guildId: string | undefined;
  betAmount: number;
  player1Score: number;
  player2Score: number;
  currentRound: number;
  player1Roll: number | null;
  player2Roll: number | null;
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
  rollHistory: Array<{ round: number; p1Roll: number; p2Roll: number; winner: 'p1' | 'p2' | 'draw' }>;
}

const COLORS = {
  playing: 0x3498db,
  done: 0xffd700,
  fail: 0xe74c3c,
};

/** Dice faces 1-6 as custom number emojis */
const DIE_FACES = [EMOJIS.one, EMOJIS.one, EMOJIS.two, EMOJIS.three, EMOJIS.four, EMOJIS.five, EMOJIS.six];

function face(roll: number | null): string {
  return roll === null ? '—' : DIE_FACES[roll];
}

export class DiceDuelGame {
  private state: DiceDuelState = 'idle';
  private data: DiceDuelGameData;
  private gameTimeout: NodeJS.Timeout | null = null;
  private readonly GAME_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes without anyone rolling
  private readonly ACCEPT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes to accept
  private readonly WINNING_SCORE = 3;
  // True while a click is being processed, so two quick clicks can't both roll
  private busy = false;
  // Short description of the round that just finished, shown above the next roll
  private lastRound = '';

  constructor(player1Id: string, player2Id: string, betAmount: number, channelId: string, guildId: string | undefined, player1Name: string, player2Name: string) {
    this.data = {
      player1Id,
      player2Id,
      player1Name,
      player2Name,
      channelId,
      guildId,
      betAmount,
      player1Score: 0,
      player2Score: 0,
      currentRound: 1,
      player1Roll: null,
      player2Roll: null,
      messageId: null,
      message: null,
      gameInstanceId: `diceduel_${player1Id}_${player2Id}_${Date.now()}`,
      rollHistory: [],
    };
  }

  /**
   * Start the dice duel challenge
   */
  async start(message: Message): Promise<void> {
    // Check if both players have enough coins
    const p1Balance = await getCoinBalanceInfo(this.data.player1Id);
    const p2Balance = await getCoinBalanceInfo(this.data.player2Id);

    if (!p1Balance || p1Balance.balance < this.data.betAmount) {
      await message.reply(`**${this.data.player1Name}** doesn't have ${coins(this.data.betAmount)} for this bet.`);
      return;
    }

    if (!p2Balance || p2Balance.balance < this.data.betAmount) {
      await message.reply(`**${this.data.player2Name}** doesn't have ${coins(this.data.betAmount)} for this bet.`);
      return;
    }

    // Deduct bets from both players
    const p1Deduction = await removeCoins(
      this.data.player1Id,
      this.data.betAmount,
      'diceduel',
      {
        reason: 'Dice duel wager',
        description: `Challenged @${this.data.player2Id}`,
      }
    );

    if (p1Deduction === null) {
      await message.reply("Failed to process the challenger's wager. Please try again.");
      return;
    }

    const p2Deduction = await removeCoins(
      this.data.player2Id,
      this.data.betAmount,
      'diceduel',
      {
        reason: 'Dice duel wager',
        description: `Challenged by @${this.data.player1Id}`,
      }
    );

    if (p2Deduction === null) {
      // Refund Player 1 if Player 2's deduction failed
      await awardCoins(
        this.data.player1Id,
        this.data.betAmount,
        'diceduel',
        {
          reason: 'Dice duel refund',
          description: 'Opponent wager failed',
        }
      );
      await message.reply("Failed to process the opponent's wager. Please try again.");
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
    this.armTimeout(this.ACCEPT_TIMEOUT_MS);
  }

  /**
   * Handle button interactions
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    const userId = interaction.user.id;

    // Verify user is one of the players
    if (userId !== this.data.player1Id && userId !== this.data.player2Id) {
      await nope(interaction, 'You are not part of this duel!');
      return;
    }

    if (this.busy) {
      await interaction.deferUpdate().catch(() => {});
      return;
    }

    this.busy = true;
    try {
      switch (interaction.customId) {
        case 'diceduel_accept':
          await this.handleAccept(interaction);
          break;
        case 'diceduel_decline':
          await this.handleDecline(interaction);
          break;
        case 'diceduel_roll':
          await this.handleRoll(interaction);
          break;
        default:
          await nope(interaction, 'Unknown action.');
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * Handle accept button (only Player 2 can accept)
   */
  private async handleAccept(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'challenging') {
      await nope(interaction, 'This challenge is over.');
      return;
    }

    if (interaction.user.id !== this.data.player2Id) {
      await nope(interaction, 'Only the challenged player can accept this duel.');
      return;
    }

    // Start Player 1's turn
    this.state = 'rolling_p1';
    this.armTimeout(this.GAME_TIMEOUT_MS);

    await respond(interaction, {
      embeds: [this.createGameEmbed()],
      components: [this.createRollButtons()],
    });
  }

  /**
   * Handle decline button (only Player 2 can decline)
   */
  private async handleDecline(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'challenging') {
      await nope(interaction, 'This challenge is over.');
      return;
    }

    if (interaction.user.id !== this.data.player2Id) {
      await nope(interaction, 'Only the challenged player can decline this duel.');
      return;
    }

    this.state = 'declined';
    this.clearTimeout();

    // Refund both players
    await this.refundBothPlayers();

    await respond(interaction, {
      embeds: [this.createEndedEmbed(`${EMOJIS.cross} **${this.data.player2Name}** declined · ${coins(this.data.betAmount)} refunded`)],
      components: [],
    });
  }

  /**
   * Handle roll button
   */
  private async handleRoll(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'rolling_p1' && this.state !== 'rolling_p2') {
      await nope(interaction, 'No roll needed right now.');
      return;
    }

    const userId = interaction.user.id;

    // Verify it's the correct player's turn
    if (this.state === 'rolling_p1' && userId !== this.data.player1Id) {
      await nope(interaction, `It's ${this.data.player1Name}'s turn to roll!`);
      return;
    }

    if (this.state === 'rolling_p2' && userId !== this.data.player2Id) {
      await nope(interaction, `It's ${this.data.player2Name}'s turn to roll!`);
      return;
    }

    // Roll the die (1-6)
    const roll = Math.floor(Math.random() * 6) + 1;

    // Someone is playing, so push the inactivity timer back
    this.armTimeout(this.GAME_TIMEOUT_MS);

    if (this.state === 'rolling_p1') {
      this.data.player1Roll = roll;
      this.state = 'rolling_p2';

      await respond(interaction, {
        embeds: [this.createGameEmbed()],
        components: [this.createRollButtons()],
      });
    } else {
      this.data.player2Roll = roll;
      this.state = 'round_result';
      await this.resolveRound(interaction);
    }
  }

  /**
   * Resolve the round and determine winner
   */
  private async resolveRound(interaction: MessageComponentInteraction): Promise<void> {
    const p1Roll = this.data.player1Roll!;
    const p2Roll = this.data.player2Roll!;

    let roundWinner: 'p1' | 'p2' | 'draw' = 'draw';
    let special = '';

    // Check for special rolls
    if (p1Roll === 1 && p2Roll !== 1) {
      roundWinner = 'p2';
      special = `${EMOJIS.skull} bust`;
    } else if (p2Roll === 1 && p1Roll !== 1) {
      roundWinner = 'p1';
      special = `${EMOJIS.skull} bust`;
    } else if (p1Roll === 6 && p2Roll !== 6) {
      roundWinner = 'p1';
      special = `${EMOJIS.lightning} crit`;
    } else if (p2Roll === 6 && p1Roll !== 6) {
      roundWinner = 'p2';
      special = `${EMOJIS.lightning} crit`;
    } else if (p1Roll === p2Roll) {
      roundWinner = 'draw';
      special = 'draw';
    } else {
      // Normal roll comparison
      roundWinner = p1Roll > p2Roll ? 'p1' : 'p2';
    }

    // Update scores
    if (roundWinner === 'p1') {
      this.data.player1Score++;
    } else if (roundWinner === 'p2') {
      this.data.player2Score++;
    }

    // Add to roll history (only if not a draw)
    if (roundWinner !== 'draw') {
      this.data.rollHistory.push({
        round: this.data.currentRound,
        p1Roll,
        p2Roll,
        winner: roundWinner,
      });
    }

    const winnerName = roundWinner === 'p1' ? this.data.player1Name : roundWinner === 'p2' ? this.data.player2Name : null;
    this.lastRound =
      `${face(p1Roll)} vs ${face(p2Roll)} → ${winnerName ? `**${winnerName}**` : '**draw**'}` +
      (special && special !== 'draw' ? ` · ${special}` : '');

    // Check for match winner
    if (this.data.player1Score >= this.WINNING_SCORE || this.data.player2Score >= this.WINNING_SCORE) {
      await this.completeGame(interaction, roundWinner === 'p1' ? this.data.player1Id : this.data.player2Id);
      return;
    }

    // A draw replays the same round, otherwise move on
    if (roundWinner !== 'draw') {
      this.data.currentRound++;
    }
    this.data.player1Roll = null;
    this.data.player2Roll = null;
    this.state = 'rolling_p1';

    await respond(interaction, {
      embeds: [this.createGameEmbed()],
      components: [this.createRollButtons()],
    });
  }

  /**
   * Complete the game and award winnings
   */
  private async completeGame(interaction: MessageComponentInteraction, winnerId: string): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();

    const totalPot = this.data.betAmount * 2;

    // Award winnings to winner
    const awardResult = await awardCoins(
      winnerId,
      totalPot,
      'diceduel',
      {
        reason: 'Dice duel winnings',
        description: `Won against ${winnerId === this.data.player1Id ? this.data.player2Id : this.data.player1Id}`,
        gameInstanceId: this.data.gameInstanceId,
      }
    );

    if (awardResult === null) {
      await respond(interaction, {
        embeds: [this.createEndedEmbed(`${EMOJIS.warning} Could not pay out the winnings. Please tell an admin.`)],
        components: [],
      });
      return;
    }

    await respond(interaction, {
      embeds: [this.createResultEmbed(winnerId, totalPot)],
      components: [],
    });
  }

  /**
   * Handle game expiration (nobody accepted, or nobody rolled for a long time)
   */
  private async expireGame(): Promise<void> {
    if (this.isFinished()) return;
    this.state = 'expired';
    this.clearTimeout();

    // Refund both players
    await this.refundBothPlayers();

    await this.data.message?.edit({
      embeds: [this.createEndedEmbed(`${EMOJIS.alarm1} **Expired** · ${coins(this.data.betAmount)} refunded to both`)],
      components: [],
    }).catch((error) => console.error('[DiceDuel] Failed to edit expired message:', error));
  }

  /**
   * Refund both players
   */
  private async refundBothPlayers(): Promise<void> {
    await Promise.all([
      awardCoins(
        this.data.player1Id,
        this.data.betAmount,
        'diceduel',
        {
          reason: 'Dice duel refund',
          description: 'Challenge expired/declined',
        }
      ),
      awardCoins(
        this.data.player2Id,
        this.data.betAmount,
        'diceduel',
        {
          reason: 'Dice duel refund',
          description: 'Challenge expired/declined',
        }
      ),
    ]);
  }

  private armTimeout(ms: number): void {
    this.clearTimeout();
    this.gameTimeout = setTimeout(() => {
      this.expireGame().catch((error) => console.error('[DiceDuel] Expire error:', error));
    }, ms);
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
   * posting the challenge, the game never began and must not block the players.
   */
  isFinished(): boolean {
    return this.state === 'idle' || this.state === 'complete' || this.state === 'declined' || this.state === 'expired';
  }

  // Embed creation methods

  private createChallengeEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setDescription(
        `${EMOJIS.dice}  **${this.data.player1Name}**  ${EMOJIS.swords}  **${this.data.player2Name}**\n\n` +
        `${coins(this.data.betAmount)} each  ·  first to ${this.WINNING_SCORE}\n\n` +
        `${this.data.player2Name}, accept?`
      )
      .setColor(COLORS.playing);
  }

  private createGameEmbed(): EmbedBuilder {
    const turnName = this.state === 'rolling_p1' ? this.data.player1Name : this.data.player2Name;

    let description =
      `**${this.data.player1Name}**  **${this.data.player1Score}** – **${this.data.player2Score}**  **${this.data.player2Name}**\n\n`;

    if (this.lastRound && this.data.player1Roll === null) {
      description += `${this.lastRound}\n\n`;
    }

    description +=
      `${EMOJIS.dice}  ${face(this.data.player1Roll)}  vs  ${face(this.data.player2Roll)}\n\n` +
      `${EMOJIS.arrow_right}  **${turnName}** rolls`;

    return new EmbedBuilder()
      .setDescription(description)
      .setColor(COLORS.playing);
  }

  private createResultEmbed(winnerId: string, winnings: number): EmbedBuilder {
    const winnerName = winnerId === this.data.player1Id ? this.data.player1Name : this.data.player2Name;

    return new EmbedBuilder()
      .setDescription(
        `${EMOJIS.trophy}  **${winnerName}** wins  ·  ${betWin(this.data.betAmount, winnings)}\n\n` +
        `**${this.data.player1Name}**  **${this.data.player1Score}** – **${this.data.player2Score}**  **${this.data.player2Name}**\n\n` +
        `${this.lastRound}`
      )
      .setColor(COLORS.done);
  }

  private createEndedEmbed(text: string): EmbedBuilder {
    return new EmbedBuilder()
      .setDescription(text)
      .setColor(COLORS.fail);
  }

  // Button creation methods

  private createChallengeButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('diceduel_accept')
        .setEmoji(EMOJIS.tick)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('diceduel_decline')
        .setEmoji(EMOJIS.cross)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger)
    );
  }

  private createRollButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('diceduel_roll')
        .setEmoji(EMOJIS.dice)
        .setLabel('Roll')
        .setStyle(ButtonStyle.Primary)
    );
  }
}
