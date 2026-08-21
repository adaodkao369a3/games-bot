import { Message, MessageComponentInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, TextChannel, EmbedBuilder } from 'discord.js';
import { TrialState, TrialPhase, DefenseRound, VoteRound, DefenseDuration, TrialConfig } from './trial-types.js';
import { TrialRenderer } from './trial-renderer.js';
import { VoteManager } from '../shared/voting/vote-manager.js';
import { BobKunPersonality } from '../../services/bob-kun-personality.js';

export class TrialGame {
  private state: TrialState;
  private currentMessage?: Message; // Initial command message
  private defenseMessage?: Message; // Current defense message
  private votingMessage?: Message; // Current voting/result message
  private timers: NodeJS.Timeout[] = [];
  private onTrialEnd?: () => void;
  private voteManager?: VoteManager;
  private avatarBuffer?: Buffer;
  
  private readonly COURT_OPENING_DURATION = 5000; // 5 seconds
  private readonly DEFENSE_GIF_DURATION = 5000; // 5 seconds
  private readonly JUMP_DURATION = 3000; // 3 seconds
  private readonly VOTING_DURATION = 25 * 1000; // 25 seconds

  constructor(config: TrialConfig, onTrialEnd?: () => void) {
    this.state = {
      trialId: config.trialId,
      channelId: config.channelId,
      guildId: config.guildId,
      accuserId: config.accuserId,
      accusedId: config.accusedId,
      accusation: config.accusation,
      phase: 'opening',
      defenseRound: 1,
      defenseDurationSeconds: 60,
      voteRound: 1,
      guiltyVotes: new Set(),
      innocentVotes: new Set(),
      startedAt: Date.now(),
    };
    this.onTrialEnd = onTrialEnd;
  }

  /**
   * Start the trial
   */
  async start(message: Message): Promise<void> {
    this.currentMessage = message;
    await this.showCourtOpening();
  }

  /**
   * Show court opening with defense text and GIF in single embed
   */
  private async showCourtOpening(): Promise<void> {
    this.state.phase = 'defense';
    this.state.defenseEndsAt = Date.now() + (this.state.defenseDurationSeconds * 1000);

    // Download accused avatar for later use
    try {
      const guild = await this.currentMessage?.client.guilds.fetch(this.state.guildId);
      if (guild) {
        const accusedMember = await guild.members.fetch(this.state.accusedId);
        const avatarUrl = accusedMember?.user?.avatarURL();
        if (avatarUrl) {
          this.avatarBuffer = await TrialRenderer.downloadAvatar(avatarUrl);
        }
      }
    } catch (error) {
      console.error('[TrialGame] Failed to download avatar:', error);
    }

    // Create defense message with GIF in the same embed
    const defenseEmbed = TrialRenderer.createDefenseEmbedWithGif(
      `<@${this.state.accusedId}>`,
      `<@${this.state.accuserId}>`,
      this.state.accusation,
      this.state.defenseDurationSeconds
    );

    this.defenseMessage = await (this.currentMessage?.channel as TextChannel).send({
      embeds: [defenseEmbed],
    });

    // Start 4-second timer to remove GIF
    this.startGifRemovalTimer();

    // Start countdown updates
    this.updateDefenseCountdown();
  }

  /**
   * Start 4-second timer to remove GIF from defense message
   */
  private startGifRemovalTimer(): void {
    const gifTimeout = setTimeout(async () => {
      if (this.state.phase === 'defense') {
        // Remove GIF, keep defense text
        const remaining = Math.max(0, Math.ceil((this.state.defenseEndsAt! - Date.now()) / 1000));
        const embed = TrialRenderer.createDefenseEmbed(
          `<@${this.state.accusedId}>`,
          `<@${this.state.accuserId}>`,
          this.state.accusation,
          remaining
        );
        await this.defenseMessage?.edit({
          embeds: [embed],
        });
      }
    }, 4000); // 4 seconds

    this.timers.push(gifTimeout as any);
  }

