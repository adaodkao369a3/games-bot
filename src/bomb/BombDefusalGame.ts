import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { awardCoins, removeCoins, getCoinBalanceInfo } from '../services/coins.js';
import { EMOJIS } from '../utils/emoji-registry.js';
import { CROSS, coins, betWin, mult } from '../utils/casino-ui.js';

const COLORS = {
  playing: 0x3498db,
  safe: 0x2ecc71,
  loss: 0xe74c3c,
  cashout: 0xffd700,
};

type BombDefusalState = 'idle' | 'playing' | 'complete' | 'cashout' | 'timeout';

type ChallengeType = 'wires' | 'buttons' | 'switches';

interface Challenge {
  type: ChallengeType;
  options: string[];
  correctIndex: number;
  description: string;
}

interface BombDefusalGameData {
  userId: string;
  username: string;
  avatarUrl: string;
  channelId: string;
  guildId: string | undefined;
  betAmount: number;
  currentPayout: number;
  currentStage: number;
  stagesDefused: number;
  currentChallenge: Challenge | null;
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
}

// Game configuration
const GAME_CONFIG = {
  // Multipliers for stages defused: stages -> multiplier
  stageMultipliers: {
    0: 1.0,
    1: 1.25,
    2: 1.5,
    3: 2.0,
    4: 2.5,
    5: 3.5,
    6: 5.0,
    7: 7.0,
    8: 9.0,
    9: 11.0,
    10: 13.0,
  },
  // Default multiplier for stages beyond 10
  defaultMultiplier: 15.0,
  // Choices per stage: stage -> number of choices
  choicesPerStage: {
    1: 3,
    2: 4,
    3: 5,
    4: 6,
    5: 6,
    6: 7,
    7: 7,
    8: 8,
  },
  // Default choices for stages beyond 8
  defaultChoices: 8,
  // Timeout in milliseconds
  timeoutMs: 5 * 60 * 1000, // 5 minutes
  // Challenge type probabilities
  challengeProbabilities: {
    wires: 0.5,
    buttons: 0.3,
    switches: 0.2,
  },
};

// Wire colors
const WIRE_COLORS = [
  { name: 'RED', emoji: '🔴' },
  { name: 'BLUE', emoji: '🔵' },
  { name: 'GREEN', emoji: '🟢' },
  { name: 'YELLOW', emoji: '🟡' },
  { name: 'PURPLE', emoji: '🟣' },
  { name: 'ORANGE', emoji: '🟠' },
  { name: 'WHITE', emoji: '⚪' },
  { name: 'BLACK', emoji: '⚫' },
];

/**
 * Get number of choices for current stage
 */
function getChoicesForStage(stage: number): number {
  if (stage in GAME_CONFIG.choicesPerStage) {
    return GAME_CONFIG.choicesPerStage[stage as keyof typeof GAME_CONFIG.choicesPerStage];
  }
  return GAME_CONFIG.defaultChoices;
}

/**
 * Get multiplier for current stages defused
 */
function getMultiplier(stagesDefused: number): number {
  if (stagesDefused in GAME_CONFIG.stageMultipliers) {
    return GAME_CONFIG.stageMultipliers[stagesDefused as keyof typeof GAME_CONFIG.stageMultipliers];
  }
  return GAME_CONFIG.defaultMultiplier;
}

/**
 * Calculate current payout based on bet and stages defused
 */
function calculatePayout(bet: number, stagesDefused: number): number {
  const multiplier = getMultiplier(stagesDefused);
  return Math.floor(bet * multiplier);
}

/**
 * Generate a random challenge
 */
