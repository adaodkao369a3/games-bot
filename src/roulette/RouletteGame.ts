import { Message, MessageComponentInteraction, MessageEditOptions, ModalSubmitInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder, TextInputBuilder, TextInputStyle, ModalBuilder } from 'discord.js';
import { awardCoins, removeCoins, getCoinBalanceInfo } from '../services/coins.js';
import { EMOJIS } from '../utils/emoji-registry.js';
import { CROSS, TICK, coins, signedCoins, nope } from '../utils/casino-ui.js';
import { renderWheel, pocketIndexFromAngle, angleForPocket } from './RouletteWheelRenderer.js';
import { RouletteBet, isWinningBet, describeBet, payoutMultiplier, getNumberColor, WHEEL_ORDER } from './roulette-logic.js';

type RouletteState = 'selecting' | 'spinning' | 'result' | 'closed';

interface RouletteGameData {
  userId: string;
  username: string;
  avatarUrl: string;
  channelId: string;
  guildId: string | undefined;
  betAmount: number;
  currentBet: RouletteBet | null;
  result: number | null;
  message: Message | null;
  gameId: string;
  spinCount: number;
  previousAngle: number;
  client: any;
}

const GAME_CONFIG = {
  timeoutMs: 5 * 60 * 1000, // 5 minutes of silence closes the table
  stuckSpinMs: 60 * 1000, // a spin that takes longer than this is considered stuck
  animationDurationMs: 4500,
  frameCount: 6,
  wheelSize: 320,
};

const COLORS = {
  select: 0xffd700,
  spin: 0x3498db,
  win: 0x2ecc71,
  loss: 0xe74c3c,
};

const COLOR_EMOJI = { red: '🔴', black: '⚫', green: '🟢' } as const;

/** Where the game edits its own message. Works for buttons, modals and plain messages alike. */
type Editor = (payload: MessageEditOptions) => Promise<unknown>;

/** rlt_<action>_<gameId>  ->  { action, gameId }  (the action itself may contain underscores) */
export function parseRouletteId(customId: string): { action: string; gameId: string } | null {
  const match = /^rlt_(.+)_([a-z0-9]+)$/i.exec(customId);
  if (!match) return null;
  return { action: match[1], gameId: match[2] };
}

export class RouletteGame {
  private state: RouletteState = 'selecting';
  private data: RouletteGameData;
  private gameTimeout: NodeJS.Timeout | null = null;
  private spinStartedAt = 0;
  private onEnd?: () => void;

  constructor(userId: string, username: string, avatarUrl: string, betAmount: number, channelId: string, guildId: string | undefined, client: any, onEnd?: () => void) {
    this.data = {
      userId,
      username,
      avatarUrl,
      channelId,
      guildId,
      betAmount,
      currentBet: null,
      result: null,
      message: null,
      gameId: Math.random().toString(36).substring(2, 8),
      spinCount: 0,
      previousAngle: 0,
      client,
    };
    this.onEnd = onEnd;
  }

  get gameId(): string {
    return this.data.gameId;
  }

  get ownerId(): string {
    return this.data.userId;
  }

  /** True only while the wheel is really turning (a stuck spin stops counting after a minute). */
  isSpinning(): boolean {
    return this.state === 'spinning' && Date.now() - this.spinStartedAt < GAME_CONFIG.stuckSpinMs;
  }

  isFinished(): boolean {
    return this.state === 'closed';
  }

  async start(message: Message, bet?: RouletteBet): Promise<void> {
    if (bet) {
      // Direct bet from the command (.rlt 500 17): spin immediately
      this.state = 'spinning';
      this.spinStartedAt = Date.now();
      this.data.currentBet = bet;

      const sent = await message.reply({ embeds: [this.createSpinEmbed('🌀')] });
      this.data.message = sent;
      await this.runSpin(bet, (payload) => sent.edit(payload));
      return;
    }

    const sent = await message.reply({
      embeds: [this.createSelectionEmbed()],
      components: this.createSelectionButtons(),
    });
    this.data.message = sent;
    this.armTimeout();
  }

  /**
   * Close this game (used when the player starts a new one, and on timeout).
   * Never touches money: bets are only taken at the moment of a spin.
   */
  async close(note?: string): Promise<void> {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.clearTimeout();
    this.onEnd?.();

    const message = this.data.message;
    if (!message) return;
    try {
      if (note) {
        await message.edit({
          embeds: [new EmbedBuilder().setDescription(note).setColor(COLORS.loss)],
          components: [],
          attachments: [],
        });
      } else {
        await message.edit({ components: [] });
      }
    } catch (error) {
      console.error('[Roulette] Failed to close game message:', error);
    }
  }

  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    if (interaction.user.id !== this.data.userId) {
      await nope(interaction, 'This is not your game!');
      return;
    }

