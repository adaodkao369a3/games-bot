import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Guild } from 'discord.js';
import { QuizQuestion } from './TitleData.js';
import { JJK_CLAIM_QUESTIONS } from './JJKQuestions.js';
import { TitleSystem } from './TitleSystem.js';

type QuizState = 'idle' | 'playing' | 'complete' | 'timeout';

interface QuizGameData {
  userId: string;
  username: string;
  categoryId: string;
  channelId: string;
  guildId: string | undefined;
  questions: QuizQuestion[];
  currentQuestionIndex: number;
  score: number;
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
}

// Game configuration
const GAME_CONFIG = {
  // Timeout in milliseconds
  timeoutMs: 10 * 60 * 1000, // 10 minutes
  // Question timeout per question
  questionTimeoutMs: 60 * 1000, // 60 seconds
};

export class QuizGame {
  private state: QuizState = 'idle';
  private data: QuizGameData;
  private gameTimeout: NodeJS.Timeout | null = null;
  private questionTimeout: NodeJS.Timeout | null = null;

  constructor(userId: string, username: string, categoryId: string, channelId: string, guildId: string | undefined) {
    this.data = {
      userId,
      username,
      categoryId,
      channelId,
      guildId,
      questions: [],
      currentQuestionIndex: 0,
      score: 0,
      messageId: null,
      message: null,
      gameInstanceId: `quiz_${categoryId}_${userId}_${Date.now()}`,
    };
  }

  /**
   * Start the quiz game
   */
  async start(message: Message, guild: Guild): Promise<void> {
    // Check if title is already owned
    const ownership = TitleSystem.getTitleHolder(this.data.categoryId);
    if (ownership && ownership.holderId && ownership.holderId !== this.data.userId) {
      await message.reply(
        `The title is currently held by **${ownership.holderName}**.\n\n` +
        `Use \`.challenge @${ownership.holderName} ${this.data.categoryId}\` to challenge them for the title.`
      );
      return;
    }

    // Load questions
    this.data.questions = [...JJK_CLAIM_QUESTIONS];
    // Shuffle questions
    for (let i = this.data.questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.data.questions[i], this.data.questions[j]] = [this.data.questions[j], this.data.questions[i]];
    }

    this.state = 'playing';
    this.data.messageId = message.id;
    this.data.message = message;

    await this.sendNextQuestion(guild);

    // Set timeout
    this.gameTimeout = setTimeout(() => {
      this.timeoutGame();
    }, GAME_CONFIG.timeoutMs);
  }

  /**
   * Send next question
   */
  private async sendNextQuestion(guild: Guild): Promise<void> {
    if (this.data.currentQuestionIndex >= this.data.questions.length) {
      await this.completeQuiz(guild);
      return;
    }

    const question = this.data.questions[this.data.currentQuestionIndex];
    const embed = this.createQuestionEmbed(question);
    const row = this.createQuestionButtons(question);

    if (this.data.currentQuestionIndex === 0) {
      // First question - send as reply to start message
      const sentMessage = await this.data.message?.reply({
        embeds: [embed],
        components: [row],
      });
      this.data.messageId = sentMessage?.id || null;
      this.data.message = sentMessage || null;
    } else {
      // Subsequent questions - edit the message
      await this.data.message?.edit({
        embeds: [embed],
        components: [row],
      });
    }

    // Set question timeout
    this.questionTimeout = setTimeout(() => {
      this.handleQuestionTimeout();
    }, GAME_CONFIG.questionTimeoutMs);
  }

  /**
   * Handle button interactions
   */
  async handleInteraction(interaction: MessageComponentInteraction, guild: Guild): Promise<void> {
    // Verify user
    if (interaction.user.id !== this.data.userId) {
      await interaction.reply({
        content: 'This is not your quiz!',
        ephemeral: true,
      });
      return;
    }

    if (this.state !== 'playing') {
      await interaction.reply({
        content: 'Quiz is not in progress.',
        ephemeral: true,
      });
      return;
    }

    const customId = interaction.customId;
    if (!customId.startsWith('quiz_answer_')) {
      await interaction.reply({
        content: 'Unknown action.',
        ephemeral: true,
      });
      return;
    }

    const answerIndex = parseInt(customId.replace('quiz_answer_', ''), 10);
    await this.handleAnswer(interaction, answerIndex, guild);
  }

  /**
   * Handle answer
   */
  private async handleAnswer(interaction: MessageComponentInteraction, answerIndex: number, guild: Guild): Promise<void> {
    this.clearQuestionTimeout();

    const question = this.data.questions[this.data.currentQuestionIndex];
    const isCorrect = answerIndex === question.correctAnswer;

    if (isCorrect) {
      this.data.score++;
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
    // Treat as wrong answer
    this.data.currentQuestionIndex++;
    await this.sendNextQuestion(this.data.message?.guild as Guild);
  }

  /**
   * Complete quiz
   */
  private async completeQuiz(guild: Guild): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();
    this.clearQuestionTimeout();

    const passed = this.data.score === this.data.questions.length;
    const category = TitleSystem.getCategory(this.data.categoryId);

    let embed: EmbedBuilder;

    if (passed) {
      // Award title
      if (category) {
        await TitleSystem.awardTitle(this.data.categoryId, this.data.userId, this.data.username, guild);
      }

      embed = new EmbedBuilder()
        .setTitle('JJK QUIZ COMPLETE')
        .setDescription(`${this.data.score} / ${this.data.questions.length}\n\n` +
          `👑 You have mastered the Jujutsu Kaisen quiz.\n\n` +
          `You are now the ${category?.name || 'Lord of the Heian Era'}.`)
        .setColor(0x00ff00);
    } else {
      embed = new EmbedBuilder()
        .setTitle('JJK QUIZ COMPLETE')
        .setDescription(`${this.data.score} / ${this.data.questions.length}\n\n` +
          `You failed to claim the title.`)
        .setColor(0xe74c3c);
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
      .setTitle('JJK QUIZ')
      .setDescription(`Quiz timed out.`)
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
    return this.state === 'complete' || this.state === 'timeout';
  }

  // Embed creation methods

  private createQuestionEmbed(question: QuizQuestion): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('🧠 JJK QUIZ')
      .setDescription(`Question ${this.data.currentQuestionIndex + 1} / ${this.data.questions.length}\n\n` +
        `**${question.question}**`)
      .setColor(0x3498db);
  }

  // Button creation methods

  private createQuestionButtons(question: QuizQuestion, disabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    const labels = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < question.answers.length; i++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`quiz_answer_${i}`)
          .setLabel(`${labels[i]}. ${question.answers[i]}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled)
      );
    }

    return row;
  }
}
