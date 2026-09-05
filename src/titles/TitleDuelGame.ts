import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Guild, User } from 'discord.js';
import { QuizQuestion } from './TitleData.js';
import { JJK_DUEL_QUESTIONS } from './JJKQuestions.js';
import { TitleSystem } from './TitleSystem.js';

type DuelState = 'idle' | 'challenging' | 'playing' | 'sudden_death' | 'complete' | 'declined' | 'timeout';

interface DuelGameData {
  challengerId: string;
  challengerName: string;
  holderId: string;
  holderName: string;
  categoryId: string;
  channelId: string;
  guildId: string | undefined;
  questions: QuizQuestion[];
  currentQuestionIndex: number;
  challengerScore: number;
  holderScore: number;
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
  questionResolved: boolean;
}

// Game configuration
const GAME_CONFIG = {
  // Timeout in milliseconds
  timeoutMs: 10 * 60 * 1000, // 10 minutes
  // Question timeout per question
  questionTimeoutMs: 30 * 1000, // 30 seconds
  // Points to win
  winningScore: 6,
  // Max rounds
  maxRounds: 10,
};

export class TitleDuelGame {
  private state: DuelState = 'idle';
  private data: DuelGameData;
  private gameTimeout: NodeJS.Timeout | null = null;
  private questionTimeout: NodeJS.Timeout | null = null;

  constructor(challengerId: string, challengerName: string, holderId: string, holderName: string, categoryId: string, channelId: string, guildId: string | undefined) {
    this.data = {
      challengerId,
      challengerName,
      holderId,
      holderName,
      categoryId,
      channelId,
      guildId,
      questions: [],
      currentQuestionIndex: 0,
      challengerScore: 0,
      holderScore: 0,
      messageId: null,
      message: null,
      gameInstanceId: `duel_${categoryId}_${challengerId}_${holderId}_${Date.now()}`,
      questionResolved: false,
    };
  }

  /**
   * Start the title duel challenge
   */
  async start(message: Message): Promise<void> {
    // Verify holder still holds the title
    const ownership = await TitleSystem.getTitleHolder(this.data.categoryId);
    if (!ownership || ownership.holderId !== this.data.holderId) {
      await message.reply('The title holder has changed. Please try again.');
      return;
    }

    this.state = 'challenging';
    this.data.messageId = message.id;
    this.data.message = message;

    const category = TitleSystem.getCategory(this.data.categoryId);
    const embed = new EmbedBuilder()
      .setTitle('⚔️ TITLE CHALLENGE')
      .setDescription(`<@${this.data.challengerId}> has challenged <@${this.data.holderId}> for\n\n` +
        `👑 ${category?.name || 'Lord of the Heian Era'}`)
      .setColor(0xFFD700);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('duel_accept')
        .setLabel('ACCEPT')
        .setStyle(ButtonStyle.Success)
    ).addComponents(
      new ButtonBuilder()
        .setCustomId('duel_decline')
        .setLabel('DECLINE')
        .setStyle(ButtonStyle.Danger)
    );

    const sentMessage = await message.reply({
      embeds: [embed],
      components: [row],
    });

    this.data.messageId = sentMessage.id;
    this.data.message = sentMessage;

