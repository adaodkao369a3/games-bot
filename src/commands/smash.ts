import { Message, MessageComponentInteraction, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { SmashRepository } from '../database/repositories/smash-repository.js';
import { SmashUI, SmashUIData } from '../ui/smash-ui.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { SmashImageGenerator, SmashImageData } from '../utils/smash-image-generator.js';

// Simple in-memory vote tracking
interface VoteData {
  player1Votes: number;
  player2Votes: number;
  voters: Set<string>;
  messageId?: string;
  channelId?: string;
  user1?: { id: string; displayName?: string; username: string };
  user2?: { id: string; displayName?: string; username: string };
  player1AvatarBuffer?: Buffer;
  player2AvatarBuffer?: Buffer;
}

const activeVotes = new Map<string, VoteData>();

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
    const eventId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    console.log('[Smash Command] Generated eventId:', eventId);

    // Initialize vote tracking
    activeVotes.set(eventId, {
      player1Votes: 0,
      player2Votes: 0,
      voters: new Set(),
    });

    console.log('[Smash Command] Stored event in activeVotes, total events:', activeVotes.size);

    // Download avatars for image generation
    const player1AvatarBuffer = await SmashImageGenerator.downloadAvatar(user1.displayAvatarURL({ size: 256 }));
    const player2AvatarBuffer = await SmashImageGenerator.downloadAvatar(user2.displayAvatarURL({ size: 256 }));

    // Generate initial voting image
    const imageData: SmashImageData = {
      player1Name: user1.displayName || user1.username,
      player1Avatar: player1AvatarBuffer,
      player2Name: user2.displayName || user2.username,
      player2Avatar: player2AvatarBuffer,
      player1Votes: 0,
      player2Votes: 0,
    };

    const votingImage = await SmashImageGenerator.generateVotingImage(imageData);
    const attachment = new AttachmentBuilder(votingImage, { name: 'smash-voting.png' });

    const actionRow = SmashUI.createActionRow(eventId, user1.displayName || user1.username, user2.displayName || user2.username);

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setImage('attachment://smash-voting.png')
      .setFooter({ text: '15 seconds to vote' });

    const replyMessage = await message.reply({
      files: [attachment],
      embeds: [embed],
      components: [actionRow],
    });

    // Store the message ID for updates
    activeVotes.set(eventId, {
      player1Votes: 0,
      player2Votes: 0,
      voters: new Set(),
      messageId: replyMessage.id,
      channelId: message.channel.id,
      user1,
      user2,
      player1AvatarBuffer,
      player2AvatarBuffer,
    });

    // Start the 15-second voting timer
    setTimeout(async () => {
      await endVotingPeriod(message.channel, eventId);
    }, 15 * 1000);

  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'smash');
  }
}

export async function handleSmashVote(interaction: MessageComponentInteraction): Promise<void> {
  const customId = interaction.customId;
  
  console.log('[Vote Handler] Received vote interaction with customId:', customId);
  
  const parts = customId.split('|');
  const eventId = parts[0]; // First part is the eventId
  const player = parts[1]; // 'player1' or 'player2'

  console.log('[Vote Handler] Parsed eventId:', eventId, 'player:', player);
  console.log('[Vote Handler] Active event IDs:', Array.from(activeVotes.keys()));

  await interaction.deferReply({ ephemeral: true });

  try {
    const voteData = activeVotes.get(eventId);

    console.log('[Vote Handler] Vote data for eventId:', eventId, ':', voteData ? 'Found' : 'Not found');

    if (!voteData) {
      console.log('[Vote Handler] Event not found, available events:', Array.from(activeVotes.keys()));
      await interaction.editReply({
        content: 'Event not found',
      });
      return;
    }

    const voterId = interaction.user.id;
    console.log('[Vote Handler] Voter ID:', voterId, 'already voted:', voteData.voters.has(voterId));

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
      console.log('[Vote Handler] Recorded vote for player1, new count:', voteData.player1Votes);
    } else {
      voteData.player2Votes++;
      console.log('[Vote Handler] Recorded vote for player2, new count:', voteData.player2Votes);
    }

    // Update the image with new vote counts
    if (voteData.messageId && voteData.channelId && voteData.user1 && voteData.user2 && voteData.player1AvatarBuffer && voteData.player2AvatarBuffer) {
      try {
        const channel = await interaction.client.channels.fetch(voteData.channelId);
        if (channel && 'messages' in channel) {
          const message = await channel.messages.fetch(voteData.messageId);
          
          console.log('[Vote Handler] Regenerating image with votes:', voteData.player1Votes, '-', voteData.player2Votes);
          
          const imageData: SmashImageData = {
            player1Name: voteData.user1.displayName || voteData.user1.username,
            player1Avatar: voteData.player1AvatarBuffer,
            player2Name: voteData.user2.displayName || voteData.user2.username,
            player2Avatar: voteData.player2AvatarBuffer,
            player1Votes: voteData.player1Votes,
            player2Votes: voteData.player2Votes,
          };

          const updatedImage = await SmashImageGenerator.generateVotingImage(imageData);
          const attachment = new AttachmentBuilder(updatedImage, { name: 'smash-voting.png' });

          const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setImage('attachment://smash-voting.png')
            .setFooter({ text: '15 seconds to vote' });

          await message.edit({
            files: [attachment],
            embeds: [embed],
          });
          console.log('[Vote Handler] Image updated successfully');
        }
      } catch (error) {
        console.error('[Vote Handler] Failed to update image:', error);
      }
    }

    await interaction.editReply({
      content: 'Vote recorded!',
    });

  } catch (error) {
    console.error('[Vote Handler] Error in vote handler:', error);
    await ErrorHandler.handleInteractionError(interaction, error, 'smash-vote');
  }
}

