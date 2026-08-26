import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config, validateConfig } from '../config/index.js';
import { BobKunPersonality } from '../services/bob-kun-personality.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { handleSmashCommand, handleSmashVote } from '../commands/smash.js';
import { handleWordleCommand, handleWordleGuess } from '../commands/wordle.js';
import { handleFontTestCommand } from '../commands/fontTest.js';
import { handleSmashTestCommand } from '../commands/smashTest.js';
import { handleWheelCommand } from '../commands/wheel.js';
import { handleWheelFontTestCommand } from '../commands/wheelFontTest.js';
import { handleWheelTestCommand } from '../commands/wheelTest.js';
import { handleHelpCommand } from '../commands/help.js';
import { handleBobkunCommand } from '../commands/bobkun.js';
import { handleQuickDrawCommand, handleQuickDrawInteraction } from '../commands/quickdraw.js';
import { handleQuickDrawMaxCommand, handleQuickDrawMaxInteraction } from '../commands/quickdrawmax.js';
import { handleRouletteCommand, handleRouletteInteraction } from '../commands/roulette.js';
import { handleRouletteMaxCommand, handleRouletteMaxInteraction } from '../commands/roulettemax.js';
import { handlePissCompCommand, handlePissCompInteraction } from '../commands/pisscomp.js';
import { handleSmashMaxCommand, handleSmashMaxInteraction } from '../commands/smashmax.js';
import { handleTrialCommand, handleTrialInteraction, handleTrialModalSubmit } from '../commands/trial.js';
import { handleQuoteCommand, handleQuoteInteraction } from '../commands/quote.js';
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
    this.client.user?.setActivity('googoo gaga niggas', { type: 3 as any });
    
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

      if (command === 'smash') {
        await handleSmashCommand(message, args);
        return;
      }

      if (command === 'wordle') {
        await handleWordleCommand(message, args);
        return;
      }

      if (command === 'fonttest') {
        await handleFontTestCommand(message, args);
        return;
      }

      if (command === 'smashtest') {
        await handleSmashTestCommand(message);
        return;
      }

      if (command === 'wheel') {
        await handleWheelCommand(message, args);
        return;
      }

      if (command === 'wheeltest') {
        await handleWheelTestCommand(message);
        return;
      }

      if (command === 'wheelfonttest') {
        await handleWheelFontTestCommand(message);
        return;
      }

      if (command === 'help') {
        await handleHelpCommand(message);
        return;
      }

      if (command === 'bobkun') {
        await handleBobkunCommand(message);
        return;
      }

      if (command === 'quickdraw') {
        await handleQuickDrawCommand(message, args);
        return;
      }

      if (command === 'quickdrawmax') {
        await handleQuickDrawMaxCommand(message, args);
        return;
      }

      if (command === 'roulette') {
        await handleRouletteCommand(message);
        return;
      }

      if (command === 'roulettemax') {
        await handleRouletteMaxCommand(message);
        return;
      }

      if (command === 'pisscomp') {
        await handlePissCompCommand(message, args);
        return;
      }

      if (command === 'smashmax') {
        await handleSmashMaxCommand(message);
        return;
      }

      if (command === 'trial') {
        await handleTrialCommand(message);
        return;
      }

      if (command === 'quote') {
        await handleQuoteCommand(message, args);
        return;
      }
    }

    // Check for Wordle guesses (only if not a command)
    await handleWordleGuess(message);
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
    
    if (customId === 'quickdraw_fire') {
      await handleQuickDrawInteraction(interaction);
      return;
    }

    if (customId === 'quickdrawmax_fire') {
      await handleQuickDrawMaxInteraction(interaction);
      return;
    }

    if (customId === 'roulette_trigger' || customId === 'roulette_double') {
      await handleRouletteInteraction(interaction);
      return;
    }

    if (customId.startsWith('roulettemax_')) {
      await handleRouletteMaxInteraction(interaction);
      return;
    }

    if (customId.startsWith('pisscomp_')) {
      await handlePissCompInteraction(interaction);
      return;
    }

    if (customId.startsWith('smashmax_')) {
      await handleSmashMaxInteraction(interaction);
      return;
    }

    if (customId.startsWith('trial_')) {
      await handleTrialInteraction(interaction);
      return;
    }

    if (customId.startsWith('quote_')) {
      await handleQuoteInteraction(interaction);
      return;
    }
    
    await handleSmashVote(interaction);
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