  /**
   * Start defense stage with countdown - creates NEW message or edits existing (after draw)
   */
  private async startDefenseStage(): Promise<void> {
    this.state.phase = 'defense';
    this.state.defenseEndsAt = Date.now() + (this.state.defenseDurationSeconds * 1000);

    const defenseEmbed = TrialRenderer.createDefenseEmbedWithGif(
      `<@${this.state.accusedId}>`,
      `<@${this.state.accuserId}>`,
      this.state.accusation,
      this.state.defenseDurationSeconds
    );

    // If defenseMessage exists (after draw), edit it with GIF. Otherwise create new.
    if (this.defenseMessage) {
      await this.defenseMessage.edit({
        embeds: [defenseEmbed],
      });
      // Start 4-second timer to remove GIF
      this.startGifRemovalTimer();
    } else {
      this.defenseMessage = await (this.currentMessage?.channel as TextChannel).send({
        embeds: [defenseEmbed],
      });
      // Start 4-second timer to remove GIF
      this.startGifRemovalTimer();
    }

    // Start countdown updates
    this.updateDefenseCountdown();
  }

  /**
   * Update defense countdown on the defense message
   */
  private updateDefenseCountdown(): void {
    const updateInterval = setInterval(async () => {
      if (this.state.phase !== 'defense') {
        clearInterval(updateInterval);
        return;
      }

      const remaining = Math.max(0, Math.ceil((this.state.defenseEndsAt! - Date.now()) / 1000));

      const embed = TrialRenderer.createDefenseEmbed(
        `<@${this.state.accusedId}>`,
        `<@${this.state.accuserId}>`,
        this.state.accusation,
        remaining
      );

      await this.defenseMessage?.edit({
        embeds: [embed],
      });

      if (remaining <= 0) {
        clearInterval(updateInterval);
        await this.startJuryVoting();
      }
    }, 1000);

    this.timers.push(updateInterval as any);
  }

  /**
   * Start jury voting
   */
  private async startJuryVoting(): Promise<void> {
    this.state.phase = 'voting';
    this.state.votingEndsAt = Date.now() + this.VOTING_DURATION;

    // Generate initial voting card
    const cardBuffer = await TrialRenderer.generateVotingCard(
      this.avatarBuffer!,
      0,
      0
    );

    const attachment = new AttachmentBuilder(cardBuffer, { name: 'trial-voting.png' });

    const juryEmbed = TrialRenderer.createJuryEmbed()
      .setImage('attachment://trial-voting.png');

    // Create new message for jury voting with image and buttons
    this.votingMessage = await (this.currentMessage?.channel as TextChannel).send({
      files: [attachment],
      embeds: [juryEmbed],
      components: [TrialRenderer.createVotingButtons()],
    });

    // Initialize vote manager
    this.voteManager = new VoteManager(
      this.VOTING_DURATION,
      (result) => this.handleVotingResult(result),
      () => this.updateVotingCard()
    );
    this.voteManager.startVoting();
  }

  /**
   * Update voting card with current votes
   */
  private async updateVotingCard(): Promise<void> {
    if (!this.avatarBuffer || !this.votingMessage) return;

    const guiltyVotes = this.state.guiltyVotes.size;
    const innocentVotes = this.state.innocentVotes.size;

    const cardBuffer = await TrialRenderer.generateVotingCard(
      this.avatarBuffer,
      guiltyVotes,
      innocentVotes
    );

    const attachment = new AttachmentBuilder(cardBuffer, { name: 'trial-voting.png' });

    const embed = TrialRenderer.createJuryEmbed()
      .setImage('attachment://trial-voting.png');

    await this.votingMessage.edit({
      files: [attachment],
      embeds: [embed],
      components: [TrialRenderer.createVotingButtons()],
    });
  }