async function endVotingPeriod(channel: any, eventId: string): Promise<void> {
  const voteData = activeVotes.get(eventId);
  
  if (!voteData) return;

  // Disable the buttons on the original message
  if (voteData.messageId && voteData.channelId) {
    try {
      const msgChannel = await channel.client.channels.fetch(voteData.channelId);
      if (msgChannel && 'messages' in msgChannel) {
        const message = await msgChannel.messages.fetch(voteData.messageId);
        const disabledRow = SmashUI.createVotingDisabledRow();
        await message.edit({ components: [disabledRow] });
        console.log('[End Voting] Buttons disabled successfully');
      }
    } catch (error) {
      console.error('[End Voting] Failed to disable buttons:', error);
    }
  }

  // Determine winner or tie
  let winner: 'player1' | 'player2' | 'tie' = 'tie';
  if (voteData.player1Votes > voteData.player2Votes) {
    winner = 'player1';
  } else if (voteData.player2Votes > voteData.player1Votes) {
    winner = 'player2';
  } else {
    winner = 'tie';
  }

  // Generate result image
  if (voteData.player1AvatarBuffer && voteData.player2AvatarBuffer && voteData.user1 && voteData.user2) {
    try {
      const imageData: SmashImageData = {
        player1Name: voteData.user1.displayName || voteData.user1.username,
        player1Avatar: voteData.player1AvatarBuffer,
        player2Name: voteData.user2.displayName || voteData.user2.username,
        player2Avatar: voteData.player2AvatarBuffer,
        player1Votes: voteData.player1Votes,
        player2Votes: voteData.player2Votes,
        isResult: true,
        winner,
      };

      console.log('[End Voting] Generating result image with winner:', winner);
      const resultImage = await SmashImageGenerator.generateResultImage(imageData);
      const attachment = new AttachmentBuilder(resultImage, { name: 'smash-result.png' });

      const embed = new EmbedBuilder()
        .setColor(winner === 'tie' ? 0xFFA500 : 0xFFD700)
        .setImage('attachment://smash-result.png')
        .setFooter({ text: 'Bob Kun 🍌' });

      // Generate result content text
      let resultContent: string;
      if (winner === 'tie') {
        resultContent = '🤝 Both are certified smashes!';
      } else {
        const winnerUser = winner === 'player1' ? voteData.user1 : voteData.user2;
        const winnerUserId = winnerUser.id; // Use actual Discord user ID for mention
        resultContent = `🏆 <@${winnerUserId}> is a total smash by public choice!`;
        console.log('[End Voting] Using Discord mention for user ID:', winnerUserId);
      }

      // Post as reply to the original voting message
      if (channel && 'messages' in channel) {
        const originalMessage = await channel.messages.fetch(voteData.messageId);
        await originalMessage.reply({
          files: [attachment],
          embeds: [embed],
          content: resultContent,
        });
        console.log('[End Voting] Result message posted successfully');
      }
    } catch (error) {
      console.error('[End Voting] Failed to generate result image:', error);
    }
  }

  // Clean up vote tracking
  activeVotes.delete(eventId);
}
