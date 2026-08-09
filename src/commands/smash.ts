import { SlashCommandBuilder, ChatInputCommandInteraction, MessageComponentInteraction } from 'discord.js';
import { SmashScheduler } from '../services/smash-scheduler.js';
import { SmashRepository } from '../database/repositories/smash-repository.js';
import { SmashUI, SmashUIData } from '../ui/smash-ui.js';
import { BobKunPersonality } from '../services/bob-kun-personality.js';
import { ErrorHandler } from '../utils/error-handler.js';

export const smashCommand = new SlashCommandBuilder()
  .setName('smash')
  .setDescription('Force Bob Kun to start a Smash This event immediately')
  .addUserOption(option =>
    option.setName('user1')
      .setDescription('First user to smash (optional)')
      .setRequired(false)
  )
  .addUserOption(option =>
    option.setName('user2')
      .setDescription('Second user to smash (optional)')
      .setRequired(false)
  );

// Global scheduler instance
let scheduler: SmashScheduler | null = null;

export function setScheduler(schedulerInstance: SmashScheduler): void {
  scheduler = schedulerInstance;
}

export async function handleSmash(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    if (!scheduler) {
      await interaction.editReply({
        content: `${BobKunPersonality.emojis.confused} Bob Kun is not ready yet!`,
      });
      return;
    }

    const channelId = interaction.channelId;
    const guildId = interaction.guildId || '';
    const botId = interaction.client.user?.id || '';

    // Get optional user parameters
    const user1 = interaction.options.getUser('user1');
    const user2 = interaction.options.getUser('user2');

    // Validate user parameters
    if (user1 && !user2) {
      await interaction.editReply({
        content: `${BobKunPersonality.emojis.confused} Bob Kun needs both users or neither! Provide both user1 and user2, or neither for random selection.`,
      });
      return;
    }

    if (user1 && user2) {
      // Both users provided - validate they are real members and not bots
      if (!interaction.guild) {
        await interaction.editReply({
          content: `${BobKunPersonality.emojis.confused} Bob Kun can only do this in a server!`,
        });
        return;
      }

      const member1 = await interaction.guild.members.fetch(user1.id).catch(() => null);
      const member2 = await interaction.guild.members.fetch(user2.id).catch(() => null);

      if (!member1 || !member2) {
        await interaction.editReply({
          content: `${BobKunPersonality.emojis.confused} Bob Kun can't find those users! They must be real server members.`,
        });
        return;
      }

      if (user1.bot || user2.bot) {
        await interaction.editReply({
          content: `${BobKunPersonality.emojis.confused} Bob Kun doesn't let bots participate!`,
        });
        return;
      }

      if (user1.id === user2.id) {
        await interaction.editReply({
          content: `${BobKunPersonality.emojis.confused} Bob Kun can't smash someone against themselves!`,
        });
        return;
      }

      // Attempt to start a manual event with specific users
      const result = await scheduler.startManualEvent(channelId, guildId, botId, user1, user2);
      
      if (!result.success) {
        await interaction.editReply({
          content: result.message || BobKunPersonality.error,
        });
        return;
      }
    } else {
      // No users provided - use random selection
      const result = await scheduler.startManualEvent(channelId, guildId, botId);
      
      if (!result.success) {
        await interaction.editReply({
          content: result.message || BobKunPersonality.error,
        });
        return;
      }
    }

    // Get the created event
    const repository = new SmashRepository();
    const event = repository.getActiveEventInChannel(channelId);
    
    if (!event) {
      await interaction.editReply({
        content: BobKunPersonality.error,
      });
      return;
    }

    // Create UI
    const uiData: SmashUIData = {
      player1Name: event.player1DisplayName,
      player1Avatar: event.player1AvatarUrl || '',
      player2Name: event.player2DisplayName,
      player2Avatar: event.player2AvatarUrl || '',
      matchupId: event.eventId,
      round: 1,
      totalRounds: 1,
    };

    const embed = SmashUI.createMatchupEmbed(uiData);
    const actionRow = SmashUI.createActionRow(event.eventId);

    await interaction.editReply({
      content: BobKunPersonality.demandDecision,
      embeds: [embed],
      components: [actionRow],
    });

    // Start the 20-second voting timer
    setTimeout(async () => {
      await endVotingPeriod(interaction, event.eventId);
    }, 20 * 1000);

  } catch (error) {
    await ErrorHandler.handleInteractionError(interaction, error, 'smash');
  }
}

export async function handleSmashVote(interaction: MessageComponentInteraction): Promise<void> {
  const customId = interaction.customId;
  
  if (!customId.startsWith('smash_vote_')) {
    return;
  }

  const parts = customId.split('_');
  const eventId = parts[2];
  const player = parts[3]; // 'player1' or 'player2'

  await interaction.deferReply({ ephemeral: true });

  try {
    const repository = new SmashRepository();
    const event = repository.getEvent(eventId);

    if (!event) {
      await interaction.editReply({
        content: 'Event not found',
      });
      return;
    }

    const votedForId = player === 'player1' ? event.player1Id : event.player2Id;
    const voterId = interaction.user.id;

    // Check if user is a bot
    if (interaction.user.bot) {
      await interaction.editReply({
        content: `${BobKunPersonality.emojis.confused} Bob Kun doesn't let bots vote!`,
      });
      return;
    }

    // Check if user already voted
    const existingVote = repository.getVote(eventId, voterId);
    if (existingVote) {
      await interaction.editReply({
        content: `${BobKunPersonality.emojis.confused} Bob Kun sees you already voted!`,
      });
      return;
    }

    // Cast vote
    await repository.addVote({
      eventId,
      voterId,
      votedForId,
      votedAt: Date.now(),
    });

    await interaction.editReply({
      content: `${BobKunPersonality.emojis.banana} Bob Kun recorded your vote!`,
    });

  } catch (error) {
    await ErrorHandler.handleInteractionError(interaction, error, 'smash-vote');
  }
}

async function endVotingPeriod(interaction: ChatInputCommandInteraction, eventId: string): Promise<void> {
  const repository = new SmashRepository();
  const event = repository.getEvent(eventId);
  
  if (!event) return;

  // Count votes
  const { player1, player2 } = repository.countVotesForEvent(eventId);
  
  // Update event
  await repository.updateEvent(eventId, {
    player1Votes: player1,
    player2Votes: player2,
    votingEndedAt: Date.now(),
  });

  // Determine winner or tie
  let winnerName: string = '';
  let winnerAvatar: string = '';
  let isTie = false;

  if (player1 > player2) {
    winnerName = event.player1DisplayName;
    winnerAvatar = event.player1AvatarUrl || '';
    await repository.updateEvent(eventId, {
      status: 'completed',
      winnerId: event.player1Id,
    });
  } else if (player2 > player1) {
    winnerName = event.player2DisplayName;
    winnerAvatar = event.player2AvatarUrl || '';
    await repository.updateEvent(eventId, {
      status: 'completed',
      winnerId: event.player2Id,
    });
  } else {
    // Tie
    isTie = true;
    await repository.updateEvent(eventId, {
      status: 'tie',
    });
  }

  // Show result
  if (isTie) {
    const tieEmbed = SmashUI.createTieEmbed(player1, player2);
    await interaction.editReply({
      embeds: [tieEmbed],
      components: [],
    });
  } else {
    const resultEmbed = SmashUI.createResultEmbed(winnerName, winnerAvatar, player1, player2);
    await interaction.editReply({
      embeds: [resultEmbed],
      components: [],
    });
  }
}