  /**
   * Handle voting result
   */
  private async handleVotingResult(result: { winner: 'subject1' | 'subject2' | 'tie'; subject1Votes: number; subject2Votes: number }): Promise<void> {
    const guiltyWins = result.winner === 'subject1';
    const innocentWins = result.winner === 'subject2';
    const isDraw = result.winner === 'tie';

    // Update voting card with disabled buttons first
    const cardBuffer = await TrialRenderer.generateVotingCard(
      this.avatarBuffer!,
      this.state.guiltyVotes.size,
      this.state.innocentVotes.size
    );

    const attachment = new AttachmentBuilder(cardBuffer, { name: 'trial-voting.png' });

    await this.votingMessage?.edit({
      files: [attachment],
      components: [TrialRenderer.createDisabledVotingButtons()],
    });

    if (isDraw) {
      await this.handleDraw();
    } else if (guiltyWins) {
      this.state.result = 'guilty';
      await this.showGuiltyResult();
    } else {
      this.state.result = 'innocent';
      await this.showInnocentResult();
    }
  }

  /**
   * Handle draw - edit voting message into defense message with GIF
   */
  private async handleDraw(): Promise<void> {
    if (this.state.voteRound >= 3) {
      // Third draw - end trial with no judgement
      await this.showNoJudgement();
      return;
    }

    // Increment rounds
    this.state.voteRound = (this.state.voteRound + 1) as VoteRound;
    this.state.defenseRound = (this.state.defenseRound + 1) as DefenseRound;

    // Reduce defense time
    if (this.state.defenseRound === 2) {
      this.state.defenseDurationSeconds = 30;
    } else if (this.state.defenseRound === 3) {
      this.state.defenseDurationSeconds = 15;
    }

    // Clear votes
    this.state.guiltyVotes.clear();
    this.state.innocentVotes.clear();

    // votingMessage becomes the new defenseMessage
    this.defenseMessage = this.votingMessage;
    this.votingMessage = undefined;

    // Start defense stage (will edit the defense message with GIF)
    await this.startDefenseStage();
  }

  /**
   * Show guilty result - edit voting message to show result image, then GIF
   */
  private async showGuiltyResult(): Promise<void> {
    this.state.phase = 'result';

    // Generate result card with blur effect
    const cardBuffer = await TrialRenderer.generateResultCard(
      this.avatarBuffer!,
      this.state.guiltyVotes.size,
      this.state.innocentVotes.size,
      'guilty'
    );

    const attachment = new AttachmentBuilder(cardBuffer, { name: 'trial-result.png' });

    const embed = TrialRenderer.createGuiltyResultEmbed(
      `<@${this.state.accusedId}>`,
      this.state.accusation,
      this.state.sentence
    ).setImage('attachment://trial-result.png');

    // First show result with disabled voting buttons
    await this.votingMessage?.edit({
      files: [attachment],
      embeds: [embed],
      components: [TrialRenderer.createDisabledVotingButtons()],
    });

    // Wait 5 seconds then show guilty GIF with action buttons
    await this.delay(5000);

    // Show guilty GIF with jump button only (sentence is displayed in embed text)
    const guiltyEmbed = TrialRenderer.createGuiltyResultEmbedWithGif(
      `<@${this.state.accusedId}>`,
      this.state.accusation,
      this.state.sentence
    );

    await this.votingMessage?.edit({
      files: [],
      embeds: [guiltyEmbed],
      components: [TrialRenderer.createJumpButton()],
    });

    this.state.phase = 'sentence';

    // Start 10-second timer for jump button availability
    this.startJumpButtonTimer();
  }

  /**
   * Start 10-second timer for jump button
   */
  private startJumpButtonTimer(): void {
    const jumpTimeout = setTimeout(async () => {
      // Remove jump button after 10 seconds
      if (this.state.phase === 'sentence') {
        await this.votingMessage?.edit({
          components: [],
        });
        // End trial to cleanup collectors/timers
        await this.endTrial();
      }
    }, 10000); // 10 seconds

    this.timers.push(jumpTimeout as any);
  }

