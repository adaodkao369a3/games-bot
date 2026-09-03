import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { WordleRenderer, WordleBoardData } from '../wordle/wordleRenderer.js';
import { LetterState } from '../wordle/wordleEvaluator.js';
import { BobKunPersonality } from '../services/bob-kun-personality.js';

export interface WordleUIData {
  channelId: string;
  guesses: Array<{
    word: string;
    result: { letters: LetterState[]; isCorrect: boolean };
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
      .setTitle('<a:statustyping:1545155645630582794> WORDLE')
      .setDescription(`Guess the ${data.wordLength}-letter word!\n\nType your guess in chat to play.`)
      .setFooter({ text: `${data.guessCount} / ${data.maxGuesses} guesses` });

    return embed;
  }
  
  /**
   * Create an updated game embed
   */
  static createUpdatedEmbed(data: WordleUIData, lastPlayer?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0x538d4e)
      .setTitle('<a:statustyping:1545155645630582794> WORDLE')
      .setDescription(`Guess the ${data.wordLength}-letter word!\n\nType your guess in chat to play.`)
      .setFooter({ text: `${data.guessCount} / ${data.maxGuesses} guesses` });

    return embed;
  }
  
  /**
   * Create a win embed
   */
  static createWinEmbed(winner: string, secretWord: string, guessCount: number, data?: WordleUIData): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0xFFD700) // Gold
      .setTitle('<a:confettipopper:1545132978139693227> WE HAVE A WINNER!')
      .setDescription(
        `<:15394trophy:1545135066148118628>**${winner}** guessed the word **${secretWord.toUpperCase()}**!\n\n` +
        `GG everyone!`
      )
      .setFooter({ text: `Won in ${guessCount} guesses • Bob Kun 🎳` });

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
        `Better luck next time!`
      )
      .setFooter({ text: `${guessCount} / 5 guesses used • Bob Kun 🎳` });

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
    
    return { embed, attachment };
  }
}