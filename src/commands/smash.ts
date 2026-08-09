import { Message, MessageComponentInteraction } from 'discord.js';
import { SmashRepository } from '../database/repositories/smash-repository.js';
import { SmashUI, SmashUIData } from '../ui/smash-ui.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Simple in-memory vote tracking
const activeVotes = new Map<string, { player1Votes: number; player2Votes: number; voters: Set<string> }>();

export async function handleSmashCommand(message: Message, args: string[]): Promise<void> {
  try {
    // Parse user mentions from args
    const mentionedUsers = message.mentions.users.filter(user => !user.bot);
    const mentionedUserIds = Array.from(mentionedUsers.keys());

    // Validate user parameters - must be exactly two users
    if (mentionedUserIds.length !== 2) {
      await message.reply({
        content: 'okkk buddy',
      });
      return;
    }

    if (!message.guild) {
      await message.reply({
        content: 'okkk buddy',
      });
      return;
    }

    const user1 = mentionedUsers.first();
    const user2 = mentionedUsers.last();

    if (!user1 || !user2) {
      await message.reply({
        content: 'okkk buddy',
      });
      return;
    }

    if (user1.id === user2.id) {
      await message.reply({
        content: 'okkk buddy',
      });
      return;
    }

    // Generate a unique event ID
    const eventId = `smash_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Initialize vote tracking
    activeVotes.set(eventId, {
      player1Votes: 0,
      player2Votes: 0,
      voters: new Set(),
    });

    // Create UI data
    const uiData: SmashUIData = {
      player1Name: user1.displayName || user1.username,
      player1Avatar: user1.displayAvatarURL(),
      player2Name: user2.displayName || user2.username,
      player2Avatar: user2.displayAvatarURL(),
      matchupId: eventId,
      round: 1,
      totalRounds: 1,
    };

    const embed = SmashUI.createMatchupEmbed(uiData);
    const actionRow = SmashUI.createActionRow(eventId);

    const replyMessage = await message.reply({
      embeds: [embed],
      components: [actionRow],
    });

    // Start the 15-second voting timer
    setTimeout(async () => {
      await endVotingPeriod(message.channel, eventId, user1, user2);
    }, 15 * 1000);

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
    const voteData = activeVotes.get(eventId);

    if (!voteData) {
      await interaction.editReply({
        content: 'Event not found',
      });
      return;
    }

    const voterId = interaction.user.id;

    // Check if user already voted
    if (voteData.voters.has(voterId)) {
      await interaction.editReply({
        content: 'You already voted!',
      });
      return;
    }

    // Record the vote
    voteData.voters.add(voterId);
    if (player === 'player1') {
      voteData.player1Votes++;
    } else {
      voteData.player2Votes++;
    }

    await interaction.editReply({
      content: 'Vote recorded!',
    });

  } catch (error) {
    await ErrorHandler.handleInteractionError(interaction, error, 'smash-vote');
  }
}

async function endVotingPeriod(channel: any, eventId: string, user1: any, user2: any): Promise<void> {
  const voteData = activeVotes.get(eventId);
  
  if (!voteData) return;

  // Clean up vote tracking
  activeVotes.delete(eventId);

  // Determine winner
  let winnerUser: any;

  if (voteData.player1Votes > voteData.player2Votes) {
    winnerUser = user1;
  } else if (voteData.player2Votes > voteData.player1Votes) {
    winnerUser = user2;
  } else {
    // Tie - in case of tie, pick randomly
    winnerUser = Math.random() > 0.5 ? user1 : user2;
  }

  const winnerName = winnerUser.displayName || winnerUser.username;
  const winnerAvatar = winnerUser.displayAvatarURL();

  // Post result message: winner's avatar + username, "wins"
  await channel.send({
    content: `${winnerAvatar} ${winnerName} wins`,
  });
}