function generateChallenge(stage: number): Challenge {
  const numChoices = getChoicesForStage(stage);
  
  // Randomly select challenge type based on probabilities
  const rand = Math.random();
  let type: ChallengeType;
  if (rand < GAME_CONFIG.challengeProbabilities.wires) {
    type = 'wires';
  } else if (rand < GAME_CONFIG.challengeProbabilities.wires + GAME_CONFIG.challengeProbabilities.buttons) {
    type = 'buttons';
  } else {
    type = 'switches';
  }

  let options: string[] = [];
  let description = '';

  if (type === 'wires') {
    // Shuffle wire colors and pick numChoices
    const shuffled = [...WIRE_COLORS].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, numChoices);
    options = selected.map(w => `${w.emoji} ${w.name}`);
    description = 'Cut the safe wire';
  } else if (type === 'buttons') {
    // Generate numbered buttons
    const buttonNumbers = Array.from({ length: numChoices }, (_, i) => i + 1);
    options = buttonNumbers.map(n => `🔘 ${n}`);
    description = 'Press the safe button';
  } else {
    // Generate switches
    const switchLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, numChoices);
    options = switchLabels.map(s => `🔀 ${s}`);
    description = 'Flip the safe switch';
  }

  // Randomly select correct option
  const correctIndex = Math.floor(Math.random() * options.length);

  return {
    type,
    options,
    correctIndex,
    description,
  };
}

export class BombDefusalGame {
  private state: BombDefusalState = 'idle';
  private data: BombDefusalGameData;
  private gameTimeout: NodeJS.Timeout | null = null;

  constructor(userId: string, username: string, avatarUrl: string, betAmount: number, channelId: string, guildId: string | undefined) {
    this.data = {
      userId,
      username,
      avatarUrl,
      channelId,
      guildId,
      betAmount,
      currentPayout: betAmount,
      currentStage: 1,
      stagesDefused: 0,
      currentChallenge: null,
      messageId: null,
      message: null,
      gameInstanceId: `bomb_${userId}_${Date.now()}`,
    };
  }

  /**
   * Start the bomb defusal game
   */
  async start(message: Message): Promise<void> {
    // Check if user has enough coins
    const coinInfo = await getCoinBalanceInfo(this.data.userId);
    if (!coinInfo) {
      await message.reply('Could not check your balance. Try again.');
      return;
    }

    if (coinInfo.balance < this.data.betAmount) {
      await message.reply(`Not enough coins. You have ${coins(coinInfo.balance)}.`);
      return;
    }

    // Deduct bet
    const deduction = await removeCoins(
      this.data.userId,
      this.data.betAmount,
      'bomb',
      {
        reason: 'Bomb Defusal wager',
        description: 'Bet on bomb defusal',
      }
    );

    if (deduction === null) {
      await message.reply('Could not take your bet. Try again.');
      return;
    }

    this.state = 'playing';
    this.data.messageId = message.id;
    this.data.message = message;

    // Generate first challenge
    this.data.currentChallenge = generateChallenge(this.data.currentStage);

    const initialEmbed = this.createGameEmbed();

    const sentMessage = await message.reply({
      embeds: [initialEmbed],
      components: this.createChallengeButtons(),
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
        content: 'Not your game.',
        ephemeral: true,
      });
      return;
    }

    const customId = interaction.customId;