    // Set timeout
    this.gameTimeout = setTimeout(() => {
      this.timeoutGame();
    }, GAME_CONFIG.timeoutMs);
  }

  /**
   * Handle button interactions
   */
  async handleInteraction(interaction: MessageComponentInteraction, guild: Guild): Promise<void> {
    const customId = interaction.customId;

    switch (customId) {
      case 'duel_accept':
        await this.handleAccept(interaction, guild);
        break;
      case 'duel_decline':
        await this.handleDecline(interaction);
        break;
      default:
        if (customId.startsWith('duel_answer_')) {
          await this.handleAnswer(interaction, customId, guild);
        } else {
          await interaction.reply({
            content: 'Unknown action.',
            ephemeral: true,
          });
        }
    }
  }

  /**
   * Handle ACCEPT
   */
  private async handleAccept(interaction: MessageComponentInteraction, guild: Guild): Promise<void> {
    if (this.state !== 'challenging') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    // Only holder can accept
    if (interaction.user.id !== this.data.holderId) {
      await interaction.reply({
        content: 'Only the title holder can accept the challenge.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    // Load duel questions
    this.data.questions = [...JJK_DUEL_QUESTIONS];
    // Shuffle questions
    for (let i = this.data.questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.data.questions[i], this.data.questions[j]] = [this.data.questions[j], this.data.questions[i]];
    }

    this.state = 'playing';
    await this.sendNextQuestion(guild);
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

    if (interaction.user.id !== this.data.holderId) {
      await interaction.reply({
        content: 'Only the title holder can decline the challenge.',
        ephemeral: true,
      });
      return;
    }

    this.state = 'declined';
    this.clearTimeout();

    const embed = new EmbedBuilder()
      .setTitle('⚔️ TITLE CHALLENGE')
      .setDescription(`Challenge declined.`)
      .setColor(0xe74c3c);

    await interaction.update({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Send next question
   */
  private async sendNextQuestion(guild: Guild): Promise<void> {
    // Check for winner
    if (this.data.challengerScore >= GAME_CONFIG.winningScore || this.data.holderScore >= GAME_CONFIG.winningScore) {
      await this.completeDuel(guild);
      return;
    }

    // Check if max rounds reached
    if (this.data.currentQuestionIndex >= GAME_CONFIG.maxRounds) {
      // Check for tie
      if (this.data.challengerScore === this.data.holderScore) {
        this.state = 'sudden_death';
        await this.startSuddenDeath(guild);
      } else {
        await this.completeDuel(guild);
      }
      return;
    }

    this.data.questionResolved = false;
    const question = this.data.questions[this.data.currentQuestionIndex];
    const embed = this.createQuestionEmbed(question);
    const row = this.createQuestionButtons(question);

    await this.data.message?.edit({
      embeds: [embed],
      components: [row],
    });

    // Set question timeout
    this.questionTimeout = setTimeout(() => {
      this.handleQuestionTimeout();
    }, GAME_CONFIG.questionTimeoutMs);
  }

  /**
   * Handle answer
   */
  private async handleAnswer(interaction: MessageComponentInteraction, customId: string, guild: Guild): Promise<void> {
    if (this.state !== 'playing' && this.state !== 'sudden_death') {
      await interaction.reply({
        content: 'Duel is not in progress.',
        ephemeral: true,
      });
      return;
    }

    // Verify user is one of the duel participants
    if (interaction.user.id !== this.data.challengerId && interaction.user.id !== this.data.holderId) {
      await interaction.reply({
        content: 'You are not part of this duel.',
        ephemeral: true,
      });
      return;
    }

    if (this.data.questionResolved) {
      await interaction.reply({
        content: 'This question has already been resolved.',
        ephemeral: true,
      });
      return;
    }

    const answerIndex = parseInt(customId.replace('duel_answer_', ''), 10);
    const question = this.data.questions[this.data.currentQuestionIndex];
    const isCorrect = answerIndex === question.correctAnswer;

    this.data.questionResolved = true;
    this.clearQuestionTimeout();

    if (isCorrect) {
      // Award point to the player who answered correctly
      if (interaction.user.id === this.data.challengerId) {
        this.data.challengerScore++;
      } else {
        this.data.holderScore++;
      }
    } else {
      // Wrong answer - award point to the other player
      if (interaction.user.id === this.data.challengerId) {
        this.data.holderScore++;
      } else {
        this.data.challengerScore++;
      }
    }

    // Disable buttons
    const row = this.createQuestionButtons(question, true);
    await interaction.update({
      components: [row],
    });

    // Move to next question after a brief delay
    setTimeout(() => {
      this.data.currentQuestionIndex++;
      this.sendNextQuestion(guild);
    }, 1500);
  }

  /**
   * Handle question timeout
   */
  private async handleQuestionTimeout(): Promise<void> {
    this.data.questionResolved = true;
    this.data.currentQuestionIndex++;
    await this.sendNextQuestion(this.data.message?.guild as Guild);
  }

  /**
   * Start sudden death
   */
  private async startSuddenDeath(guild: Guild): Promise<void> {
    // Use a random question from the pool
    const randomQuestion = JJK_DUEL_QUESTIONS[Math.floor(Math.random() * JJK_DUEL_QUESTIONS.length)];
    this.data.questions = [randomQuestion];
    this.data.currentQuestionIndex = 0;

    const embed = this.createQuestionEmbed(randomQuestion, true);
    const row = this.createQuestionButtons(randomQuestion);

    await this.data.message?.edit({
      embeds: [embed],
      components: [row],
    });

    this.questionTimeout = setTimeout(() => {
      this.handleQuestionTimeout();
    }, GAME_CONFIG.questionTimeoutMs);
  }

  /**
   * Complete duel
   */
  private async completeDuel(guild: Guild): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();
    this.clearQuestionTimeout();

    const category = TitleSystem.getCategory(this.data.categoryId);
    const challengerWon = this.data.challengerScore > this.data.holderScore;

    let embed: EmbedBuilder;

    if (challengerWon) {
      // Transfer title
      await TitleSystem.transferTitle(
        this.data.categoryId,
        this.data.holderId,
        this.data.challengerId,
        this.data.challengerName,
        guild
      );

      embed = new EmbedBuilder()
        .setTitle('👑 NEW LORD OF THE HEIAN ERA')
        .setDescription(`<@${this.data.challengerId}> defeated <@${this.data.holderId}>\n\n` +
          `${this.data.challengerScore} — ${this.data.holderScore}\n\n` +
          `The title has a new owner.`)
        .setColor(0x00ff00);
    } else {
      embed = new EmbedBuilder()
        .setTitle('👑 LORD OF THE HEIAN ERA')
        .setDescription(`<@${this.data.holderId}> defended their title.\n\n` +
          `${this.data.holderScore} — ${this.data.challengerScore}\n\n` +
          `The title remains theirs.`)
        .setColor(0xFFD700);
    }

    await this.data.message?.edit({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Handle game timeout
   */
  private async timeoutGame(): Promise<void> {
    this.state = 'timeout';
    this.clearTimeout();
    this.clearQuestionTimeout();

    const embed = new EmbedBuilder()
      .setTitle('⚔️ TITLE DUEL')
      .setDescription(`Duel timed out.`)
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
   * Clear question timeout
   */
  private clearQuestionTimeout(): void {
    if (this.questionTimeout) {
      clearTimeout(this.questionTimeout);
      this.questionTimeout = null;
    }
  }

  /**
   * Check if game is finished
   */
  isFinished(): boolean {
    return this.state === 'complete' || this.state === 'declined' || this.state === 'timeout';
  }

  /**
   * Check if a user is a participant in this duel
   */
  isParticipant(userId: string): boolean {
    return userId === this.data.challengerId || userId === this.data.holderId;
  }

  // Embed creation methods

  private createQuestionEmbed(question: QuizQuestion, suddenDeath: boolean = false): EmbedBuilder {
    const roundText = suddenDeath ? 'SUDDEN DEATH' : `ROUND ${this.data.currentQuestionIndex + 1} / ${GAME_CONFIG.maxRounds}`;
    
    return new EmbedBuilder()
      .setTitle('👑 JJK TITLE DUEL')
      .setDescription(`<@${this.data.challengerId}>  ${this.data.challengerScore}\n` +
        `<@${this.data.holderId}>  ${this.data.holderScore}\n\n` +
        `**${roundText}**\n\n` +
        `**${question.question}**`)
      .setColor(0xFFD700);
  }

  // Button creation methods

  private createQuestionButtons(question: QuizQuestion, disabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    const labels = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < question.answers.length; i++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`duel_answer_${i}`)
          .setLabel(`${labels[i]}. ${question.answers[i]}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled)
      );
    }

    return row;
  }
}
