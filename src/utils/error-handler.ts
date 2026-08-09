import { BobKunPersonality } from '../services/bob-kun-personality.js';
import { Logger } from './logger.js';

export class ErrorHandler {
  static handle(error: unknown, context: string): string {
    // Log the full error for debugging
    Logger.error(`Error in ${context}:`, error);
    
    if (error instanceof Error) {
      Logger.error(`Error message: ${error.message}`);
      Logger.error(`Error stack: ${error.stack}`);
    }
    
    // Return user-friendly message
    if (error instanceof Error) {
      // Log the actual error for debugging
      Logger.debug(`Error details: ${error.message}`);
      
      // Check for specific error types
      if (error.message.includes('database') || error.message.includes('SQLite')) {
        return `${BobKunPersonality.emojis.confused} Bob Kun's database is confused! Try again later.`;
      }
      
      if (error.message.includes('network') || error.message.includes('fetch')) {
        return `${BobKunPersonality.emojis.confused} Bob Kun can't reach Discord! Check your connection.`;
      }
      
      if (error.message.includes('permission') || error.message.includes('access')) {
        return `${BobKunPersonality.emojis.confused} Bob Kun doesn't have permission for that!`;
      }
      
      // Discord interaction errors
      if (error.message.includes('Interaction has expired') || error.message.includes('Collector received no interactions')) {
        return `${BobKunPersonality.emojis.confused} Bob Kun waited too long! Try again.`;
      }
      
      if (error.message.includes('Unknown Member') || error.message.includes('Unknown User')) {
        return `${BobKunPersonality.emojis.confused} Bob Kun can't find that user! They might have left.`;
      }
      
      if (error.message.includes('Unknown Channel')) {
        return `${BobKunPersonality.emojis.confused} Bob Kun can't find that channel!`;
      }
      
      if (error.message.includes('Missing Access')) {
        return `${BobKunPersonality.emojis.confused} Bob Kun doesn't have access there! Check permissions.`;
      }
    }
    
    // Default error message
    return BobKunPersonality.error;
  }

  static async handleInteractionError(interaction: any, error: unknown, context: string): Promise<void> {
    const errorMessage = this.handle(error, context);
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (followUpError) {
      Logger.error('Failed to send error message:', followUpError);
    }
  }

  static async handleMessageError(message: any, error: unknown, context: string): Promise<void> {
    const errorMessage = this.handle(error, context);
    
    try {
      await message.reply({ content: errorMessage });
    } catch (replyError) {
      Logger.error('Failed to send error message:', replyError);
    }
  }

  static isDatabaseError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('database') || 
             error.message.includes('SQLite') ||
             error.message.includes('SQLITE');
    }
    return false;
  }

  static isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('network') ||
             error.message.includes('fetch') ||
             error.message.includes('ECONNREFUSED') ||
             error.message.includes('ETIMEDOUT');
    }
    return false;
  }

  static isPermissionError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('permission') ||
             error.message.includes('access') ||
             error.message.includes('Missing Permissions') ||
             error.message.includes('403');
    }
    return false;
  }
}
