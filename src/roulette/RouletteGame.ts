import { Message, MessageComponentInteraction, ModalSubmitInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder, TextInputBuilder, TextInputStyle, ModalBuilder } from 'discord.js';
import { awardCoins, removeCoins, getCoinBalanceInfo } from '../services/coins.js';
import { getEmoji } from '../utils/emoji-resolver.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { renderWheel, pocketIndexFromAngle, angleForPocket } from './RouletteWheelRenderer.js';
import { RouletteBet, isWinningBet, describeBet, payoutMultiplier, getNumberColor, WHEEL_ORDER } from './roulette-logic.js';

type RouletteState = 'selecting' | 'spinning' | 'result' | 'complete' | 'timeout';

interface RouletteGameData {
  userId: string;
  username: string;
  avatarUrl: string;
  channelId: string;
  guildId: string | undefined;
  betAmount: number;
  currentBet: RouletteBet | null;
  result: number | null;
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
  gameId: string;
  spinCount: number;
  currentAngle: number;
  previousAngle: number;
  client: any;
}

const GAME_CONFIG = {
  timeoutMs: 5 * 60 * 1000, // 5 minutes
  animationDurationMs: 6000,
  frameCount: 10,
};

export class RouletteGame {
  private state: RouletteState = 'selecting';
  private data: RouletteGameData;
  private gameTimeout: NodeJS.Timeout | null = null;

  constructor(userId: string, username: string, avatarUrl: string, betAmount: number, channelId: string, guildId: string | undefined, client: any) {
    this.data = {
      userId,
      username,
      avatarUrl,
      channelId,
      guildId,
      betAmount,
      currentBet: null,
      result: null,
      messageId: null,
      message: null,
      gameInstanceId: `rlt_${userId}_${Date.now()}`,
      gameId: Math.random().toString(36).substring(2, 8),
      spinCount: 0,
      currentAngle: 0,
      previousAngle: 0,
      client,
    };
  }

  async start(message: Message, bet?: RouletteBet): Promise<void> {
    this.data.messageId = message.id;
    this.data.message = message;

    if (bet) {
      // Direct bet from command - spin immediately
      await this.startSpinFromMessage(message, bet);
    } else {
      // Show selection screen
      const embed = this.createSelectionEmbed();
      const rows = this.createSelectionButtons();

      const sentMessage = await message.reply({
        embeds: [embed],
        components: rows,
      });

      this.data.messageId = sentMessage.id;
      this.data.message = sentMessage;

      // Set timeout
      this.gameTimeout = setTimeout(() => {
        this.timeoutGame(sentMessage);
      }, GAME_CONFIG.timeoutMs);
    }
  }

  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    // Verify user
    if (interaction.user.id !== this.data.userId) {
      await interaction.reply({
        content: 'This is not your game!',
        ephemeral: true,
      });
      return;
    }

    // Verify gameId matches (prevent stale button clicks)
    const customId = interaction.customId;
    const parts = customId.split('_');
    if (parts.length < 3 || parts[2] !== this.data.gameId) {
      await interaction.reply({
        content: 'This roulette session has expired.',
        ephemeral: true,
      });
      return;
    }

    if (this.state === 'spinning') {
      await interaction.reply({
        content: 'The wheel is already spinning!',
        ephemeral: true,
      });
      return;
    }

    const action = parts[1];

    if (action === 'color_red') {
      await this.startSpin(interaction, { kind: 'color', value: 'red' });
    } else if (action === 'color_black') {
      await this.startSpin(interaction, { kind: 'color', value: 'black' });
    } else if (action === 'color_green') {
      await this.startSpin(interaction, { kind: 'color', value: 'green' });
    } else if (action === 'parity_odd') {
      await this.startSpin(interaction, { kind: 'parity', value: 'odd' });
    } else if (action === 'parity_even') {
      await this.startSpin(interaction, { kind: 'parity', value: 'even' });
    } else if (action === 'range_low') {
      await this.startSpin(interaction, { kind: 'range', value: 'low' });
    } else if (action === 'range_high') {
      await this.startSpin(interaction, { kind: 'range', value: 'high' });
    } else if (action === 'row_1') {
      await this.startSpin(interaction, { kind: 'row', value: 1 });
    } else if (action === 'row_2') {
      await this.startSpin(interaction, { kind: 'row', value: 2 });
    } else if (action === 'row_3') {
      await this.startSpin(interaction, { kind: 'row', value: 3 });
    } else if (action === 'dozen_1') {
      await this.startSpin(interaction, { kind: 'dozen', value: 1 });
    } else if (action === 'dozen_2') {
      await this.startSpin(interaction, { kind: 'dozen', value: 2 });
    } else if (action === 'dozen_3') {
      await this.startSpin(interaction, { kind: 'dozen', value: 3 });
    } else if (action === 'exact_number') {
      // Show modal for exact number
      const modal = new ModalBuilder()
        .setCustomId(`rlt_exact_${this.data.gameId}`)
        .setTitle('Exact Number Bet')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('number_input')
              .setLabel('Number (0–36)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('17')
              .setRequired(true)
              .setMaxLength(2)
          )
        );

