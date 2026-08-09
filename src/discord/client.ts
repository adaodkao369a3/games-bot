import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config, validateConfig } from '../config/index.js';
import { BobKunPersonality } from '../services/bob-kun-personality.js';
import { ActivityTracker } from '../services/activity-tracker.js';
import { RecentUserTracker } from '../services/recent-user-tracker.js';
import { SmashScheduler } from '../services/smash-scheduler.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { handleSmash, smashCommand, handleSmashVote, setScheduler } from '../commands/smash.js';

export class DiscordClient {
  private client: Client;
  private activityTracker: ActivityTracker;
  private recentUserTracker: RecentUserTracker;
  private smashScheduler: SmashScheduler;

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

    this.activityTracker = new ActivityTracker();
    this.recentUserTracker = new RecentUserTracker();
    this.smashScheduler = new SmashScheduler();
    
    // Set the scheduler reference for the command
    setScheduler(this.smashScheduler);
    
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
    this.client.user?.setActivity('Smash This', { type: 3 as any });
  }

  private async onMessageCreate(message: any): Promise<void> {
    // Ignore messages from bots (including self)
    if (message.author.bot) {
      return;
    }

    const channelId = message.channelId;
    const botId = this.client.user?.id || '';

    // Track recent user activity for selection pool
    if (this.activityTracker.shouldTrackMessage(message.author.id, botId)) {
      await this.recentUserTracker.recordUserActivity(
        message.author.id,
        message.author.displayName,
        message.author.avatarURL(),
        channelId
      );
    }

    // Track activity for smart spawning
    if (channelId && this.activityTracker.shouldTrackMessage(message.author.id, botId)) {
      await this.activityTracker.recordActivity(channelId);
      
      // Check if we should spawn an automatic event
      const guildId = message.guildId || '';
      await this.smashScheduler.checkForAutomaticEvent(channelId, guildId, botId);
    }
  }

  private async onInteractionCreate(interaction: any): Promise<void> {
    try {
      if (interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction);
      } else if (interaction.isMessageComponent()) {
        await this.handleButtonInteraction(interaction);
      }
    } catch (error) {
      await ErrorHandler.handleInteractionError(interaction, error, 'interaction handler');
    }
  }

  private async handleSlashCommand(interaction: any): Promise<void> {
    const { commandName } = interaction;

    switch (commandName) {
      case smashCommand.name:
        await handleSmash(interaction);
        break;
      default:
        await interaction.reply({
          content: `${BobKunPersonality.emojis.confused} Bob Kun doesn't know this command!`,
          ephemeral: true,
        });
    }
  }

  private async handleButtonInteraction(interaction: any): Promise<void> {
    await handleSmashVote(interaction);
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
