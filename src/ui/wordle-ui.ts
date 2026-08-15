import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { WordleRenderer, WordleBoardData } from '../wordle/wordleRenderer.js';
import { LetterState } from '../wordle/wordleEvaluator.js';
import { BobKunPersonality } from '../services/bob-kun-personality.js';

export interface WordleUIData {
  channelId: string;
  guesses: Array<{
    word: string;
    result: { letters: LetterState[] };
    player: string;
  }>;
  maxGuesses: number;
  wordLength: number;
  guessCount: number;
  isGameOver: boolean;
  winner?: string;
  keyboardStates: Map<string, LetterState>;
  correctGuessers?: Array<{ username: string; playerId: string }>;
  wrongGuesses?: string[];
}

/**
 * UI components for Wordle Discord integration
 */
export class WordleUI {
  /**
   * Create the initial game embed
   */
  static createGameEmbed(data: WordleUIData): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0x538d4e) // Wordle green
      .setTitle('🟩 WORDLE')
      .setDescription(`Guess the ${data.wordLength}-letter word!\n\nType your guess in chat to play.`)
      .setFooter({ text: `${data.guessCount} / ${data.maxGuesses} guesses` });

    // Add player/guess list
    this.addPlayerGuessList(embed, data);

    return embed;
  }
  
  /**
   * Create an updated game embed
   */
  static createUpdatedEmbed(data: WordleUIData, lastPlayer?: string): EmbedBuilder {
    let description = `Guess the ${data.wordLength}-letter word!\n\n`;

    if (lastPlayer) {
      description += `🎯 **${lastPlayer}** guessed\n\n`;
    }

    description += `Type your guess in chat to play.`;

    const embed = new EmbedBuilder()
      .setColor(0x538d4e)
      .setTitle('🟩 WORDLE')
      .setDescription(description)
      .setFooter({ text: `${data.guessCount} / ${data.maxGuesses} guesses` });

    // Add player/guess list
    this.addPlayerGuessList(embed, data);

    return embed;
  }
  
  /**
   * Create a win embed
   */
  static createWinEmbed(winner: string, secretWord: string, guessCount: number, data?: WordleUIData): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0xFFD700) // Gold
      .setTitle('🎉 WE HAVE A WINNER!')
      .setDescription(
        `🏆 **${winner}** guessed the word **${secretWord.toUpperCase()}**!\n\n` +
        `GG everyone!\n\n` +
        `${this.createLegend()}`
      )
      .setFooter({ text: `Won in ${guessCount} guesses • Bob Kun 🍌` });

    // Add player/guess list if data provided
    if (data) {
      this.addPlayerGuessList(embed, data);
    }

    return embed;
  }
  
  /**
   * Create a game over embed
   */
  static createGameOverEmbed(secretWord: string, guessCount: number, data?: WordleUIData): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000) // Red
      .setTitle('💀 Game Over!')
      .setDescription(
        `The word was **${secretWord.toUpperCase()}**.\n\n` +
        `Better luck next time!\n\n` +
        `${this.createLegend()}`
      )
      .setFooter({ text: `${guessCount} / 5 guesses used • Bob Kun 🍌` });

    // Add player/guess list if data provided
    if (data) {
      this.addPlayerGuessList(embed, data);
    }

    return embed;
  }
  
  /**
   * Create an error embed
   */
  static createErrorEmbed(error: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0xFFA500) // Orange
      .setDescription(`${BobKunPersonality.emojis.confused} ${error}`);
    
    return embed;
  }
  
  /**
   * Create the legend for letter colors
   */
  static createLegend(): string {
    return `🟩 Correct   🟨 Wrong Position   ⬛ Not Found`;
  }

  /**
   * Add player/guess list to embed
   */
  private static addPlayerGuessList(embed: EmbedBuilder, data: WordleUIData): void {
    const wrongGuesses = data.wrongGuesses || [];
    const correctGuessers = data.correctGuessers || [];

    let fieldText = '';

    // Add wrong guesses with X markers
    if (wrongGuesses.length > 0) {
      fieldText += '❌ **Wrong Guesses**\n';
      for (const word of wrongGuesses) {
        fieldText += `❌ ${word.toUpperCase()}\n`;
      }
      fieldText += '\n';
    }

    // Add correct guessers with crown
    if (correctGuessers.length > 0) {
      fieldText += '👑 **Correct Guessers**\n';
      for (const guesser of correctGuessers) {
        fieldText += `👑 @${guesser.username}\n`;
      }
    }

    if (fieldText) {
      embed.addFields({ name: '👥 Players', value: fieldText, inline: true });
    }
  }
  
  /**
   * Generate the board image attachment
   */
  static async generateBoardAttachment(data: WordleUIData): Promise<AttachmentBuilder> {
    const boardData: WordleBoardData = {
      guesses: data.guesses as any,
      maxGuesses: data.maxGuesses,
      wordLength: data.wordLength,
      keyboardStates: data.keyboardStates,
      isGameOver: data.isGameOver,
      guessCount: data.guessCount,
    };
    
    const imageBuffer = await WordleRenderer.generateBoard(boardData);
    // Use unique filename to prevent Discord caching
    const timestamp = Date.now();
    return new AttachmentBuilder(imageBuffer, { name: `wordle-board-${timestamp}.png` });
  }
  
  /**
   * Create the complete game message with embed and image
   */
  static async createGameMessage(data: WordleUIData, lastPlayer?: string): Promise<{
    embed: EmbedBuilder;
    attachment: AttachmentBuilder;
  }> {
    const embed = data.isGameOver 
      ? (data.winner 
          ? this.createWinEmbed(data.winner, 'SECRET', data.guessCount)
          : this.createGameOverEmbed('SECRET', data.guessCount))
      : this.createUpdatedEmbed(data, lastPlayer);
    
    const attachment = await this.generateBoardAttachment(data);
    
    // Add image to embed with dynamic filename
    embed.setImage(`attachment://${attachment.name}`);
    
    // Add legend to description
    const currentDescription = embed.data.description || '';
    embed.setDescription(`${currentDescription}\n\n${this.createLegend()}`);
    
    return { embed, attachment };
  }
}