    const parsed = parseRouletteId(interaction.customId);
    if (!parsed || parsed.gameId !== this.data.gameId || this.state === 'closed') {
      await nope(interaction, 'This roulette table is closed. Start a new one with `.rlt`.');
      return;
    }

    if (this.state === 'spinning') {
      await nope(interaction, 'The wheel is already spinning!');
      return;
    }

    const bet = this.betFromAction(parsed.action);

    if (bet) {
      await this.spinFromInteraction(interaction, bet);
      return;
    }

    switch (parsed.action) {
      case 'number': {
        const modal = new ModalBuilder()
          .setCustomId(`rlt_exact_${this.data.gameId}`)
          .setTitle('Exact number')
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
        return;
      }
      case 'again': {
        if (!this.data.currentBet) {
          await nope(interaction, 'Pick a bet first.');
          return;
        }
        await this.spinFromInteraction(interaction, this.data.currentBet);
        return;
      }
      case 'change': {
        this.state = 'selecting';
        this.armTimeout();
        await interaction.update({
          embeds: [this.createSelectionEmbed()],
          components: this.createSelectionButtons(),
          files: [],
          attachments: [],
        });
        return;
      }
      default:
        await nope(interaction, 'Unknown action.');
    }
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    if (interaction.user.id !== this.data.userId) {
      await nope(interaction, 'This is not your game!');
      return;
    }

    const parsed = parseRouletteId(interaction.customId);
    if (!parsed || parsed.gameId !== this.data.gameId || this.state === 'closed') {
      await nope(interaction, 'This roulette table is closed. Start a new one with `.rlt`.');
      return;
    }

    if (this.state !== 'selecting') {
      await nope(interaction, "You can't change your bet right now.");
      return;
    }

    const numberInput = interaction.fields.getTextInputValue('number_input').trim();
    const number = parseInt(numberInput, 10);

    if (!/^\d+$/.test(numberInput) || isNaN(number) || number < 0 || number > 36) {
      await nope(interaction, 'Enter a number from 0 to 36.');
      return;
    }

    const bet: RouletteBet = { kind: 'number', value: number };
    this.beginSpin(bet);

    if (!interaction.isFromMessage()) {
      // Should not happen (the modal is opened from a button), but never leave the game locked.
      this.state = 'selecting';
      await nope(interaction, 'Something went wrong. Please try again.');
      return;
    }