  /**
   * Show innocent result - edit voting message to show result image, then GIF
   */
  private async showInnocentResult(): Promise<void> {
    this.state.phase = 'innocent';

    // Generate result card with blur effect
    const cardBuffer = await TrialRenderer.generateResultCard(
      this.avatarBuffer!,
      this.state.guiltyVotes.size,
      this.state.innocentVotes.size,
      'innocent'
    );

    const attachment = new AttachmentBuilder(cardBuffer, { name: 'trial-result.png' });

    const embed = TrialRenderer.createInnocentResultEmbed()
      .setImage('attachment://trial-result.png');

    // First show result with disabled voting buttons
    await this.votingMessage?.edit({
      files: [attachment],
      embeds: [embed],
      components: [TrialRenderer.createDisabledVotingButtons()],
    });

    // Wait 5 seconds then show innocent GIF with mute button
    await this.delay(5000);

    // Show innocent GIF with mute button
    const innocentEmbed = TrialRenderer.createInnocentResultEmbedWithGif();

    await this.votingMessage?.edit({
      files: [],
      embeds: [innocentEmbed],
      components: [TrialRenderer.createMuteButton()],
    });

    // Start 10-second timer for mute button availability
    this.startMuteButtonTimer();
  }

  /**
   * Start 10-second timer for mute button
   */
  private startMuteButtonTimer(): void {
    const muteTimeout = setTimeout(async () => {
      // Remove mute button after 10 seconds
      if (this.state.phase === 'innocent') {
        await this.votingMessage?.edit({
          components: [],
        });
        // End trial to cleanup collectors/timers
        await this.endTrial();
      }
    }, 10000); // 10 seconds

    this.timers.push(muteTimeout as any);
  }

  /**
   * Show no judgement
   */
  private async showNoJudgement(): Promise<void> {
    this.state.phase = 'no_judgement';

    const embed = TrialRenderer.createNoJudgementEmbed();
    await this.votingMessage?.edit({
      embeds: [embed],
      components: [],
    });

    await this.endTrial();
  }

  /**
   * Handle interaction
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    const userId = interaction.user.id;
    const customId = interaction.customId;

    // Vote buttons
    if (customId === 'trial_vote_guilty' || customId === 'trial_vote_innocent') {
      await this.handleVote(interaction, userId, customId === 'trial_vote_guilty' ? 'subject1' : 'subject2');
      return;
    }

    // Sentence button (accuser only)
    if (customId === 'trial_sentence') {
      if (userId !== this.state.accuserId) {
        await interaction.reply({
          content: 'Only the accuser can set the sentence.',
          ephemeral: true,
        });
        return;
      }
      await this.handleSentence(interaction);
      return;
    }

    // Jump button (accused only)
    if (customId === 'trial_jump') {
      if (userId !== this.state.accusedId) {
        await interaction.reply({
          content: 'Only the accused can jump em.',
          ephemeral: true,
        });
        return;
      }
      await this.handleJump(interaction);
      return;
    }

    // Mute button (accused only)
    if (customId === 'trial_mute') {
      if (userId !== this.state.accusedId) {
        await interaction.reply({
          content: 'Only the accused can mute the accuser.',
          ephemeral: true,
        });
        return;
      }
      await this.handleMute(interaction);
      return;
    }
  }

  /**
   * Handle vote - everyone can vote including accuser and accused
   */
  private async handleVote(interaction: MessageComponentInteraction, userId: string, choice: 'subject1' | 'subject2'): Promise<void> {
    if (!this.voteManager) return;

    const result = this.voteManager.handleVote(userId, choice);
    
    if (result.success) {
      // Track votes locally
      if (choice === 'subject1') {
        this.state.guiltyVotes.add(userId);
      } else {
        this.state.innocentVotes.add(userId);
      }
    }

    await interaction.reply({
      content: result.message,
      ephemeral: true,
    });
  }

