import { Message, MessageComponentInteraction } from 'discord.js';
import { trialManager } from '../games/trial/trial-manager.js';
import { TrialGame } from '../games/trial/trial-game.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { BobKunPersonality } from '../services/bob-kun-personality.js';

// Map for modal submissions
const pendingModals = new Map<string, TrialGame>();

export async function handleTrialCommand(message: Message): Promise<void> {
  try {
    // Check if there's already an active trial in this channel
    if (trialManager.hasActiveTrial(message.channel.id)) {
      await message.reply({
        content: `${BobKunPersonality.gameAlreadyRunning}`,
      });
      return;
    }

    if (!message.guild) {
      await message.reply({
        content: 'Trials can only be held in servers!',
      });
      return;
    }

    // Parse command: ,trial @user [accusation]
    const args = message.content.trim().split(/\s+/);
    
    if (args.length < 3) {
      await message.reply({
        content: `${BobKunPersonality.error} Usage: \`,trial @user [accusation]\nExample: \`,trial @Devin stealing all the sandwiches`,
      });
      return;
    }

    // Extract user mention and accusation
    const userMention = args[1];
    const accusation = args.slice(2).join(' ');

    // Validate user mention
    const userIdMatch = userMention.match(/<@!?(\d+)>/);
    if (!userIdMatch) {
      await message.reply({
        content: `${BobKunPersonality.error} You must mention a user to accuse.`,
      });
      return;
    }

    const accusedId = userIdMatch[1];

    // Validate accusation is not empty
    if (!accusation || accusation.trim().length === 0) {
      await message.reply({
        content: `${BobKunPersonality.error} You must provide an accusation.`,
      });
      return;
    }

    // Prevent self-accusation
    if (accusedId === message.author.id) {
      await message.reply({
        content: `${BobKunPersonality.error} You cannot accuse yourself!`,
      });
      return;
    }

    // Check if accused is a bot
    const accusedMember = await message.guild.members.fetch(accusedId).catch(() => null);
    if (!accusedMember) {
      await message.reply({
        content: `${BobKunPersonality.error} Could not find that user in the server.`,
      });
      return;
    }

    if (accusedMember.user.bot) {
      await message.reply({
        content: `${BobKunPersonality.error} You cannot put a bot on trial!`,
      });
      return;
    }

    // Check bot permissions
    const botMember = await message.guild.members.fetch(message.client.user!.id).catch(() => null);
    if (!botMember) {
      await message.reply({
        content: `${BobKunPersonality.error} I don't have permission to hold trials.`,
      });
      return;
    }

    const permissions = message.channel.permissionsFor(botMember);
    if (!permissions?.has('SendMessages') || !permissions?.has('EmbedLinks')) {
      await message.reply({
        content: `${BobKunPersonality.error} I need SendMessages and EmbedLinks permissions to hold trials.`,
      });
      return;
    }

    // Send initial message
    const replyMessage = await message.reply({
      content: '🍌 Bob Kun is preparing the courtroom...',
    });

    // Create trial
    const trialId = `${message.channel.id}-${Date.now()}`;
    const trial = trialManager.createTrial(
      {
        trialId,
        channelId: message.channel.id,
        guildId: message.guild.id,
        accuserId: message.author.id,
        accusedId,
        accusation,
      },
      () => {
        // Cleanup callback
        trialManager.removeTrial(message.channel.id);
        pendingModals.delete(trialId);
      }
    );

    // Store for modal submission
    pendingModals.set(trialId, trial);

    // Start trial
    await trial.start(replyMessage);

  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'trial');
  }
}

export async function handleTrialInteraction(interaction: MessageComponentInteraction): Promise<void> {
  try {
    const customId = interaction.customId;

    // Only handle trial interactions
    if (!customId.startsWith('trial_')) {
      return;
    }

    const trial = trialManager.getTrial(interaction.channelId);
    
    if (!trial) {
      await interaction.reply({
        content: 'This trial is no longer active.',
        ephemeral: true,
      });
      return;
    }

    await trial.handleInteraction(interaction);

  } catch (error) {
    await ErrorHandler.handleInteractionError(interaction, error, 'trial-interaction');
  }
}

export async function handleTrialModalSubmit(interaction: MessageComponentInteraction, sentence: string): Promise<void> {
  try {
    const trial = trialManager.getTrial(interaction.channelId);
    
    if (!trial) {
      await interaction.reply({
        content: 'This trial is no longer active.',
        ephemeral: true,
      });
      return;
    }

    await trial.processSentenceSubmission(interaction, sentence);

  } catch (error) {
    await ErrorHandler.handleInteractionError(interaction, error, 'trial-modal');
  }
}