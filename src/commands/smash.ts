import { Message, MessageComponentInteraction } from 'discord.js';
import { SmashScheduler } from '../services/smash-scheduler.js';
import { SmashRepository } from '../database/repositories/smash-repository.js';
import { SmashUI, SmashUIData } from '../ui/smash-ui.js';
import { BobKunPersonality } from '../services/bob-kun-personality.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Global scheduler instance
let scheduler: SmashScheduler | null = null;

export function setScheduler(schedulerInstance: SmashScheduler): void {
  scheduler = schedulerInstance;
}

export async function handleSmashCommand(message: Message, args: string[]): Promise<void> {
  try {
    if (!scheduler) {
      await message.reply({
        content: `${BobKunPersonality.emojis.confused} Bob Kun is not ready yet!`,
      });
      return;
    }

    const channelId = message.channelId;
    const guildId = message.guildId || '';
    const botId = message.client.user?.id || '';

    // Parse user mentions from args
    const mentionedUsers = message.mentions.users.filter(user => !user.bot);
    const mentionedUserIds = Array.from(mentionedUsers.keys());

    // Validate user parameters
    if (mentionedUserIds.length === 1) {
      await message.reply({
        content: `${BobKunPersonality.emojis.confused} Bob Kun needs both users or neither! Provide both @User1 and @User2, or neither for random selection.`,
      });
      return;
    }

    if (mentionedUserIds.length >= 2) {
      // Both users provided - validate they are real members and not bots
      if (!message.guild) {
        await message.reply({
          content: `${BobKunPersonality.emojis.confused} Bob Kun can only do this in a server!`,
        });
        return;
      }

      const user1 = mentionedUsers.first();
      const user2 = mentionedUsers.last();

      if (!user1 || !user2) {
        await message.reply({
          content: `${BobKunPersonality.emojis.confused} Bob Kun can't find those users! They must be real server members.`,
        });
        return;
      }

      if (user1.bot || user2.bot) {
        await message.reply({
          content: `${BobKunPersonality.emojis.confused} Bob Kun doesn't let bots participate!`,
        });
        return;
      }

      if (user1.id === user2.id) {
        await message.reply({
          content: `${BobKunPersonality.emojis.confused} Bob Kun can't smash someone against themselves!`,
        });
        return;
      }

      // Attempt to start a manual event with specific users
      const result = await scheduler.startManualEvent(channelId, guildId, botId, user1, user2);
      
      if (!result.success) {
        await message.reply({
          content: result.message || BobKunPersonality.error,
        });
        return;
      }
      
      console.log(`[Smash] Manual event started successfully for users: ${user1.username} and ${user2.username}`);
    } else {
      // No users provided - use random selection
      const result = await scheduler.startManualEvent(channelId, guildId, botId);
      
      if (!result.success) {
        await message.reply({
          content: result.message || BobKunPersonality.error,
        });
        return;
      }
      
      console.log(`[Smash] Random event started successfully`);
    }

    // Get the created event
    const repository = new SmashRepository();
    const event = repository.getActiveEventInChannel(channelId);
    
    if (!event) {
      console.error(`[Smash] Failed to retrieve active event in channel ${channelId}`);
      await message.reply({
        content: BobKunPersonality.error,
      });
      return;
    }
    
    console.log(`[Smash] Retrieved event: ${event.eventId} for players: ${event.player1DisplayName} vs ${event.player2DisplayName}`);

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

    const replyMessage = await message.reply({
      content: BobKunPersonality.demandDecision,
      embeds: [embed],
      components: [actionRow],
    });

    // Start the 20-second voting timer
    setTimeout(async () => {
      await endVotingPeriod(replyMessage, event.eventId);
    }, 20 * 1000);

  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'smash');
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

async function endVotingPeriod(message: Message, eventId: string): Promise<void> {
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
    await message.edit({
      embeds: [tieEmbed],
      components: [],
    });
  } else {
    const resultEmbed = SmashUI.createResultEmbed(winnerName, winnerAvatar, player1, player2);
    await message.edit({
      embeds: [resultEmbed],
      components: [],
    });
  }
}
