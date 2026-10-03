import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config, validateConfig } from '../config/index.js';
import { BobKunPersonality } from '../services/bob-kun-personality.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { handleHelpCommand } from '../commands/help.js';
import { handleBobkunCommand } from '../commands/bobkun.js';
import { handlePissCompCommand, handlePissCompInteraction } from '../commands/pisscomp.js';
import { handleTrialCommand, handleTrialInteraction, handleTrialModalSubmit } from '../commands/trial.js';
import { handleGambleCommand } from '../commands/gamble.js';
import { handleQuoteCommand } from '../commands/quote.js';
import { handleWalletCommand } from '../commands/wallet.js';
import { handleHighscoreCommand, handleHighscoreInteraction } from '../commands/highscore.js';
import { handleCashCommand } from '../commands/cash.js';
import { handleDiceDuelCommand, handleDiceDuelInteraction } from '../commands/diceduel.js';
import { handleHigherLowerCommand, handleHigherLowerInteraction } from '../commands/higherlower.js';
import { handleCardRouletteCommand, handleCardRouletteInteraction } from '../commands/croulette.js';
import { handleBombCommand, handleBombInteraction } from '../commands/bomb.js';
import { handleWordBombCommand, handleWordBombInteraction, handleWordBombMessage } from '../commands/wordbomb.js';
import { handleBjCommand, handleBjInteraction } from '../commands/bj.js';
import { handleBj2Command, handleBj2Interaction } from '../commands/bj2.js';
import { handleCfCommand, handleCfInteraction } from '../commands/cf.js';
import { handleImpostorCommand, handleImpostorInteraction, handleImpostorMessage } from '../commands/impostor.js';
import { handleNumGuessCommand, handleNumGuessInteraction, handleNumGuessMessage } from '../commands/numguess.js';
import { handleSimonSaysCommand, handleSimonSaysInteraction } from '../commands/simonsays.js';
import { handleQuizCommand, handleQuizInteraction } from '../commands/quiz.js';
import { handleChallengeCommand, handleChallengeInteraction } from '../commands/challenge.js';
import { handleRedirectCommand } from '../commands/redirect.js';
import { handleMogCommand, handleMogInteraction } from '../commands/mog.js';
import { handleMoglbCommand, handleMoglbInteraction } from '../commands/moglb.js';
import { handleGoonCommand } from '../commands/goon.js';
import { handleEdgeCommand } from '../commands/edge.js';
import {
  handlePscoutCommand,
  handlePrecruitCommand,
  handlePworkCommand,
  handlePcollectCommand,
  handlePlistCommand,
  handleAgencyInteraction,
} from '../commands/agency.js';
import { handlePhelpCommand } from '../commands/phelp.js';
import { AniListCharacterService } from '../services/anilist-character-service.js';

export class DiscordClient {
  private client: Client;

