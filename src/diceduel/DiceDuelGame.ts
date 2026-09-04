import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { awardCoins, removeCoins } from '../services/coins.js';
import { getCoinBalanceInfo } from '../services/coins.js';

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

export class DiceDuelGame {
  private state: DiceDuelState = 'idle';
  private data: DiceDuelGameData;
  private gameTimeout: NodeJS.Timeout | null = null;
  private readonly GAME_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly ACCEPT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes to accept
  private readonly WINNING_SCORE = 3;

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
      await message.reply(`<@!${this.data.player1Id}> doesn't have enough coins for this bet.`);
      return;
    }

    if (!p2Balance || p2Balance.balance < this.data.betAmount) {
      await message.reply(`<@!${this.data.player2Id}> doesn't have enough coins for this bet.`);
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
      await message.reply('Failed to process Player 1\'s wager. Please try again.');
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
      await message.reply('Failed to process Player 2\'s wager. Please try again.');
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
    this.gameTimeout = setTimeout(() => {
      this.expireGame(sentMessage);
    }, this.ACCEPT_TIMEOUT_MS);
  }

  /**
   * Handle button interactions
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    const userId = interaction.user.id;

    // Verify user is one of the players
    if (userId !== this.data.player1Id && userId !== this.data.player2Id) {
      await interaction.reply({
        content: 'You are not part of this duel!',
        ephemeral: true,
      });
      return;
    }

    const customId = interaction.customId;

    switch (customId) {
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
        await interaction.reply({
          content: 'Unknown action.',
          ephemeral: true,
        });
    }
  }

  /**
   * Handle accept button (only Player 2 can accept)
   */
  private async handleAccept(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'challenging') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    if (interaction.user.id !== this.data.player2Id) {
      await interaction.reply({
        content: 'Only the challenged player can accept this duel.',
        ephemeral: true,
      });
      return;
    }

    this.state = 'accepted';
    this.clearTimeout();

    // Start Player 1's turn
    this.state = 'rolling_p1';

    const embed = this.createGameEmbed();
    const row = this.createRollButtons();

    await interaction.update({
      embeds: [embed],
      components: [row],
    });
  }

  /**
   * Handle decline button (only Player 2 can decline)
   */
  private async handleDecline(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'challenging') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    if (interaction.user.id !== this.data.player2Id) {
      await interaction.reply({
        content: 'Only the challenged player can decline this duel.',
        ephemeral: true,
      });
      return;
    }

    this.state = 'declined';
    this.clearTimeout();

    // Refund both players
    await this.refundBothPlayers();

    const embed = this.createDeclinedEmbed();

    await interaction.update({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Handle roll button
   */
  private async handleRoll(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'rolling_p1' && this.state !== 'rolling_p2') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;

    // Verify it's the correct player's turn
    if (this.state === 'rolling_p1' && userId !== this.data.player1Id) {
      await interaction.reply({
        content: 'It\'s Player 1\'s turn to roll!',
        ephemeral: true,
      });
      return;
    }

    if (this.state === 'rolling_p2' && userId !== this.data.player2Id) {
      await interaction.reply({
        content: 'It\'s Player 2\'s turn to roll!',
        ephemeral: true,
      });
      return;
    }

    // Roll the die (1-6)
    const roll = Math.floor(Math.random() * 6) + 1;

    if (this.state === 'rolling_p1') {
      this.data.player1Roll = roll;
      this.state = 'rolling_p2';
    } else {
      this.data.player2Roll = roll;
      this.state = 'round_result';
    }

    if (this.state === 'round_result') {
      await this.resolveRound(interaction);
    } else {
      const embed = this.createGameEmbed();
      const row = this.createRollButtons();

      await interaction.update({
        embeds: [embed],
        components: [row],
      });
    }
  }

  /**
   * Resolve the round and determine winner
   */
  private async resolveRound(interaction: MessageComponentInteraction): Promise<void> {
    const p1Roll = this.data.player1Roll!;
    const p2Roll = this.data.player2Roll!;

    let roundWinner: 'p1' | 'p2' | 'draw' = 'draw';
    let specialMessage = '';

    // Check for special rolls
    if (p1Roll === 1 && p2Roll !== 1) {
      roundWinner = 'p2';
      specialMessage = '💀 **BUST!**';
    } else if (p2Roll === 1 && p1Roll !== 1) {
      roundWinner = 'p1';
      specialMessage = '💀 **BUST!**';
    } else if (p1Roll === 6 && p2Roll !== 6) {
      roundWinner = 'p1';
      specialMessage = '⚡ **CRITICAL!**';
    } else if (p2Roll === 6 && p1Roll !== 6) {
      roundWinner = 'p2';
      specialMessage = '⚡ **CRITICAL!**';
    } else if (p1Roll === p2Roll) {
      roundWinner = 'draw';
      specialMessage = '**DRAW**';
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
        p1Roll: p1Roll,
        p2Roll: p2Roll,
        winner: roundWinner,
      });
    }

    // Check for match winner
    if (this.data.player1Score >= this.WINNING_SCORE || this.data.player2Score >= this.WINNING_SCORE) {
      await this.completeGame(interaction, roundWinner === 'p1' ? this.data.player1Id : this.data.player2Id);
      return;
    }

    // If draw, reroll same round
    if (roundWinner === 'draw') {
      this.data.player1Roll = null;
      this.data.player2Roll = null;
      this.state = 'rolling_p1';

      const embed = this.createGameEmbed(specialMessage);
      const row = this.createRollButtons();

      await interaction.update({
        embeds: [embed],
        components: [row],
      });
      return;
    }

    // Move to next round
    this.data.currentRound++;
    this.data.player1Roll = null;
    this.data.player2Roll = null;
    this.state = 'rolling_p1';

    const embed = this.createGameEmbed(specialMessage);
    const row = this.createRollButtons();

    await interaction.update({
      embeds: [embed],
      components: [row],
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
      await interaction.update({
        content: 'Failed to award winnings. Please contact support.',
        components: [],
      });
      return;
    }

    const embed = this.createResultEmbed(winnerId, totalPot);

    await interaction.update({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Handle game expiration
   */
  private async expireGame(message: Message): Promise<void> {
    this.state = 'expired';
    this.clearTimeout();

    // Refund both players
    await this.refundBothPlayers();

    const embed = this.createExpiredEmbed();

    await message.edit({
      embeds: [embed],
      components: [],
    });
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
    return this.state === 'complete' || this.state === 'declined' || this.state === 'expired';
  }

  // Embed creation methods

  private createChallengeEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('🎲 DICE DUEL')
      .setDescription('━━━━━━━━━━━━━━\n\n' +
        `**${this.data.player1Name}**\n` +
        `**${this.data.player2Name}**\n\n` +
        `**Wager:** ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        '*You\'ve been challenged to a Dice Duel.*')
      .setColor(0x3498db)
      .setFooter({ text: 'First to 3 round wins!' });
  }

  private createGameEmbed(specialMessage: string = ''): EmbedBuilder {
    const p1Roll = this.data.player1Roll !== null ? this.data.player1Roll : '—';
    const p2Roll = this.data.player2Roll !== null ? this.data.player2Roll : '—';

    let waitingText = '';
    if (this.state === 'rolling_p1') {
      waitingText = `*Waiting for ${this.data.player1Name} to roll...*`;
    } else if (this.state === 'rolling_p2') {
      waitingText = `*Waiting for ${this.data.player2Name} to roll...*`;
    }

    // Build roll history string
    let historyText = '';
    if (this.data.rollHistory.length > 0) {
      historyText = '\n**Roll History:**\n';
      this.data.rollHistory.forEach(entry => {
        const winnerName = entry.winner === 'p1' ? this.data.player1Name : this.data.player2Name;
        historyText += `R${entry.round}: ${this.data.player1Name}(${entry.p1Roll}) vs ${this.data.player2Name}(${entry.p2Roll}) → ${winnerName}\n`;
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎲 DICE DUEL')
      .setDescription('━━━━━━━━━━━━━━\n\n' +
        `**${this.data.player1Name}**\n` +
        `Score: **${this.data.player1Score}**\n\n` +
        `**${this.data.player2Name}**\n` +
        `Score: **${this.data.player2Score}**\n\n` +
        `**ROUND ${this.data.currentRound}**\n\n` +
        `🎲 **${this.data.player1Name}:** ${p1Roll}\n` +
        `🎲 **${this.data.player2Name}:** ${p2Roll}\n\n` +
        `${specialMessage}\n\n` +
        `${waitingText}\n\n` +
        '━━━━━━━━━━━━━━\n\n' +
        `${historyText}` +
        `**Wager:** ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>`)
      .setColor(0x3498db);

    return embed;
  }

  private createResultEmbed(winnerId: string, winnings: number): EmbedBuilder {
    const winnerName = winnerId === this.data.player1Id ? this.data.player1Name : this.data.player2Name;

    // Build roll history string
    let historyText = '';
    if (this.data.rollHistory.length > 0) {
      historyText = '\n**Roll History:**\n';
      this.data.rollHistory.forEach(entry => {
        const entryWinnerName = entry.winner === 'p1' ? this.data.player1Name : this.data.player2Name;
        historyText += `R${entry.round}: ${this.data.player1Name}(${entry.p1Roll}) vs ${this.data.player2Name}(${entry.p2Roll}) → ${entryWinnerName}\n`;
      });
    }

    return new EmbedBuilder()
      .setTitle('🎲 DICE DUEL')
      .setDescription('━━━━━━━━━━━━━━\n\n' +
        `🏆 **${winnerName} WINS!**\n\n` +
        `**Final Score**\n\n` +
        `**${this.data.player1Name}** — ${this.data.player1Score}\n` +
        `**${this.data.player2Name}** — ${this.data.player2Score}\n\n` +
        `💰 **Winnings:** +${winnings.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `*Bob has decided that ${winnerName} is legally better at rolling cubes.*\n\n` +
        '━━━━━━━━━━━━━━\n\n' +
        `${historyText}` +
        `**Wager:** ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>`)
      .setColor(0xFFD700);
  }

  private createDeclinedEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('🎲 DICE DUEL')
      .setDescription('━━━━━━━━━━━━━━\n\n' +
        `**${this.data.player2Name} declined the challenge.\n\n` +
        `Both players have been refunded their wagers.\n\n` +
        '━━━━━━━━━━━━━━\n\n' +
        `**Wager:** ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>`)
      .setColor(0xe74c3c);
  }

  private createExpiredEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('🎲 DICE DUEL')
      .setDescription('━━━━━━━━━━━━━━\n\n' +
        `**Challenge expired.\n\n` +
        `Both players have been refunded their wagers.\n\n` +
        '━━━━━━━━━━━━━━\n\n' +
        `**Wager:** ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>`)
      .setColor(0xe74c3c);
  }

  // Button creation methods

  private createChallengeButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('diceduel_accept')
        .setLabel('✅ ACCEPT')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('diceduel_decline')
        .setLabel('❌ DECLINE')
        .setStyle(ButtonStyle.Danger)
    );
  }

  private createRollButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('diceduel_roll')
        .setLabel('🎲 ROLL')
        .setStyle(ButtonStyle.Primary)
    );
  }
}