      await interaction.showModal(modal);
    } else if (action === 'spin_again') {
      await this.startSpin(interaction, this.data.currentBet!);
    } else if (action === 'change_bet') {
      this.state = 'selecting';
      this.clearTimeout();

      const embed = this.createSelectionEmbed();
      const rows = this.createSelectionButtons();

      await interaction.update({
        embeds: [embed],
        components: rows,
      });

      // Reset timeout
      this.gameTimeout = setTimeout(() => {
        this.timeoutGame(this.data.message!);
      }, GAME_CONFIG.timeoutMs);
    }
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    // Verify user
    if (interaction.user.id !== this.data.userId) {
      await interaction.reply({
        content: 'This is not your game!',
        ephemeral: true,
      });
      return;
    }

    // Verify gameId
    const customId = interaction.customId;
    const parts = customId.split('_');
    if (parts.length < 3 || parts[2] !== this.data.gameId) {
      await interaction.reply({
        content: 'This roulette session has expired.',
        ephemeral: true,
      });
      return;
    }

    if (this.state !== 'selecting') {
      await interaction.reply({
        content: 'You cannot submit a number bet right now.',
        ephemeral: true,
      });
      return;
    }

    const numberInput = interaction.fields.getTextInputValue('number_input');
    const number = parseInt(numberInput, 10);

    // Validate number
    if (!/^\d+$/.test(numberInput) || isNaN(number) || number < 0 || number > 36) {
      await interaction.reply({
        content: 'Please enter a valid number between 0 and 36.',
        ephemeral: true,
      });
      return;
    }

    await this.startSpinFromModal(interaction, { kind: 'number', value: number });
  }

  private async startSpinFromMessage(message: Message, bet: RouletteBet): Promise<void> {
    // Synchronously set state
    this.state = 'spinning';
    this.data.currentBet = bet;

    // Immediately update to locked state
    const lockEmbed = new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setTitle('🎰 ROULETTE')
      .setDescription('🌀 Wheel spinning…')
      .setColor(0x3498db);

    const sentMessage = await message.reply({
      embeds: [lockEmbed],
      components: [],
    });

    this.data.messageId = sentMessage.id;
    this.data.message = sentMessage;

    await this.executeSpinWithMessage(sentMessage, bet);
  }

  private async startSpin(interaction: MessageComponentInteraction, bet: RouletteBet): Promise<void> {
    // Synchronously set state
    this.state = 'spinning';
    this.data.currentBet = bet;

    // Immediately update to locked state
    const lockEmbed = new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setTitle('🎰 ROULETTE')
      .setDescription('🌀 Wheel spinning…')
      .setColor(0x3498db);

    await interaction.update({
      embeds: [lockEmbed],
      components: [],
    });

    await this.executeSpinWithInteraction(interaction, bet);
  }

  private async startSpinFromModal(interaction: ModalSubmitInteraction, bet: RouletteBet): Promise<void> {
    // Synchronously set state
    this.state = 'spinning';
    this.data.currentBet = bet;

    // Immediately update to locked state
    const lockEmbed = new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setTitle('🎰 ROULETTE')
      .setDescription('🌀 Wheel spinning…')
      .setColor(0x3498db);

    await interaction.editReply({
      embeds: [lockEmbed],
      components: [],
    });

    await this.executeSpinWithInteraction(interaction, bet);
  }

  private async executeSpinWithMessage(message: Message, bet: RouletteBet): Promise<void> {
    // Re-check balance and deduct
    const coinInfo = await getCoinBalanceInfo(this.data.userId);
    if (!coinInfo || coinInfo.balance < this.data.betAmount) {
      this.state = 'selecting';
      const coinEmoji = await getEmoji(this.data.client, 'bombocoin');
      await message.edit({
        content: `You don't have enough Bombo Coins for this bet! You need ${this.data.betAmount.toLocaleString('en-US')} ${coinEmoji}.`,
      });
      return;
    }

    const instanceId = `rlt_${this.data.userId}_${Date.now()}_${this.data.spinCount}`;
    const deduction = await removeCoins(
      this.data.userId,
      this.data.betAmount,
      'rlt',
      {
        reason: 'Roulette wager',
        description: `Bet on ${describeBet(bet)}`,
        gameInstanceId: instanceId,
      }
    );

    if (deduction === null) {
      this.state = 'selecting';
      const embed = this.createSelectionEmbed();
      const rows = this.createSelectionButtons();
      await message.edit({
        embeds: [embed],
        components: rows,
      });
      return;
    }

    try {
      // Generate result
      const result = Math.floor(Math.random() * 37);
      this.data.result = result;

      // Calculate win/loss
      const won = isWinningBet(bet, result);
      const multiplier = payoutMultiplier(bet);
      const payout = won ? Math.floor(this.data.betAmount * multiplier) : 0;

      // Credit winnings if won
      if (won && payout > 0) {
        const payoutInstanceId = `rlt_${this.data.userId}_${Date.now()}_${this.data.spinCount}_payout`;
        const awardResult = await awardCoins(
          this.data.userId,
          payout,
          'rlt',
          {
            reason: 'Roulette winnings',
            description: `Won on ${describeBet(bet)} with result ${result}`,
            gameInstanceId: payoutInstanceId,
          }
        );

        if (awardResult === null) {
          // Refund if payout fails
          const refundInstanceId = `rlt_${this.data.userId}_${Date.now()}_${this.data.spinCount}_refund`;
          await awardCoins(
            this.data.userId,
            this.data.betAmount,
            'rlt',
            {
              reason: 'Roulette refund',
              description: 'Payout failed',
              gameInstanceId: refundInstanceId,
            }
          );
          throw new Error('Payout failed, refunded wager');
        }
      }

      // Update spin count and angle
      this.data.spinCount++;
      const startAngle = this.data.previousAngle;
      const targetIndex = WHEEL_ORDER.indexOf(result);
      const finalAngle = angleForPocket(targetIndex, startAngle, 5);
      this.data.previousAngle = finalAngle;

      // Run animation
      await this.runAnimationWithMessage(message, startAngle, finalAngle, result);

      // Show result
      await this.showResultWithMessage(message, result, won, payout);

      this.state = 'result';
      this.clearTimeout();

      // Reset timeout for result state
      this.gameTimeout = setTimeout(() => {
        this.timeoutGame(this.data.message!);
      }, GAME_CONFIG.timeoutMs);
    } catch (error) {
      console.error('[Roulette] Spin error:', error);
      // Refund on error
      const refundInstanceId = `rlt_${this.data.userId}_${Date.now()}_${this.data.spinCount}_refund`;
      await awardCoins(
        this.data.userId,
        this.data.betAmount,
        'rlt',
        {
          reason: 'Roulette refund',
          description: 'Error during spin',
          gameInstanceId: refundInstanceId,
        }
      ).catch(() => {});

      this.state = 'selecting';
      const embed = this.createSelectionEmbed();
      const rows = this.createSelectionButtons();
      await message.edit({
        embeds: [embed],
        components: rows,
      });
    }
  }

  private async executeSpinWithInteraction(interaction: MessageComponentInteraction | ModalSubmitInteraction, bet: RouletteBet): Promise<void> {
    // Re-check balance and deduct
    const coinInfo = await getCoinBalanceInfo(this.data.userId);
    if (!coinInfo || coinInfo.balance < this.data.betAmount) {
      this.state = this.data.previousAngle > 0 ? 'result' : 'selecting';
      const coinEmoji = await getEmoji(this.data.client, 'bombocoin');

      if (this.data.previousAngle > 0) {
        // Return to result screen with error note
        const balanceInfo = await getCoinBalanceInfo(this.data.userId);
        const newBalance = balanceInfo?.balance || 0;

        const result = this.data.result || 0;
        const won = false;
        const color = getNumberColor(result);
        const colorEmoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢';

        const description = `### Result\n# ${result}\n${colorEmoji} **${color.toUpperCase()}**\n\n` +
          `Your bet: \`${describeBet(this.data.currentBet!)}\` — Wager: ${coinEmoji} \`${this.data.betAmount.toLocaleString('en-US')}\`\n\n` +
          `**LOSS** ❌ — Lost ${coinEmoji} \`-${this.data.betAmount.toLocaleString('en-US')}\`\n\n` +
          `New balance: ${coinEmoji} \`${newBalance.toLocaleString('en-US')}\`\n\n` +
          `❌ Insufficient balance for Spin Again`;

        const embed = new EmbedBuilder()
          .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
          .setTitle('🎰 ROULETTE')
          .setDescription(description)
          .setColor(0xE74C3c)
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>();
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`rlt_change_bet_${this.data.gameId}`)
            .setLabel('Change Bet')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({
          embeds: [embed],
          components: [row],
        });
      } else {
        const embed = this.createSelectionEmbed();
        const rows = this.createSelectionButtons();
        await interaction.editReply({
          embeds: [embed],
          components: rows,
        });
      }
      return;
    }

    const instanceId = `rlt_${this.data.userId}_${Date.now()}_${this.data.spinCount}`;
    const deduction = await removeCoins(
      this.data.userId,
      this.data.betAmount,
      'rlt',
      {
        reason: 'Roulette wager',
        description: `Bet on ${describeBet(bet)}`,
        gameInstanceId: instanceId,
      }
    );

    if (deduction === null) {
      this.state = 'selecting';
      const embed = this.createSelectionEmbed();
      const rows = this.createSelectionButtons();
      await interaction.editReply({
        embeds: [embed],
        components: rows,
      });
      return;
    }

    try {
      // Generate result
      const result = Math.floor(Math.random() * 37);
      this.data.result = result;

      // Calculate win/loss
      const won = isWinningBet(bet, result);
      const multiplier = payoutMultiplier(bet);
      const payout = won ? Math.floor(this.data.betAmount * multiplier) : 0;

      // Credit winnings if won
      if (won && payout > 0) {
        const payoutInstanceId = `rlt_${this.data.userId}_${Date.now()}_${this.data.spinCount}_payout`;
        const awardResult = await awardCoins(
          this.data.userId,
          payout,
          'rlt',
          {
            reason: 'Roulette winnings',
            description: `Won on ${describeBet(bet)} with result ${result}`,
            gameInstanceId: payoutInstanceId,
          }
        );

        if (awardResult === null) {
          // Refund if payout fails
          const refundInstanceId = `rlt_${this.data.userId}_${Date.now()}_${this.data.spinCount}_refund`;
          await awardCoins(
            this.data.userId,
            this.data.betAmount,
            'rlt',
            {
              reason: 'Roulette refund',
              description: 'Payout failed',
              gameInstanceId: refundInstanceId,
            }
          );
          throw new Error('Payout failed, refunded wager');
        }
      }

      // Update spin count and angle
      this.data.spinCount++;
      const startAngle = this.data.previousAngle;
      const targetIndex = WHEEL_ORDER.indexOf(result);
      const finalAngle = angleForPocket(targetIndex, startAngle, 5);
      this.data.previousAngle = finalAngle;

      // Run animation
      await this.runAnimation(interaction, startAngle, finalAngle, result);

      // Show result
      await this.showResult(interaction, result, won, payout);

      this.state = 'result';
      this.clearTimeout();

      // Reset timeout for result state
      this.gameTimeout = setTimeout(() => {
        this.timeoutGame(this.data.message!);
      }, GAME_CONFIG.timeoutMs);
    } catch (error) {
      console.error('[Roulette] Spin error:', error);
      // Refund on error
      const refundInstanceId = `rlt_${this.data.userId}_${Date.now()}_${this.data.spinCount}_refund`;
      await awardCoins(
        this.data.userId,
        this.data.betAmount,
        'rlt',
        {
          reason: 'Roulette refund',
          description: 'Error during spin',
          gameInstanceId: refundInstanceId,
        }
      ).catch(() => {});

      this.state = 'selecting';
      const embed = this.createSelectionEmbed();
      const rows = this.createSelectionButtons();
      await interaction.editReply({
        embeds: [embed],
        components: rows,
      });
    }
  }

  private async runAnimationWithMessage(message: Message, startAngle: number, finalAngle: number, result: number): Promise<void> {
    const frameCount = GAME_CONFIG.frameCount;
    const duration = GAME_CONFIG.animationDurationMs;
    const startTime = Date.now();

    // Pre-render all frames
    const frames: Buffer[] = [];
    for (let i = 0; i < frameCount; i++) {
      const t = i / (frameCount - 1);
      const easedT = this.easeOutQuint(t);
      const angle = startAngle + (finalAngle - startAngle) * easedT;
      const pocketIndex = pocketIndexFromAngle(angle);
      const centerNumber = WHEEL_ORDER[pocketIndex];

      try {
        const buffer = await renderWheel({
          rotation: angle,
          size: 420,
          centerNumber,
        });
        frames.push(buffer);
      } catch (error) {
        console.error('[Roulette] Frame render error:', error);
        frames.push(Buffer.alloc(0)); // Placeholder
      }
    }

    // Send frames at calculated times
    for (let i = 0; i < frameCount; i++) {
      const targetTime = startTime + (i / (frameCount - 1)) * duration;
      const now = Date.now();
      const delay = Math.max(0, targetTime - now);

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const status = i < frameCount - 3 ? '🌀 Wheel spinning…' : '🐢 Wheel slowing…';
      const pocketIndex = pocketIndexFromAngle(startAngle + (finalAngle - startAngle) * (i / (frameCount - 1)));
      const centerNumber = WHEEL_ORDER[pocketIndex];

      const embed = new EmbedBuilder()
        .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
        .setTitle('🎰 ROULETTE')
        .setDescription(`${status}\n\n**${centerNumber}**`)
        .setColor(0x3498db);

      const attachment = new AttachmentBuilder(frames[i], {
        name: `wheel_${this.data.gameId}_${i}.png`,
      });

      try {
        if (i === 0) {
          await message.edit({
            embeds: [embed],
            files: [attachment],
          });
        } else {
          await message.edit({
            embeds: [embed],
            files: [attachment],
          });
        }
      } catch (error) {
        console.error('[Roulette] Frame edit error:', error);
        // Continue to next frame
      }
    }
  }

  private async showResultWithMessage(message: Message, result: number, won: boolean, payout: number): Promise<void> {
    const coinEmoji = await getEmoji(this.data.client, 'bombocoin');
    const bet = this.data.currentBet!;
    const netProfit = won ? payout - this.data.betAmount : -this.data.betAmount;
    const color = getNumberColor(result);
    const colorEmoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢';

    const balanceInfo = await getCoinBalanceInfo(this.data.userId);
    const newBalance = balanceInfo?.balance || 0;

    const description = `### Result\n# ${result}\n${colorEmoji} **${color.toUpperCase()}**\n\n` +
      `Your bet: \`${describeBet(bet)}\` — Wager: ${coinEmoji} \`${this.data.betAmount.toLocaleString('en-US')}\`\n\n` +
      (won 
        ? `**WIN** ✅ — Won ${coinEmoji} \`+${netProfit.toLocaleString('en-US')}\` (net)\n\n` +
          `New balance: ${coinEmoji} \`${newBalance.toLocaleString('en-US')}\``
        : `**LOSS** ❌ — Lost ${coinEmoji} \`-${this.data.betAmount.toLocaleString('en-US')}\`\n\n` +
          `New balance: ${coinEmoji} \`${newBalance.toLocaleString('en-US')}\``
      );

    const embed = new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setTitle('🎰 ROULETTE')
      .setDescription(description)
      .setColor(won ? 0x00FF00 : 0xE74C3c)
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_spin_again_${this.data.gameId}`)
        .setLabel('🎡 Spin Again')
        .setStyle(ButtonStyle.Primary)
    );
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_change_bet_${this.data.gameId}`)
        .setLabel('Change Bet')
        .setStyle(ButtonStyle.Secondary)
    );

    try {
      // Render final wheel image
      const finalBuffer = await renderWheel({
        rotation: this.data.previousAngle,
        size: 420,
        centerNumber: result,
      });

      const attachment = new AttachmentBuilder(finalBuffer, {
        name: `wheel_${this.data.gameId}_final.png`,
      });

      await message.edit({
        embeds: [embed],
        components: [row],
        files: [attachment],
      });
    } catch (error) {
      console.error('[Roulette] Result edit error:', error);
      // Fallback without image
      await message.edit({
        embeds: [embed],
        components: [row],
      });
    }
  }

  private async runAnimation(interaction: MessageComponentInteraction | ModalSubmitInteraction, startAngle: number, finalAngle: number, result: number): Promise<void> {
    const frameCount = GAME_CONFIG.frameCount;
    const duration = GAME_CONFIG.animationDurationMs;
    const startTime = Date.now();

    // Pre-render all frames
    const frames: Buffer[] = [];
    for (let i = 0; i < frameCount; i++) {
      const t = i / (frameCount - 1);
      const easedT = this.easeOutQuint(t);
      const angle = startAngle + (finalAngle - startAngle) * easedT;
      const pocketIndex = pocketIndexFromAngle(angle);
      const centerNumber = WHEEL_ORDER[pocketIndex];

      try {
        const buffer = await renderWheel({
          rotation: angle,
          size: 420,
          centerNumber,
        });
        frames.push(buffer);
      } catch (error) {
        console.error('[Roulette] Frame render error:', error);
        frames.push(Buffer.alloc(0)); // Placeholder
      }
    }

    // Send frames at calculated times
    for (let i = 0; i < frameCount; i++) {
      const targetTime = startTime + (i / (frameCount - 1)) * duration;
      const now = Date.now();
      const delay = Math.max(0, targetTime - now);

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const status = i < frameCount - 3 ? '🌀 Wheel spinning…' : '🐢 Wheel slowing…';
      const pocketIndex = pocketIndexFromAngle(startAngle + (finalAngle - startAngle) * (i / (frameCount - 1)));
      const centerNumber = WHEEL_ORDER[pocketIndex];

      const embed = new EmbedBuilder()
        .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
        .setTitle('🎰 ROULETTE')
        .setDescription(`${status}\n\n**${centerNumber}**`)
        .setColor(0x3498db);

      const attachment = new AttachmentBuilder(frames[i], {
        name: `wheel_${this.data.gameId}_${i}.png`,
      });

      try {
        if (i === 0) {
          await interaction.editReply({
            embeds: [embed],
            files: [attachment],
            attachments: [],
          });
        } else {
          await interaction.editReply({
            embeds: [embed],
            files: [attachment],
            attachments: [],
          });
        }
      } catch (error) {
        console.error('[Roulette] Frame edit error:', error);
        // Continue to next frame
      }
    }
  }

  private easeOutQuint(t: number): number {
    return 1 - Math.pow(1 - t, 5);
  }

  private async showResult(interaction: MessageComponentInteraction | ModalSubmitInteraction, result: number, won: boolean, payout: number): Promise<void> {
    const coinEmoji = await getEmoji(this.data.client, 'bombocoin');
    const bet = this.data.currentBet!;
    const netProfit = won ? payout - this.data.betAmount : -this.data.betAmount;
    const color = getNumberColor(result);
    const colorEmoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢';

    const balanceInfo = await getCoinBalanceInfo(this.data.userId);
    const newBalance = balanceInfo?.balance || 0;

    const description = `### Result\n# ${result}\n${colorEmoji} **${color.toUpperCase()}**\n\n` +
      `Your bet: \`${describeBet(bet)}\` — Wager: ${coinEmoji} \`${this.data.betAmount.toLocaleString('en-US')}\`\n\n` +
      (won 
        ? `**WIN** ✅ — Won ${coinEmoji} \`+${netProfit.toLocaleString('en-US')}\` (net)\n\n` +
          `New balance: ${coinEmoji} \`${newBalance.toLocaleString('en-US')}\``
        : `**LOSS** ❌ — Lost ${coinEmoji} \`-${this.data.betAmount.toLocaleString('en-US')}\`\n\n` +
          `New balance: ${coinEmoji} \`${newBalance.toLocaleString('en-US')}\``
      );

    const embed = new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setTitle('🎰 ROULETTE')
      .setDescription(description)
      .setColor(won ? 0x00FF00 : 0xE74C3c)
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_spin_again_${this.data.gameId}`)
        .setLabel('🎡 Spin Again')
        .setStyle(ButtonStyle.Primary)
    );
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_change_bet_${this.data.gameId}`)
        .setLabel('Change Bet')
        .setStyle(ButtonStyle.Secondary)
    );

    try {
      // Render final wheel image
      const finalBuffer = await renderWheel({
        rotation: this.data.previousAngle,
        size: 420,
        centerNumber: result,
      });

      const attachment = new AttachmentBuilder(finalBuffer, {
        name: `wheel_${this.data.gameId}_final.png`,
      });

      await interaction.editReply({
        embeds: [embed],
        components: [row],
        files: [attachment],
        attachments: [],
      });
    } catch (error) {
      console.error('[Roulette] Result edit error:', error);
      // Fallback without image
      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    }
  }

  private createSelectionEmbed(): EmbedBuilder {
    const coinEmoji = '<:bombocoin:1545139736312815840>';

    const paytable = `**Paytable:**\n` +
      `Red/Black/Odd/Even/1–18/19–36: 2x\n` +
      `Rows/Dozens: 3x\n` +
      `Exact Number/Green(0): 36x`;

    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setTitle('🎰 ROULETTE')
      .setDescription('European Roulette\n\n' +
        `Wager: ${coinEmoji} \`${this.data.betAmount.toLocaleString('en-US')}\`\n\n` +
        `Choose your bet:\n\n` +
        paytable)
      .setColor(0xFFD700)
      .setTimestamp();
  }

  private createSelectionButtons(): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    // Row 1: Colors and parity
    const row1 = new ActionRowBuilder<ButtonBuilder>();
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_color_red_${this.data.gameId}`)
        .setLabel('🔴 Red')
        .setStyle(ButtonStyle.Danger)
    );
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_color_black_${this.data.gameId}`)
        .setLabel('⚫ Black')
        .setStyle(ButtonStyle.Secondary)
    );
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_color_green_${this.data.gameId}`)
        .setLabel('🟢 Green (0)')
        .setStyle(ButtonStyle.Success)
    );
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_parity_odd_${this.data.gameId}`)
        .setLabel('Odd')
        .setStyle(ButtonStyle.Primary)
    );
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_parity_even_${this.data.gameId}`)
        .setLabel('Even')
        .setStyle(ButtonStyle.Primary)
    );
    rows.push(row1);

    // Row 2: Ranges
    const row2 = new ActionRowBuilder<ButtonBuilder>();
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_range_low_${this.data.gameId}`)
        .setLabel('1–18')
        .setStyle(ButtonStyle.Primary)
    );
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_range_high_${this.data.gameId}`)
        .setLabel('19–36')
        .setStyle(ButtonStyle.Primary)
    );
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_exact_number_${this.data.gameId}`)
        .setLabel('🔢 Exact Number')
        .setStyle(ButtonStyle.Success)
    );
    rows.push(row2);

    // Row 3: Rows
    const row3 = new ActionRowBuilder<ButtonBuilder>();
    row3.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_row_1_${this.data.gameId}`)
        .setLabel('1st Row')
        .setStyle(ButtonStyle.Primary)
    );
    row3.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_row_2_${this.data.gameId}`)
        .setLabel('2nd Row')
        .setStyle(ButtonStyle.Primary)
    );
    row3.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_row_3_${this.data.gameId}`)
        .setLabel('3rd Row')
        .setStyle(ButtonStyle.Primary)
    );
    rows.push(row3);

    // Row 4: Dozens
    const row4 = new ActionRowBuilder<ButtonBuilder>();
    row4.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_dozen_1_${this.data.gameId}`)
        .setLabel('1st Dozen')
        .setStyle(ButtonStyle.Primary)
    );
    row4.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_dozen_2_${this.data.gameId}`)
        .setLabel('2nd Dozen')
        .setStyle(ButtonStyle.Primary)
    );
    row4.addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_dozen_3_${this.data.gameId}`)
        .setLabel('3rd Dozen')
        .setStyle(ButtonStyle.Primary)
    );
    rows.push(row4);

    return rows;
  }

  private async timeoutGame(message: Message): Promise<void> {
    this.state = 'timeout';
    this.clearTimeout();

    const embed = new EmbedBuilder()
      .setTitle('🎰 ROULETTE')
      .setDescription('Game timed out.')
      .setColor(0xE74C3c);

    await message.edit({
      embeds: [embed],
      components: [],
    });
  }

  private clearTimeout(): void {
    if (this.gameTimeout) {
      clearTimeout(this.gameTimeout);
      this.gameTimeout = null;
    }
  }

  isFinished(): boolean {
    return this.state === 'complete' || this.state === 'timeout';
  }
}