  /**
   * Handle sentence input - edit mode if sentence already exists
   */
  private async handleSentence(interaction: MessageComponentInteraction): Promise<void> {
    const isEdit = !!this.state.sentence;
    const modal = new ModalBuilder()
      .setCustomId('trial_sentence_modal')
      .setTitle(isEdit ? 'Edit Sentence' : 'Enter Sentence');

    const sentenceInput = new TextInputBuilder()
      .setCustomId('sentence_text')
      .setLabel('What is the sentence?')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('e.g., no more sandwiches for you');

    if (isEdit && this.state.sentence) {
      sentenceInput.setValue(this.state.sentence);
    }

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(sentenceInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }

  /**
   * Process sentence submission - only saves sentence, does not end voting
   */
  async processSentenceSubmission(interaction: MessageComponentInteraction, sentence: string): Promise<void> {
    if (interaction.user.id !== this.state.accuserId) {
      await interaction.reply({
        content: 'Only the accuser can set the sentence.',
        ephemeral: true,
      });
      return;
    }

    // Only save the sentence - do not end voting or change phase
    this.state.sentence = sentence;

    // Calculate remaining time
    const remainingTime = Math.max(0, Math.ceil((this.state.votingEndsAt! - Date.now()) / 1000));

    await interaction.reply({
      content: `📝 Sentence submitted! ⏱️ **${remainingTime} seconds remaining**`,
      ephemeral: true,
    });
  }

  /**
   * Handle jump
   */
  private async handleJump(interaction: MessageComponentInteraction): Promise<void> {
    await interaction.update({
      components: [], // Remove buttons
    });

    // Show jump embed
    const embed = TrialRenderer.createJumpEmbed();
    await this.votingMessage?.edit({
      embeds: [embed],
    });

    // Wait 3 seconds then show technical difficulties
    await this.delay(this.JUMP_DURATION);
    await this.showTechnicalDifficulties();
  }

  /**
   * Show technical difficulties
   */
  private async showTechnicalDifficulties(): Promise<void> {
    this.state.phase = 'technical';

    const embed = TrialRenderer.createTechnicalDifficultiesEmbed();
    await this.votingMessage?.edit({
      embeds: [embed],
    });

    await this.endTrial();
  }

  /**
   * Handle mute accuser
   */
  private async handleMute(interaction: MessageComponentInteraction): Promise<void> {
    // Check if mute has already been applied
    if (this.state.phase === 'ended') {
      await interaction.reply({
        content: 'This trial has already concluded.',
        ephemeral: true,
      });
      return;
    }

    try {
      const guild = await interaction.guild?.fetch();
      if (!guild) {
        await interaction.reply({
          content: 'Could not access guild.',
          ephemeral: true,
        });
        return;
      }

      const accuserMember = await guild.members.fetch(this.state.accuserId);
      
      // Timeout for 30 seconds
      await accuserMember.timeout(30 * 1000, 'Found guilty in trial');

      // Update UI
      await interaction.update({
        components: [], // Remove button
      });

      await this.votingMessage?.edit({
        embeds: [
          TrialRenderer.createInnocentResultEmbedWithGif()
            .setDescription(`${BobKunPersonality.trialInnocent}\n\n🔇 **PROSECUTOR HAS BEEN MUTED FOR 30 SECONDS.** 😭`)
        ],
      });

      // Mark trial as ended to prevent re-triggering and cleanup
      await this.endTrial();

    } catch (error) {
      console.error('[TrialGame] Failed to mute accuser:', error);
      await interaction.reply({
        content: 'Failed to mute accuser. I may not have the necessary permissions.',
        ephemeral: true,
      });
    }
  }

  /**
   * End trial and cleanup
   */
  private async endTrial(): Promise<void> {
    this.state.phase = 'ended';
    this.clearTimers();
    
    if (this.voteManager) {
      this.voteManager.cleanup();
    }

    if (this.onTrialEnd) {
      this.onTrialEnd();
    }
  }

  /**
   * Get trial state
   */
  getState(): TrialState {
    return { ...this.state };
  }

  /**
   * Check if trial is active
   */
  isActive(): boolean {
    return this.state.phase !== 'ended';
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.clearTimers();
    if (this.voteManager) {
      this.voteManager.cleanup();
    }
    this.state.phase = 'ended';
  }

  /**
   * Clear timers
   */
  private clearTimers(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers = [];
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      const timeout = setTimeout(resolve, ms);
      this.timers.push(timeout);
    });
  }
}