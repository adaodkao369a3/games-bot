import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { awardCoins, removeCoins } from '../services/coins.js';
import { getLootAtDepth, selectWeightedLoot, calculateReward, getReelDifficultyMultiplier, type FishingLoot } from '../database/fishing-client.js';

type FishingState = 'idle' | 'casting' | 'fishing' | 'reeling' | 'complete' | 'failed';

interface FishingGameData {
  userId: string;
  channelId: string;
  guildId: string | undefined;
  depth: number;
  reelProgress: number;
  reelDifficulty: number;
  lastReelTime: number;
  reelingStartTime: number | null;
  selectedLoot: FishingLoot | null;
  entryFee: number;
  messageId: string | null;
  message: Message | null;
}

export class FishingGame {
  private state: FishingState = 'idle';
  private data: FishingGameData;
  private reelInterval: NodeJS.Timeout | null = null;
  private gameTimeout: NodeJS.Timeout | null = null;
  private readonly GAME_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly REEL_DECAY_INTERVAL_MS = 500; // Check every 500ms
  private readonly REEL_DECAY_AMOUNT = 2; // Lose 2% per interval if not reeling
  private readonly REEL_INCREMENT = 15; // Gain 15% per reel click
  private readonly REEL_GRACE_PERIOD_MS = 4000; // 4 seconds grace period before decay starts
  private readonly ENTRY_FEE = 500;
  private readonly DEPTH_INCREMENT = 25;

  constructor(userId: string, channelId: string, guildId: string | undefined) {
    this.data = {
      userId,
      channelId,
      guildId,
      depth: 0,
      reelProgress: 0,
      reelDifficulty: 1.0,
      lastReelTime: Date.now(),
      reelingStartTime: null,
      selectedLoot: null,
      entryFee: this.ENTRY_FEE,
      messageId: null,
      message: null,
    };
  }

  /**
   * Start the fishing game
   */
  async start(message: Message): Promise<void> {
    // Deduct entry fee
    const deductionResult = await removeCoins(
      this.data.userId,
      this.ENTRY_FEE,
      'fish',
      {
        reason: 'Fishing entry fee',
        description: 'Cost to start fishing'
      }
    );

    if (deductionResult === null) {
      await message.reply('Failed to process the fishing fee. Please try again.');
      return;
    }

    this.state = 'casting';
    this.data.messageId = message.id;
    this.data.message = message;

    // Send initial embed
    const initialEmbed = this.createCastingEmbed();
    const row = this.createCastingButtons();

    const sentMessage = await message.reply({
      embeds: [initialEmbed],
      components: [row],
    });

    this.data.messageId = sentMessage.id;
    this.data.message = sentMessage;

    // Set game timeout
    this.gameTimeout = setTimeout(() => {
      this.timeoutGame(sentMessage);
    }, this.GAME_TIMEOUT_MS);
  }

  /**
   * Handle button interactions
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    // Verify user
    if (interaction.user.id !== this.data.userId) {
      await interaction.reply({
        content: 'This is not your fishing session!',
        ephemeral: true,
      });
      return;
    }

    const customId = interaction.customId;

    switch (customId) {
      case 'fish_cast':
        await this.handleCast(interaction);
        break;
      case 'fish_deeper':
        await this.handleGoDeeper(interaction);
        break;
      case 'fish_reel':
        if (this.state === 'fishing') {
          await this.handleReel(interaction);
        }
        break;
      case 'fish_reel_click':
        if (this.state === 'reeling') {
          await this.handleReelClick(interaction);
        }
        break;
      default:
        await interaction.reply({
          content: 'Unknown action.',
          ephemeral: true,
        });
    }
  }

  /**
   * Handle cast button
   */
  private async handleCast(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'casting') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    this.state = 'fishing';
    this.data.depth = 25; // Start at 25m

    const embed = this.createFishingEmbed();
    const row = this.createFishingButtons();