  constructor() {
    validateConfig();

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
      partials: [
        Partials.Channel,
        Partials.Message,
        Partials.Reaction,
      ],
    });
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once('ready', () => this.onReady());
    this.client.on('messageCreate', (message) => this.onMessageCreate(message));
    this.client.on('interactionCreate', (interaction) => this.onInteractionCreate(interaction));
    this.client.on('error', (error) => this.onError(error));
  }

  private onReady(): void {
    console.log(`${BobKunPersonality.ready}`);
    console.log(`Logged in as ${this.client.user?.tag}`);
    
    // Set bot status
    this.client.user?.setActivity('games', { type: 3 as any });
    
    // Initialize AniList service (non-blocking, will populate cache in background if needed)
    const anilistService = AniListCharacterService.getInstance();
    anilistService.initializeBackgroundPopulation();
  }

  private async onMessageCreate(message: any): Promise<void> {
    // Ignore messages from bots (including self)
    if (message.author.bot) {
      return;
    }

    // Check for prefix command
    if (message.content.startsWith(config.prefix)) {
      const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
      const command = args.shift()?.toLowerCase();

      if (command === 'qhelp') {
        await handleHelpCommand(message);
        return;
      }

      if (command === 'bobkun') {
        await handleBobkunCommand(message);
        return;
      }

      if (command === 'pisscomp') {
        await handlePissCompCommand(message, args);
        return;
      }

      if (command === 'trial') {
        await handleTrialCommand(message);
        return;
      }


      if (command === 'gamble') {
        await handleGambleCommand(message, args);
        return;
      }

      if (command === 'wallet' || command === 'w' || command === 'wal') {
        await handleWalletCommand(message, args);
        return;
      }

      if (command === 'cash') {
        await handleCashCommand(message, args);
        return;
      }

      if (command === 'highscore' || command === 'hs') {
        await handleHighscoreCommand(message);
        return;
      }

      if (command === 'pscout') {
        await handlePscoutCommand(message);
        return;
      }

      if (command === 'precruit') {
        await handlePrecruitCommand(message, args);
        return;
      }

      if (command === 'pwork') {
        await handlePworkCommand(message, args);
        return;
      }

      if (command === 'pcollect') {
        await handlePcollectCommand(message);
        return;
      }

      if (command === 'plist') {
        await handlePlistCommand(message);
        return;
      }

      if (command === 'phelp') {
        await handlePhelpCommand(message);
        return;
      }

      if (command === 'diceduel') {
        await handleDiceDuelCommand(message, args);
        return;
      }

      if (command === 'hlow') {
        await handleHigherLowerCommand(message, args, this.client);
        return;
      }

      if (command === 'croulette') {
        await handleCardRouletteCommand(message, args, this.client);
        return;
      }

      if (command === 'bomb') {
        await handleBombCommand(message, args);
        return;
      }

      if (command === 'wordbomb') {
        await handleWordBombCommand(message);
        return;
      }

      if (command === 'bj') {
        await handleBjCommand(message, args, this.client);
        return;
      }

      if (command === 'bj2') {
        await handleBj2Command(message, args, this.client);
        return;
      }

      if (command === 'cf') {
        await handleCfCommand(message, args);
        return;
      }

      if (command === 'impostor') {
        await handleImpostorCommand(message);
        return;
      }

      if (command === 'numguess') {
        await handleNumGuessCommand(message);
        return;
      }

      if (command === 'simonsays') {
        await handleSimonSaysCommand(message);
        return;
      }

      if (command === 'quiz') {
        await handleQuizCommand(message, args);
        return;
      }

      if (command === 'challenge') {
        await handleChallengeCommand(message, args);
        return;
      }

      if (command === 'quote') {
        await handleQuoteCommand(message, args);
        return;
      }

      if (command === 'redirect') {
        await handleRedirectCommand(message, args);
        return;
      }

      if (command === 'mog') {
        await handleMogCommand(message, args);
        return;
      }

      if (command === 'moglb') {
        await handleMoglbCommand(message);
        return;
      }

      if (command === 'goon') {
        await handleGoonCommand(message);
        return;
      }

      if (command === 'edge') {
        await handleEdgeCommand(message);
        return;
      }

    }

    // Check for Impostor clue submissions
    await handleImpostorMessage(message);

    // Check for NumGuess submissions
    await handleNumGuessMessage(message);

    // Check for Word Bomb word submissions
    await handleWordBombMessage(message);
  }

  private async onInteractionCreate(interaction: any): Promise<void> {
    try {
      if (interaction.isMessageComponent()) {
        await this.handleButtonInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await this.handleModalSubmit(interaction);
      }
    } catch (error) {
      await ErrorHandler.handleInteractionError(interaction, error, 'interaction handler');
    }
  }

  private async handleButtonInteraction(interaction: any): Promise<void> {
    const customId = interaction.customId;

    if (customId.startsWith('pisscomp_')) {
      await handlePissCompInteraction(interaction);
      return;
    }

    if (customId.startsWith('trial_')) {
      await handleTrialInteraction(interaction);
      return;
    }

    // Talent Agency buttons and select menus (pa_<action>_<ownerId>_<arg>)
    if (customId.startsWith('pa_')) {
      await handleAgencyInteraction(interaction);
      return;
    }

    if (customId.startsWith('diceduel_')) {
      await handleDiceDuelInteraction(interaction);
      return;
    }

    if (customId.startsWith('higherlower_')) {
      await handleHigherLowerInteraction(interaction);
      return;
    }

    if (customId.startsWith('croulette_')) {
      await handleCardRouletteInteraction(interaction);
      return;
    }

    if (customId.startsWith('bomb_')) {
      await handleBombInteraction(interaction);
      return;
    }

    if (customId.startsWith('wordbomb_')) {
      await handleWordBombInteraction(interaction);
      return;
    }

    if (customId.startsWith('bj_')) {
      await handleBjInteraction(interaction);
      return;
    }

    if (customId.startsWith('bj2_')) {
      await handleBj2Interaction(interaction);
      return;
    }

    if (customId.startsWith('cf_')) {
      await handleCfInteraction(interaction);
      return;
    }

    if (customId.startsWith('impostor_')) {
      await handleImpostorInteraction(interaction);
      return;
    }

    if (customId.startsWith('numguess_')) {
      await handleNumGuessInteraction(interaction);
      return;
    }

    if (customId.startsWith('simonsays_')) {
      await handleSimonSaysInteraction(interaction);
      return;
    }

    if (customId.startsWith('quiz_')) {
      await handleQuizInteraction(interaction);
      return;
    }

    if (customId.startsWith('duel_')) {
      await handleChallengeInteraction(interaction);
      return;
    }

    if (customId.startsWith('quote-')) {
      // Handled entirely by the message-scoped collector created inside
      // handleQuoteCommand (src/commands/quote.ts).
      return;
    }

    if (customId.startsWith('mog_')) {
      await handleMogInteraction(interaction);
      return;
    }

    if (customId.startsWith('moglb_')) {
      await handleMoglbInteraction(interaction);
      return;
    }

    if (customId.startsWith('hs_')) {
      await handleHighscoreInteraction(interaction);
      return;
    }
  }

  private async handleModalSubmit(interaction: any): Promise<void> {
    const customId = interaction.customId;

    if (customId === 'trial_sentence_modal') {
      const sentence = interaction.fields.getTextInputValue('sentence_text');
      await handleTrialModalSubmit(interaction, sentence);
      return;
    }
  }

  private onError(error: Error): void {
    ErrorHandler.handle(error, 'Discord client');
  }

  async login(): Promise<void> {
    await this.client.login(config.discord.botToken);
  }

  getClient(): Client {
    return this.client;
  }
}
