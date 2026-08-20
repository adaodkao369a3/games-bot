import { Message, MessageComponentInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, TextChannel, EmbedBuilder } from 'discord.js';
import { TrialState, TrialPhase, DefenseRound, VoteRound, DefenseDuration, TrialConfig } from './trial-types.js';
import { TrialRenderer } from './trial-renderer.js';
import { VoteManager } from '../shared/voting/vote-manager.js';
import { BobKunPersonality } from '../../services/bob-kun-personality.js';

export class TrialGame {
  private state: TrialState;
  private currentMessage?: Message;
  private votingMessage?: Message;
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
   * Show court opening with GIF
   */
  private async showCourtOpening(): Promise<void> {
    this.state.phase = 'opening';

    const embed = TrialRenderer.createCourtOpeningEmbed();
    await this.currentMessage?.edit({
      content: null,
      embeds: [embed],
      components: [],
    });

    // Wait 5 seconds then proceed to defense
    await this.delay(this.COURT_OPENING_DURATION);
    await this.showDefenseGif();
  }

  /**
   * Show defense GIF then text
   */
  private async showDefenseGif(): Promise<void> {
    const embed = TrialRenderer.createDefenseGifEmbed();
    await this.currentMessage?.edit({
      embeds: [embed],
    });

    // Wait 5 seconds then show defense text
    await this.delay(this.DEFENSE_GIF_DURATION);
    await this.startDefenseStage();
  }

  /**
   * Start defense stage with countdown
   */
  private async startDefenseStage(): Promise<void> {
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

    // Start countdown updates
    this.updateDefenseCountdown();
  }

  /**
   * Update defense countdown
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

      await this.currentMessage?.edit({
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

    // Create new message for jury voting
    const juryEmbed = TrialRenderer.createJuryEmbed();
    this.votingMessage = await (this.currentMessage?.channel as TextChannel).send({
      embeds: [juryEmbed],
    });

    // Generate initial voting card
    await this.updateVotingCard();

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
   * Handle draw - return to defense with shorter timer and dramatic transition
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

    // Show dramatic draw transition
    await this.showDrawTransition();

    // Return to defense
    await this.startDefenseStage();
  }

  /**
   * Show guilty result
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

    // Wait a moment then show guilty GIF with action buttons
    await this.delay(1500);

    // Show guilty GIF with sentence and jump buttons
    const guiltyEmbed = TrialRenderer.createGuiltyResultEmbedWithGif(
      `<@${this.state.accusedId}>`,
      this.state.accusation,
      this.state.sentence
    );

    await this.votingMessage?.edit({
      files: [],
      embeds: [guiltyEmbed],
      components: [TrialRenderer.createSentenceButton(), TrialRenderer.createJumpButton()],
    });

    this.state.phase = 'sentence';
  }

  /**
   * Show innocent result
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

    // Wait a moment then show innocent GIF with mute button
    await this.delay(1500);

    // Show innocent GIF with mute button
    const innocentEmbed = TrialRenderer.createInnocentResultEmbedWithGif();

    await this.votingMessage?.edit({
      files: [],
      embeds: [innocentEmbed],
      components: [TrialRenderer.createMuteButton()],
    });
  }

  /**
   * Show dramatic draw transition
   */
  private async showDrawTransition(): Promise<void> {
    const drawMessage = this.state.voteRound === 2 
      ? BobKunPersonality.trialDrawFirst
      : BobKunPersonality.trialDrawSecond;

    const embed = new EmbedBuilder()
      .setTitle('⚖️ DRAW')
      .setDescription(drawMessage)
      .setColor(0xFFA500)
      .setTimestamp();

    await this.votingMessage?.edit({
      embeds: [embed],
      components: [],
    });

    // Wait 3 seconds for dramatic effect
    await this.delay(3000);
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
   * Process sentence submission
   */
  async processSentenceSubmission(interaction: MessageComponentInteraction, sentence: string): Promise<void> {
    if (interaction.user.id !== this.state.accuserId) {
      await interaction.reply({
        content: 'Only the accuser can set the sentence.',
        ephemeral: true,
      });
      return;
    }

    this.state.sentence = sentence;

    // Update embed with sentence (use GIF version)
    const embed = TrialRenderer.createGuiltyResultEmbedWithGif(
      `<@${this.state.accusedId}>`,
      this.state.accusation,
      sentence
    );

    await this.votingMessage?.edit({
      embeds: [embed],
    });

    await interaction.reply({
      content: 'Sentence has been set!',
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
            .setDescription('The jury has found the accused NOT GUILTY!\n\n**The accuser has been muted for 30 seconds.**')
        ],
      });

      // Mark trial as ended to prevent re-triggering
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