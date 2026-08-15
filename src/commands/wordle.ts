import { Message, AttachmentBuilder } from 'discord.js';
import { WordleGame, WordleGameState } from '../wordle/WordleGame.js';
import { DatamuseWordProvider } from '../wordle/datamuseProvider.js';
import { WordleUI } from '../ui/wordle-ui.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { BobKunPersonality } from '../services/bob-kun-personality.js';
import { isStaff } from '../utils/permissions.js';

// Active games keyed by channel ID
const activeGames = new Map<string, WordleGame>();

// Word provider instance (shared across all games)
const wordProvider = new DatamuseWordProvider();

/**
 * Handle the Wordle command to start a new game
 */
export async function handleWordleCommand(message: Message, args: string[]): Promise<void> {
  try {
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    
    // Check if a game is already running in this channel
    if (activeGames.has(channelId)) {
      await message.reply({
        content: BobKunPersonality.wordleGameAlreadyRunning,
      });
      return;
    }
    
    if (!message.guild) {
      await message.reply({
        content: 'okkk buddy',
      });
      return;
    }
    
    // Create new game instance
    const game = new WordleGame(channelId, guildId, wordProvider, 6, 8);
    
    // Initialize the game (fetch secret word)
    try {
      await game.initialize();
    } catch (error) {
      console.error('[Wordle Command] Failed to initialize game:', error);
      await message.reply({
        content: `${BobKunPersonality.emojis.confused} Bob Kun couldn't start the game. The word service might be unavailable.`,
      });
      return;
    }
    
    // Store the game
    activeGames.set(channelId, game);
    
    console.log('[Wordle Command] Game started for channel:', channelId);
    
    // Generate initial board
    const initialUIData = createUIDataFromGame(game);
    const { embed, attachment } = await WordleUI.createGameMessage(initialUIData);
    
    // Send the initial message
    const replyMessage = await message.reply({
      files: [attachment],
      embeds: [embed],
    });
    
    // Store the message object for updates
    game.setCurrentMessage(replyMessage);
    
  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'wordle');
  }
}

/**
 * Handle a Wordle guess message
 */
export async function handleWordleGuess(message: Message): Promise<void> {
  try {
    const channelId = message.channel.id;
    const content = message.content.trim();
    
    // Check if there's an active game in this channel
    const game = activeGames.get(channelId);
    if (!game) {
      return; // No game running, ignore the message
    }
    
    // Check if game is over
    if (game.isGameOver()) {
      return; // Game is over, ignore guesses
    }
    
    // Validate that this looks like a guess (single word, correct length)
    if (!/^[a-zA-Z]{6}$/.test(content)) {
      return; // Not a valid guess format, ignore
    }
    
    const username = message.author.username;
    const playerId = message.author.id;
    const staffMember = isStaff(message.member);
    
    // Process the guess
    const validationResult = await game.processGuess(content, playerId, username, staffMember);
    
    if (!validationResult.isValid) {
      // Do not send separate error messages - all feedback is in the game message
      return;
    }
    
    // Update the game message
    await updateGameMessage(game, message.channel, username);
    
    // Check if game is over
    if (game.isGameOver()) {
      const winner = game.getWinner();
      const secretWord = game.getSecretWord();
      
      if (winner) {
        // Game won
        await announceWinner(game, message.channel, winner, secretWord);
      } else {
        // Game lost (max guesses reached)
        await announceGameOver(game, message.channel, secretWord);
      }
      
      // Clean up the game
      activeGames.delete(channelId);
      console.log('[Wordle Guess] Game ended for channel:', channelId);
    }
    
  } catch (error) {
    console.error('[Wordle Guess] Error handling guess:', error);
    await ErrorHandler.handleMessageError(message, error, 'wordle-guess');
  }
}

/**
 * Update the game message with new board state
 */