    await interaction.update({
      embeds: [this.createSpinEmbed('🌀')],
      components: [],
      files: [],
      attachments: [],
    });
    await this.runSpin(bet, (payload) => interaction.editReply(payload));
  }

  private betFromAction(action: string): RouletteBet | null {
    switch (action) {
      case 'color_red': return { kind: 'color', value: 'red' };
      case 'color_black': return { kind: 'color', value: 'black' };
      case 'color_green': return { kind: 'color', value: 'green' };
      case 'parity_odd': return { kind: 'parity', value: 'odd' };
      case 'parity_even': return { kind: 'parity', value: 'even' };
      case 'range_low': return { kind: 'range', value: 'low' };
      case 'range_high': return { kind: 'range', value: 'high' };
      case 'row_1': return { kind: 'row', value: 1 };
      case 'row_2': return { kind: 'row', value: 2 };
      case 'row_3': return { kind: 'row', value: 3 };
      case 'dozen_1': return { kind: 'dozen', value: 1 };
      case 'dozen_2': return { kind: 'dozen', value: 2 };
      case 'dozen_3': return { kind: 'dozen', value: 3 };
      default: return null;
    }
  }

  /** Lock the table synchronously, so a second click can't start a second spin. */
  private beginSpin(bet: RouletteBet): void {
    this.state = 'spinning';
    this.spinStartedAt = Date.now();
    this.data.currentBet = bet;
    this.clearTimeout();
  }

  private async spinFromInteraction(interaction: MessageComponentInteraction, bet: RouletteBet): Promise<void> {
    this.beginSpin(bet);

    try {
      await interaction.update({
        embeds: [this.createSpinEmbed('🌀')],
        components: [],
        files: [],
        attachments: [],
      });
    } catch (error) {
      console.error('[Roulette] Could not acknowledge spin click:', error);
      this.state = this.data.result === null ? 'selecting' : 'result';
      this.armTimeout();
      return;
    }

    await this.runSpin(bet, (payload) => interaction.editReply(payload));
  }

  /**
   * Take the wager, spin, pay out, show the result. Always leaves the table in
   * 'selecting' or 'result' (never stuck in 'spinning').
   */
  private async runSpin(bet: RouletteBet, edit: Editor): Promise<void> {
    let charged = false;
    let settled = false;
    const stamp = `${Date.now()}_${this.data.spinCount}`;

    try {
      const coinInfo = await getCoinBalanceInfo(this.data.userId);
      if (!coinInfo || coinInfo.balance < this.data.betAmount) {
        await this.backToTable(edit, `${CROSS} Not enough coins · you need ${coins(this.data.betAmount)}`);
        return;
      }

      const deduction = await removeCoins(this.data.userId, this.data.betAmount, 'rlt', {
        reason: 'Roulette wager',
        description: `Bet on ${describeBet(bet)}`,
        gameInstanceId: `rlt_${this.data.userId}_${stamp}`,
      });

      if (deduction === null) {
        await this.backToTable(edit, `${CROSS} Could not take the wager. Try again.`);
        return;
      }
      charged = true;

      // Spin
      const result = Math.floor(Math.random() * 37);
      this.data.result = result;

      const won = isWinningBet(bet, result);
      const payout = won ? Math.floor(this.data.betAmount * payoutMultiplier(bet)) : 0;

      if (won && payout > 0) {
        const awardResult = await awardCoins(this.data.userId, payout, 'rlt', {
          reason: 'Roulette winnings',
          description: `Won on ${describeBet(bet)} with result ${result}`,
          gameInstanceId: `rlt_${this.data.userId}_${stamp}_payout`,
        });

        if (awardResult === null) {
          // Could not pay: give the wager back (once) and tell the player.
          await awardCoins(this.data.userId, this.data.betAmount, 'rlt', {
            reason: 'Roulette refund',
            description: 'Payout failed',
            gameInstanceId: `rlt_${this.data.userId}_${stamp}_refund`,
          });
          settled = true;
          await this.backToTable(edit, `${EMOJIS.warning} Payout failed, your wager was refunded.`);
          return;
        }
      }
      settled = true;
      this.data.spinCount++;

      // Money is settled; from here on only the show remains, and show errors must never touch money.
      const startAngle = this.data.previousAngle;
      const finalAngle = angleForPocket(WHEEL_ORDER.indexOf(result), startAngle, 5);
      this.data.previousAngle = finalAngle;

      await this.animate(edit, startAngle, finalAngle).catch((error) => console.error('[Roulette] Animation error:', error));
      await this.showResult(edit, result, bet, won, payout);

      this.state = 'result';
      this.armTimeout();
    } catch (error) {
      console.error('[Roulette] Spin error:', error);

      if (charged && !settled) {
        // Something broke between taking the wager and settling it: give the wager back.
        await awardCoins(this.data.userId, this.data.betAmount, 'rlt', {
          reason: 'Roulette refund',
          description: 'Error during spin',
          gameInstanceId: `rlt_${this.data.userId}_${stamp}_refund`,
        }).catch((refundError) => console.error('[Roulette] Refund failed:', refundError));
      }

      await this.backToTable(edit, charged && !settled ? `${EMOJIS.warning} Something broke, your wager was refunded.` : undefined).catch(() => {});
    } finally {
      // Whatever happened, the table must be usable again.
      if (this.state === 'spinning') {
        this.state = this.data.result === null ? 'selecting' : 'result';
        this.armTimeout();
      }
    }
  }

  /** Show the bet picker again (optionally with a one-line note). */
  private async backToTable(edit: Editor, note?: string): Promise<void> {
    this.state = 'selecting';
    this.armTimeout();
    await edit({
      embeds: [this.createSelectionEmbed(note)],
      components: this.createSelectionButtons(),
      files: [],
      attachments: [],
    });
  }

  private async animate(edit: Editor, startAngle: number, finalAngle: number): Promise<void> {
    const frameCount = GAME_CONFIG.frameCount;
    const startTime = Date.now();

    for (let i = 0; i < frameCount; i++) {
      const t = i / (frameCount - 1);
      const angle = startAngle + (finalAngle - startAngle) * this.easeOutQuint(t);
      const centerNumber = WHEEL_ORDER[pocketIndexFromAngle(angle)];

      const buffer = await renderWheel({ rotation: angle, size: GAME_CONFIG.wheelSize, centerNumber });

      const wait = startTime + t * GAME_CONFIG.animationDurationMs - Date.now();
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }

      const name = `wheel_${this.data.gameId}_${i}.png`;
      const embed = this.createSpinEmbed(i < frameCount - 2 ? '🌀' : '🐢', centerNumber).setImage(`attachment://${name}`);

      try {
        await edit({
          embeds: [embed],
          files: [new AttachmentBuilder(buffer, { name })],
          attachments: [],
        });
      } catch (error) {
        console.error('[Roulette] Frame edit error:', error);
      }
    }
  }

  private easeOutQuint(t: number): number {
    return 1 - Math.pow(1 - t, 5);
  }

  private async showResult(edit: Editor, result: number, bet: RouletteBet, won: boolean, payout: number): Promise<void> {
    const color = getNumberColor(result);
    const net = won ? payout - this.data.betAmount : -this.data.betAmount;

    const description =
      `${COLOR_EMOJI[color]} **${result}** · ${color.toUpperCase()}\n` +
      (won
        ? `${TICK} **WIN** ${signedCoins(net)} · ${describeBet(bet)}`
        : `${CROSS} **LOSS** ${signedCoins(net)} · ${describeBet(bet)}`);

    const name = `wheel_${this.data.gameId}_final.png`;
    const embed = new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(description)
      .setColor(won ? COLORS.win : COLORS.loss);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rlt_again_${this.data.gameId}`)
        .setEmoji('🔁')
        .setLabel(`Spin again · ${this.data.betAmount.toLocaleString('en-US')}`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`rlt_change_${this.data.gameId}`)
        .setLabel('Change bet')
        .setStyle(ButtonStyle.Secondary)
    );

    try {
      const buffer = await renderWheel({ rotation: this.data.previousAngle, size: GAME_CONFIG.wheelSize, centerNumber: result });
      embed.setImage(`attachment://${name}`);
      await edit({
        embeds: [embed],
        components: [row],
        files: [new AttachmentBuilder(buffer, { name })],
        attachments: [],
      });
    } catch (error) {
      console.error('[Roulette] Result image error, showing text only:', error);
      embed.setImage(null);
      await edit({
        embeds: [embed],
        components: [row],
        files: [],
        attachments: [],
      });
    }
  }

  private createSpinEmbed(icon: string, number?: number): EmbedBuilder {
    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(number === undefined ? `${icon} spinning…` : `${icon} **${number}**`)
      .setColor(COLORS.spin);
  }

  private createSelectionEmbed(note?: string): EmbedBuilder {
    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(`${EMOJIS.slot_static} **Roulette** · ${coins(this.data.betAmount)}\n${note ?? 'Pick your bet'}`)
      .setColor(COLORS.select);
  }

  private createSelectionButtons(): ActionRowBuilder<ButtonBuilder>[] {
    const id = (action: string) => `rlt_${action}_${this.data.gameId}`;
    const btn = (action: string, label: string, style: ButtonStyle, emoji?: string) => {
      const b = new ButtonBuilder().setCustomId(id(action)).setLabel(label).setStyle(style);
      if (emoji) b.setEmoji(emoji);
      return b;
    };

    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        btn('color_red', 'Red x2', ButtonStyle.Danger, COLOR_EMOJI.red),
        btn('color_black', 'Black x2', ButtonStyle.Secondary, COLOR_EMOJI.black),
        btn('color_green', '0 x36', ButtonStyle.Success, COLOR_EMOJI.green),
        btn('parity_odd', 'Odd x2', ButtonStyle.Primary),
        btn('parity_even', 'Even x2', ButtonStyle.Primary)
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        btn('range_low', '1–18 x2', ButtonStyle.Primary),
        btn('range_high', '19–36 x2', ButtonStyle.Primary),
        btn('number', 'Number x36', ButtonStyle.Success, EMOJIS.slotsseven)
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        btn('row_1', 'Row 1 x3', ButtonStyle.Primary),
        btn('row_2', 'Row 2 x3', ButtonStyle.Primary),
        btn('row_3', 'Row 3 x3', ButtonStyle.Primary)
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        btn('dozen_1', '1–12 x3', ButtonStyle.Primary),
        btn('dozen_2', '13–24 x3', ButtonStyle.Primary),
        btn('dozen_3', '25–36 x3', ButtonStyle.Primary)
      ),
    ];
  }

  private armTimeout(): void {
    this.clearTimeout();
    this.gameTimeout = setTimeout(() => {
      // Quiet close: just take the buttons away
      this.close().catch((error) => console.error('[Roulette] Timeout error:', error));
    }, GAME_CONFIG.timeoutMs);
  }

  private clearTimeout(): void {
    if (this.gameTimeout) {
      clearTimeout(this.gameTimeout);
      this.gameTimeout = null;
    }
  }
}