    if (customId.startsWith('bomb_choice_')) {
      await this.handleChoice(interaction, parseInt(customId.split('_')[2], 10));
    } else if (customId === 'bomb_cashout') {
      await this.handleCashout(interaction);
    } else {
      await interaction.reply({
        content: 'Unknown button.',
        ephemeral: true,
      });
    }
  }

  /**
   * Handle choice button
   */
  private async handleChoice(interaction: MessageComponentInteraction, choiceIndex: number): Promise<void> {
    if (this.state !== 'playing') {
      await interaction.reply({
        content: 'This game is over.',
        ephemeral: true,
      });
      return;
    }

    const challenge = this.data.currentChallenge!;
    const correct = choiceIndex === challenge.correctIndex;

    if (correct) {
      // Correct choice
      this.data.stagesDefused++;
      this.data.currentPayout = calculatePayout(this.data.betAmount, this.data.stagesDefused);
      this.data.currentStage++;

      // Generate next challenge
      this.data.currentChallenge = generateChallenge(this.data.currentStage);

      const embed = this.createGameEmbed(`${EMOJIS.tick}  **Defused**`);

      await interaction.update({
        embeds: [embed],
        components: this.createChallengeButtons(),
      });
    } else {
      // Wrong choice - explosion
      await this.explode(interaction, choiceIndex);
    }
  }

  /**
   * Handle cash out
   */
  private async handleCashout(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'playing') {
      await interaction.reply({
        content: 'This game is over.',
        ephemeral: true,
      });
      return;
    }

    if (this.data.stagesDefused < 1) {
      await interaction.reply({
        content: 'Defuse one stage first.',
        ephemeral: true,
      });
      return;
    }

    this.state = 'cashout';
    this.clearTimeout();

    // Award winnings
    const awardResult = await awardCoins(
      this.data.userId,
      this.data.currentPayout,
      'bomb',
      {
        reason: 'Bomb Defusal cash out',
        description: `Stages defused: ${this.data.stagesDefused}`,
        gameInstanceId: this.data.gameInstanceId,
      }
    );

    if (awardResult === null) {
      await interaction.update({
        content: 'Payout failed. Tell an admin.',
        components: [],
      });
      return;
    }

    const embed = this.createCashoutEmbed();

    await interaction.update({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Handle explosion
   */
  private async explode(interaction: MessageComponentInteraction, wrongChoice: number): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();

    const challenge = this.data.currentChallenge!;
    const selectedOption = challenge.options[wrongChoice];
    const correctOption = challenge.options[challenge.correctIndex];

    const embed = new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(
        `💥  **BOOM**  ·  ${betWin(this.data.betAmount, 0)}\n\n` +
        `${selectedOption}  ${CROSS}  ·  safe was ${correctOption}\n\n` +
        `${EMOJIS.purplebomb} **${this.data.stagesDefused}** defused`
      )
      .setColor(COLORS.loss);

    await interaction.update({
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
      'bomb',
      {
        reason: 'Bomb Defusal refund',
        description: 'Game timeout',
      }
    );

    const embed = new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(`${EMOJIS.alarm1}  **Timed out**  ·  ${coins(this.data.betAmount)} refunded`)
      .setColor(COLORS.loss);

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
    return this.state === 'complete' || this.state === 'cashout' || this.state === 'timeout';
  }

  // Embed creation methods

  private createGameEmbed(statusMessage: string = ''): EmbedBuilder {
    const challenge = this.data.currentChallenge!;
    const multiplier = getMultiplier(this.data.stagesDefused);

    const stats =
      `${EMOJIS.purplebomb}  **Stage ${this.data.currentStage}**  ·  ${mult(multiplier)}  ·  ${coins(this.data.currentPayout)}`;

    const description =
      (statusMessage ? `${statusMessage}\n\n` : '') +
      `${stats}\n\n**${challenge.description}**`;

    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(description)
      .setColor(statusMessage ? COLORS.safe : COLORS.playing);
  }

  private createCashoutEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setAuthor({ name: this.data.username, iconURL: this.data.avatarUrl })
      .setDescription(
        `${EMOJIS.moneybag}  **Cashed out**  ·  ${betWin(this.data.betAmount, this.data.currentPayout)}\n\n` +
        `${EMOJIS.purplebomb} **${this.data.stagesDefused}** defused  ·  ${mult(getMultiplier(this.data.stagesDefused))}`
      )
      .setColor(COLORS.cashout);
  }

  // Button creation methods

  /**
   * Choice buttons (max 4 per row, so up to 8 choices fit in 2 rows) plus a
   * Cash out row once at least one stage is defused. Discord allows at most
   * 5 buttons per row, so one long row would break from stage 4 on.
   */
  private createChallengeButtons(): ActionRowBuilder<ButtonBuilder>[] {
    const challenge = this.data.currentChallenge!;
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    challenge.options.forEach((option, index) => {
      if (index % 4 === 0) rows.push(new ActionRowBuilder<ButtonBuilder>());
      rows[rows.length - 1].addComponents(
        new ButtonBuilder()
          .setCustomId(`bomb_choice_${index}`)
          .setLabel(option)
          .setStyle(ButtonStyle.Secondary)
      );
    });

    if (this.data.stagesDefused >= 1) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('bomb_cashout')
            .setEmoji(EMOJIS.moneybag)
            .setLabel(`Cash out · ${this.data.currentPayout.toLocaleString('en-US')}`)
            .setStyle(ButtonStyle.Success)
        )
      );
    }

    return rows;
  }
}