async function updateGameMessage(game: WordleGame, channel: any, lastPlayer: string): Promise<void> {
  await game.runUpdate(async () => {
    const currentMessage = game.getCurrentMessage();
    const channelId = game.getChannelId();

    if (!channelId) {
      console.error('[Wordle Update] Missing channel ID');
      return;
    }

    if (!currentMessage) {
      console.error('[Wordle Update] No current message to edit');
      return;
    }

    try {
      const uiData = createUIDataFromGame(game);
      const { embed, attachment } = await WordleUI.createGameMessage(uiData, lastPlayer);

      // Edit the existing message
      await currentMessage.edit({
        files: [attachment],
        embeds: [embed],
      });

      console.log('[Wordle Update] Board updated successfully by editing message');
    } catch (error) {
      console.error('[Wordle Update] Failed to update message:', error);
    }
  });
}

/**
 * Announce the winner
 */
async function announceWinner(game: WordleGame, channel: any, winner: string, secretWord: string): Promise<void> {
  await game.runUpdate(async () => {
    const currentMessage = game.getCurrentMessage();
    const channelId = game.getChannelId();

    if (!channelId) {
      console.error('[Wordle Winner] Missing channel ID');
      return;
    }

    if (!currentMessage) {
      console.error('[Wordle Winner] No current message to edit');
      return;
    }

    try {
      // Generate final board image
      const uiData = createUIDataFromGame(game);
      const attachment = await WordleUI.generateBoardAttachment(uiData);

      const winEmbed = WordleUI.createWinEmbed(winner, secretWord, game.getGuessCount(), uiData);
      winEmbed.setImage(`attachment://${attachment.name}`);

      // Edit the existing message
      await currentMessage.edit({
        files: [attachment],
        embeds: [winEmbed],
      });

      console.log('[Wordle Winner] Winner announced successfully by editing message');
    } catch (error) {
      console.error('[Wordle Winner] Failed to announce winner:', error);
    }
  });
}

/**
 * Announce game over
 */
async function announceGameOver(game: WordleGame, channel: any, secretWord: string): Promise<void> {
  await game.runUpdate(async () => {
    const currentMessage = game.getCurrentMessage();
    const channelId = game.getChannelId();

    if (!channelId) {
      console.error('[Wordle GameOver] Missing channel ID');
      return;
    }

    if (!currentMessage) {
      console.error('[Wordle GameOver] No current message to edit');
      return;
    }

    try {
      // Generate final board image
      const uiData = createUIDataFromGame(game);
      const attachment = await WordleUI.generateBoardAttachment(uiData);

      const gameOverEmbed = WordleUI.createGameOverEmbed(secretWord, game.getGuessCount(), uiData);
      gameOverEmbed.setImage(`attachment://${attachment.name}`);

      // Edit the existing message
      await currentMessage.edit({
        files: [attachment],
        embeds: [gameOverEmbed],
      });

      console.log('[Wordle GameOver] Game over announced successfully by editing message');
    } catch (error) {
      console.error('[Wordle GameOver] Failed to announce game over:', error);
    }
  });
}

/**
 * Create UI data from game state
 */
function createUIDataFromGame(game: WordleGame) {
  const publicState = game.getPublicState();
  const keyboardStates = game.getKeyboardStates();
  const guesses = game.getGuesses();
  const correctGuessers = game.getCorrectGuessers();
  const wrongGuesses = game.getWrongGuesses();

  console.log('[Wordle Command] Creating UI data with', guesses.length, 'guesses');

  return {
    channelId: game.getChannelId(),
    guesses: guesses,
    maxGuesses: game.getMaxGuesses(),
    wordLength: game.getWordLength(),
    guessCount: game.getGuessCount(),
    isGameOver: game.isGameOver(),
    winner: game.getWinner(),
    keyboardStates,
    correctGuessers,
    wrongGuesses,
  };
}

/**
 * Get active games (for testing/debugging)
 */
export function getActiveGames(): Map<string, WordleGame> {
  return activeGames;
}

/**
 * Clear all active games (for testing/debugging)
 */
export function clearActiveGames(): void {
  activeGames.clear();
}