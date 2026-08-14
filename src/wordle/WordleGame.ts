import { WordleEvaluator, LetterState, EvaluatedGuess } from './wordleEvaluator.js';
import { WordProvider } from './wordProvider.js';

export interface WordleGameState {
  channelId: string;
  guildId?: string;
  secretWord: string;
  guesses: EvaluatedGuess[];
  maxGuesses: number;
  wordLength: number;
  isGameOver: boolean;
  winner?: string;
  messageId?: string;
  startTime: number;
  playerCooldowns: Map<string, number>;
}

export interface GuessValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Manages Wordle game state and logic
 */
export class WordleGame {
  private state: WordleGameState;
  private wordProvider: WordProvider;
  
  constructor(
    channelId: string,
    guildId: string | undefined,
    wordProvider: WordProvider,
    wordLength: number = 6,
    maxGuesses: number = 8
  ) {
    this.wordProvider = wordProvider;
    this.state = {
      channelId,
      guildId,
      secretWord: '',
      guesses: [],
      maxGuesses,
      wordLength,
      isGameOver: false,
      startTime: Date.now(),
      playerCooldowns: new Map<string, number>(),
    };
  }
  
  /**
   * Initialize the game with a random word from the provider
   */
  async initialize(): Promise<void> {
    this.state.secretWord = await this.wordProvider.getRandomWord(this.state.wordLength);
    console.log(`[WordleGame] Game initialized for channel ${this.state.channelId} with word length ${this.state.wordLength}`);
  }
  
  /**
   * Process a guess from a player
   */
  async processGuess(guess: string, playerId: string, playerName: string): Promise<GuessValidationResult> {
    // Check if game is over
    if (this.state.isGameOver) {
      return { isValid: false, error: 'Game is already over' };
    }
    
    // Check if max guesses reached
    if (this.state.guesses.length >= this.state.maxGuesses) {
      return { isValid: false, error: 'Maximum guesses reached' };
    }
    
    // Check player cooldown
    const cooldownUntil = this.state.playerCooldowns.get(playerId);
    if (cooldownUntil && cooldownUntil > Date.now()) {
      const remainingMs = cooldownUntil - Date.now();
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      const timeText = remainingSeconds === 1 ? 'second' : 'seconds';
      return { isValid: false, error: `⏳ You need to wait ${remainingSeconds} ${timeText} before guessing again.` };
    }
    
    // Validate format
    if (!WordleEvaluator.isValidFormat(guess, this.state.wordLength)) {
      return { isValid: false, error: `Guess must be exactly ${this.state.wordLength} letters` };
    }
    
    // Validate word exists using provider
    const normalizedGuess = WordleEvaluator.normalizeGuess(guess);
    const isValidWord = await this.wordProvider.isValidWord(normalizedGuess);
    
    if (!isValidWord) {
      return { isValid: false, error: 'Not a valid word' };
    }
    
    // Check if this word was already guessed
    const alreadyGuessed = this.state.guesses.some(
      existing => existing.word === normalizedGuess
    );
    
    if (alreadyGuessed) {
      return { isValid: false, error: "You've already guessed that word! 🔁" };
    }
    
    // Evaluate the guess
    const result = WordleEvaluator.evaluate(normalizedGuess, this.state.secretWord);
    
    console.log('[Wordle] Guess:', normalizedGuess);
    console.log('[Wordle] Evaluation:', result);
    
    // Add to guesses
    this.state.guesses.push({
      word: normalizedGuess,
      result,
      player: playerName,
      timestamp: Date.now(),
    });
    
    // Set player cooldown for 25 seconds
    this.state.playerCooldowns.set(playerId, Date.now() + 25_000);
    
    // Log keyboard state after this guess
    const keyboardStates = this.getKeyboardStates();
    console.log('[Wordle] Keyboard state after guess:', Object.fromEntries(keyboardStates));
    
    // Check for win
    if (result.isCorrect) {
      this.state.isGameOver = true;
      this.state.winner = playerName;
    }
    
    // Check for loss (max guesses reached)
    if (this.state.guesses.length >= this.state.maxGuesses && !result.isCorrect) {
      this.state.isGameOver = true;
    }
    
    return { isValid: true };
  }
  
  /**
   * Get the current game state (without secret word)
   */
  getPublicState(): Omit<WordleGameState, 'secretWord'> & { guessCount: number } {
    const { secretWord, ...publicState } = this.state;
    return {
      ...publicState,
      guessCount: this.state.guesses.length,
    };
  }
  
  /**
   * Get the full game state (including secret word)
   */
  getFullState(): WordleGameState {
    return { ...this.state };
  }
  
  /**
   * Set the Discord message ID for the game
   */
  setMessageId(messageId: string): void {
    this.state.messageId = messageId;
  }
  
  /**
   * Check if the game is over
   */
  isGameOver(): boolean {
    return this.state.isGameOver;
  }
  
  /**
   * Get the secret word (for end game reveal)
   */
  getSecretWord(): string {
    return this.state.secretWord;
  }
  
  /**
   * Get the winner if game is over
   */
  getWinner(): string | undefined {
    return this.state.winner;
  }
  
  /**
   * Get current guess count
   */
  getGuessCount(): number {
    return this.state.guesses.length;
  }
  
  /**
   * Get maximum guesses
   */
  getMaxGuesses(): number {
    return this.state.maxGuesses;
  }
  
  /**
   * Get word length
   */
  getWordLength(): number {
    return this.state.wordLength;
  }
  
  /**
   * Get all guesses
   */
  getGuesses(): EvaluatedGuess[] {
    return [...this.state.guesses];
  }
  
  /**
   * Get channel ID
   */
  getChannelId(): string {
    return this.state.channelId;
  }
  
  /**
   * Get guild ID
   */
  getGuildId(): string | undefined {
    return this.state.guildId;
  }
  
  /**
   * Get message ID
   */
  getMessageId(): string | undefined {
    return this.state.messageId;
  }
  
  /**
   * Calculate keyboard letter states
   */
  getKeyboardStates(): Map<string, LetterState> {
    const keyboardStates = new Map<string, LetterState>();
    
    for (const guess of this.state.guesses) {
      for (let i = 0; i < guess.word.length; i++) {
        const letter = guess.word[i].toUpperCase();
        const currentState = guess.result.letters[i];
        
        // Only upgrade state (correct > wrong_position > not_found)
        const existingState = keyboardStates.get(letter);
        if (!existingState || this.shouldUpgradeState(existingState, currentState)) {
          keyboardStates.set(letter, currentState);
        }
      }
    }
    
    return keyboardStates;
  }
  
  /**
   * Determine if we should upgrade a letter state
   */
  private shouldUpgradeState(current: LetterState, newState: LetterState): boolean {
    const statePriority = {
      [LetterState.NOT_FOUND]: 0,
      [LetterState.WRONG_POSITION]: 1,
      [LetterState.CORRECT]: 2,
    };
    
    return statePriority[newState] > statePriority[current];
  }
}