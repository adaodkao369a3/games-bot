import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { awardCoins, removeCoins } from '../services/coins.js';
import { getCoinBalanceInfo } from '../services/coins.js';

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
    description = 'CUT THE SAFE WIRE';
  } else if (type === 'buttons') {
    // Generate numbered buttons
    const buttonNumbers = Array.from({ length: numChoices }, (_, i) => i + 1);
    options = buttonNumbers.map(n => `🔘 ${n}`);
    description = 'PRESS THE SAFE BUTTON';
  } else {
    // Generate switches
    const switchLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, numChoices);
    options = switchLabels.map(s => `🔀 ${s}`);
    description = 'FLIP THE SAFE SWITCH';
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

  constructor(userId: string, username: string, betAmount: number, channelId: string, guildId: string | undefined) {
    this.data = {
      userId,
      username,
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
      'bomb',
      {
        reason: 'Bomb Defusal wager',
        description: 'Bet on bomb defusal',
      }
    );

    if (deduction === null) {
      await message.reply('Failed to process your wager. Please try again.');
      return;
    }

    this.state = 'playing';
    this.data.messageId = message.id;
    this.data.message = message;

    // Generate first challenge
    this.data.currentChallenge = generateChallenge(this.data.currentStage);

    const initialEmbed = this.createGameEmbed();
    const row = this.createChallengeButtons();

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

    if (customId.startsWith('bomb_choice_')) {
      await this.handleChoice(interaction, parseInt(customId.split('_')[2], 10));
    } else if (customId === 'bomb_cashout') {
      await this.handleCashout(interaction);
    } else {
      await interaction.reply({
        content: 'Unknown action.',
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
        content: 'Invalid action for current state.',
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

      const embed = this.createGameEmbed('✅ DEFUSED!');
      const row = this.createChallengeButtons();

      await interaction.update({
        embeds: [embed],
        components: [row],
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
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    if (this.data.stagesDefused < 1) {
      await interaction.reply({
        content: 'You need to defuse at least one stage to cash out!',
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
        content: 'Failed to award winnings. Please contact support.',
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
      .setTitle('💥 BOOM!')
      .setDescription(`━━━━━━━━━━━━━━\n\n` +
        `**Selected:** ${selectedOption}\n` +
        `**Correct:** ${correctOption}\n\n` +
        `**Stage Reached:** ${this.data.currentStage}\n\n` +
        `**Stages Defused:** ${this.data.stagesDefused}\n\n` +
        `**Original Bet:** ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `**Amount Lost:** ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `━━━━━━━━━━━━━━`)
      .setColor(0xe74c3c);

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
      .setTitle('💣 BOMB DEFUSAL')
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
    return this.state === 'complete' || this.state === 'cashout' || this.state === 'timeout';
  }

  // Embed creation methods

  private createGameEmbed(statusMessage: string = ''): EmbedBuilder {
    const challenge = this.data.currentChallenge!;
    const multiplier = getMultiplier(this.data.stagesDefused);
    
    let description = `**STAGE**\n${this.data.currentStage}\n\n`;
    description += `**BET**\n${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n`;
    description += `**POTENTIAL WIN**\n${this.data.currentPayout.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n`;
    description += `**DEFUSED**\n${this.data.stagesDefused}\n\n`;
    description += `**MULTIPLIER**\nx${multiplier.toFixed(2)}\n\n`;
    description += `**${challenge.description}**\n\n`;

    if (statusMessage) {
      description += `**${statusMessage}**\n\n`;
    }

    return new EmbedBuilder()
      .setTitle('💣 BOMB DEFUSAL')
      .setDescription(description)
      .setColor(0x3498db);
  }

  private createCashoutEmbed(): EmbedBuilder {
    const netProfit = this.data.currentPayout - this.data.betAmount;
    const multiplier = getMultiplier(this.data.stagesDefused);
    
    return new EmbedBuilder()
      .setTitle('💰 CASHED OUT!')
      .setDescription(`━━━━━━━━━━━━━━\n\n` +
        `**Stages Defused:** ${this.data.stagesDefused}\n\n` +
        `**Final Multiplier:** x${multiplier.toFixed(2)}\n\n` +
        `**Original Bet:** ${this.data.betAmount.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `**Amount Won:** ${this.data.currentPayout.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `**Net Profit:** ${netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString('en-US')} <:cash:1545149005544165416>\n\n` +
        `━━━━━━━━━━━━━━`)
      .setColor(0xFFD700);
  }

  // Button creation methods

  private createChallengeButtons(): ActionRowBuilder<ButtonBuilder> {
    const challenge = this.data.currentChallenge!;
    const row = new ActionRowBuilder<ButtonBuilder>();
    
    // Add choice buttons
    challenge.options.forEach((option, index) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`bomb_choice_${index}`)
          .setLabel(option)
          .setStyle(ButtonStyle.Primary)
      );
    });

    // Add cash out button if at least one stage defused
    if (this.data.stagesDefused >= 1) {
      const cashOutRow = new ActionRowBuilder<ButtonBuilder>();
      cashOutRow.addComponents(
        new ButtonBuilder()
          .setCustomId('bomb_cashout')
          .setLabel('💰 CASH OUT')
          .setStyle(ButtonStyle.Success)
      );
      return cashOutRow;
    }

    return row;
  }
}