    await interaction.update({
      embeds: [embed],
      components: [row],
    });
  }

  /**
   * Handle go deeper button
   */
  private async handleGoDeeper(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'fishing') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    this.data.depth += this.DEPTH_INCREMENT;

    const embed = this.createFishingEmbed();
    const row = this.createFishingButtons();

    await interaction.update({
      embeds: [embed],
      components: [row],
    });
  }

  /**
   * Handle reel button
   */
  private async handleReel(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'fishing') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    // Select loot based on current depth
    const availableLoot = await getLootAtDepth(this.data.depth);
    this.data.selectedLoot = selectWeightedLoot(availableLoot);

    if (!this.data.selectedLoot) {
      await interaction.update({
        content: 'Something went wrong. No loot available at this depth.',
        components: [],
      });
      this.cleanup();
      return;
    }

    // Set reel difficulty based on loot
    this.data.reelDifficulty = getReelDifficultyMultiplier(
      this.data.selectedLoot.reel_difficulty
    );

    this.state = 'reeling';
    this.data.reelProgress = 0;
    this.data.lastReelTime = Date.now();

    // Start reeling mechanic
    this.startReelingMechanic(interaction);
  }

  /**
   * Start the reeling mini-game
   */
  private async startReelingMechanic(interaction: MessageComponentInteraction): Promise<void> {
    this.data.reelingStartTime = Date.now();
    this.data.reelProgress = 0;
    this.data.lastReelTime = Date.now();

    const embed = this.createReelingEmbed();
    const row = this.createReelingButtons();

    await interaction.update({
      embeds: [embed],
      components: [row],
    });

    // Start decay interval
    this.reelInterval = setInterval(() => {
      this.handleReelDecay();
    }, this.REEL_DECAY_INTERVAL_MS);
  }

  /**
   * Handle reel button click during reeling
   */
  private async handleReelClick(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'reeling') {
      await interaction.reply({
        content: 'Invalid action for current state.',
        ephemeral: true,
      });
      return;
    }

    this.data.lastReelTime = Date.now();
    this.data.reelProgress = Math.min(100, this.data.reelProgress + this.REEL_INCREMENT);

    // Check if complete
    if (this.data.reelProgress >= 100) {
      await this.completeGame(interaction);
    } else {
      const embed = this.createReelingEmbed();
      const row = this.createReelingButtons();

      await interaction.update({
        embeds: [embed],
        components: [row],
      });
    }
  }

  /**
   * Handle reeling progress decay
   */
  private handleReelDecay(): void {
    if (this.state !== 'reeling') return;

    const now = Date.now();
    
    // Check if grace period has passed
    if (this.data.reelingStartTime && (now - this.data.reelingStartTime) < this.REEL_GRACE_PERIOD_MS) {
      return; // Still in grace period, no decay
    }

    const timeSinceLastReel = now - this.data.lastReelTime;

    // Apply decay if user hasn't reeled recently
    if (timeSinceLastReel > 1000) {
      const decay = this.REEL_DECAY_AMOUNT * this.data.reelDifficulty;
      this.data.reelProgress = Math.max(0, this.data.reelProgress - decay);

      // Check if failed
      if (this.data.reelProgress <= 0) {
        this.failGame();
      }
    }
  }

  /**
   * Complete the game successfully
   */
  private async completeGame(interaction: MessageComponentInteraction): Promise<void> {
    this.state = 'complete';
    this.cleanup();

    if (!this.data.selectedLoot) {
      await interaction.update({
        content: 'Something went wrong.',
        components: [],
      });
      return;
    }

    const reward = calculateReward(this.data.selectedLoot);

    // Award reward
    const awardResult = await awardCoins(
      this.data.userId,
      reward,
      'fish',
      {
        reason: 'Fishing reward',
        description: `Caught: ${this.data.selectedLoot.name}`
      }
    );

    if (awardResult === null) {
      await interaction.update({
        content: 'Failed to award your reward. Please contact support.',
        components: [],
      });
      return;
    }

    const embed = this.createResultEmbed(reward, true);

    await interaction.update({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Fail the game (catch escaped)
   */
  private async failGame(): Promise<void> {
    this.state = 'failed';
    this.cleanup();

    if (!this.data.message) {
      console.error('[Fishing Game] No message stored for failGame');
      return;
    }

    try {
      const embed = this.createResultEmbed(0, false);

      await this.data.message.edit({
        embeds: [embed],
        components: [],
      });
    } catch (error) {
      console.error('[Fishing Game] Error updating message on fail:', error);
    }
  }

  /**
   * Handle game timeout
   */
  private async timeoutGame(message: Message): Promise<void> {
    this.state = 'failed';
    this.cleanup();

    const embed = this.createResultEmbed(0, false);

    await message.edit({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Cleanup intervals and timeouts
   */
  private cleanup(): void {
    if (this.reelInterval) {
      clearInterval(this.reelInterval);
      this.reelInterval = null;
    }
    if (this.gameTimeout) {
      clearTimeout(this.gameTimeout);
      this.gameTimeout = null;
    }
  }

  /**
   * Check if game is finished
   */
  isFinished(): boolean {
    return this.state === 'complete' || this.state === 'failed';
  }

  // Embed creation methods

  private createCastingEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('🎣 BOB\'S FISHING')
      .setDescription('*You cast your line into the water...*')
      .setColor(0x3498db)
      .addFields(
        { name: 'Depth', value: '0m', inline: true },
        { name: 'Potential', value: 'Unknown', inline: true }
      );
  }

  private createFishingEmbed(): EmbedBuilder {
    const depthEmoji = this.getDepthEmoji(this.data.depth);
    return new EmbedBuilder()
      .setTitle('🌊 FISHING')
      .setDescription(`*You are fishing at ${this.data.depth}m deep...*`)
      .setColor(0x3498db)
      .addFields(
        { name: 'Depth', value: `${depthEmoji} ${this.data.depth}m`, inline: true },
        { name: 'Potential', value: this.getPotentialDescription(), inline: true }
      );
  }

  private createReelingEmbed(): EmbedBuilder {
    const progressBar = this.createProgressBar(this.data.reelProgress);
    return new EmbedBuilder()
      .setTitle('🎣 REEL IT IN!')
      .setDescription('*Something is fighting your line!*')
      .setColor(0xe67e22)
      .addFields(
        { name: 'Reeling', value: `${progressBar} ${this.data.reelProgress.toFixed(0)}%`, inline: false }
      );
  }

  private createResultEmbed(reward: number, success: boolean): EmbedBuilder {
    if (!this.data.selectedLoot) {
      return new EmbedBuilder()
        .setTitle('💦 THE CATCH GOT AWAY')
        .setDescription('*You were so close...*')
        .setColor(0xe74c3c)
        .addFields(
          { name: 'Reward', value: `0 <:cash:1545149005544165416>`, inline: true }
        );
    }

    const loot = this.data.selectedLoot;
    const title = success ? '🎣 FISHING COMPLETE' : '💦 THE CATCH GOT AWAY';
    const color = success ? 0x2ecc71 : 0xe74c3c;

    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(`━━━━━━━━━━━━━━\n\n${loot.emoji} **${loot.name}**\n*${loot.description || ''}*\n\n**Depth:** ${this.data.depth}m\n\n**Reward:** **${success ? '+' : '-'}${reward.toLocaleString('en-US')} <:cash:1545149005544165416>**\n\n━━━━━━━━━━━━━━`)
      .setColor(color)
      .addFields(
        { name: '💰 Total earned', value: `${success ? '+' : '-'}${reward.toLocaleString('en-US')} <:cash:1545149005544165416>`, inline: false }
      );
  }

  // Button creation methods

  private createCastingButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('fish_cast')
        .setLabel('🎣 CAST')
        .setStyle(ButtonStyle.Primary)
    );
  }

  private createFishingButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('fish_deeper')
        .setLabel('🌊 GO DEEPER')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('fish_reel')
        .setLabel('🎣 REEL IN')
        .setStyle(ButtonStyle.Success)
    );
  }

  private createReelingButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('fish_reel_click')
        .setLabel('🔄 REEL')
        .setStyle(ButtonStyle.Primary)
    );
  }

  // Helper methods

  private getDepthEmoji(depth: number): string {
    if (depth < 50) return '🌊';
    if (depth < 100) return '🌊🌊';
    if (depth < 150) return '🌊🌊🌊';
    if (depth < 200) return '🌊🌊🌊🌊';
    return '🌑';
  }

  private getPotentialDescription(): string {
    if (this.data.depth < 50) return 'Common fish and trash';
    if (this.data.depth < 100) return 'Better fish and valuables';
    if (this.data.depth < 150) return 'Rare fish and diamonds';
    if (this.data.depth < 200) return 'Very valuable treasure';
    return 'Extremely rare finds';
  }

  private createProgressBar(progress: number): string {
    const filled = Math.floor(progress / 5);
    const empty = 20 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}
