import { Message, MessageComponentInteraction } from 'discord.js';
import { PissCompGame, PissCompPlayer } from '../pisscomp/PissCompGame.js';
import { PissCompMaxGame } from '../pisscomp/PissCompMaxGame.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Active games keyed by channel ID
const activeGames = new Map<string, PissCompGame>();
const activeMaxGames = new Map<string, PissCompMaxGame>();

/** True while a Piss Comp or Piss Comp Max game owns this channel. */
function channelBusy(channelId: string): boolean {
  return activeGames.has(channelId) || activeMaxGames.has(channelId);
}

interface ChallengeSetup {
  guildId: string;
  player1: PissCompPlayer;
  player2: PissCompPlayer;
}

/**
 * Validate a ".pisscomp @user" style command. Replies with the problem and returns null if invalid.
 */
async function parseChallenge(message: Message, label: string, usage: string): Promise<ChallengeSetup | null> {
  if (channelBusy(message.channel.id)) {
    await message.reply({ content: 'A Piss Competition is already in progress in this channel!' });
    return null;
  }

  if (!message.guild) {
    await message.reply({ content: `${label} can only be played in a server.` });
    return null;
  }

  const mentionedUser = message.mentions.users.first();
  if (!mentionedUser) {
    await message.reply({ content: `You need to mention another user to challenge! Usage: \`${usage}\`` });
    return null;
  }

  if (mentionedUser.id === message.author.id) {
    await message.reply({ content: 'You cannot challenge yourself!' });
    return null;
  }

  if (mentionedUser.bot) {
    await message.reply({ content: 'You cannot challenge a bot!' });
    return null;
  }

  return {
    guildId: message.guild.id,
    player1: {
      id: message.author.id,
      name: message.author.displayName || message.author.username,
      avatar: message.author.displayAvatarURL({ size: 256 }) || message.author.defaultAvatarURL,
    },
    player2: {
      id: mentionedUser.id,
      name: mentionedUser.displayName || mentionedUser.username,
      avatar: mentionedUser.displayAvatarURL({ size: 256 }) || mentionedUser.defaultAvatarURL,
    },
  };
}

/**
 * Handle the Piss Comp command to start a competition
 */
export async function handlePissCompCommand(message: Message, args: string[]): Promise<void> {
  const channelId = message.channel.id;

  try {
    const setup = await parseChallenge(message, 'Piss Comp', '.pisscomp @user');
    if (!setup) return;

    const game = new PissCompGame(
      channelId,
      setup.guildId,
      setup.player1,
      setup.player2,
      () => {
        // Game finished (win or idle timeout): free the channel
        activeGames.delete(channelId);
      }
    );

    activeGames.set(channelId, game);

    const initialMessage = await message.reply({ content: '💦 Setting up the competition...' });
    await game.start(initialMessage);
  } catch (error) {
    console.error('[Piss Comp Command] Error:', error);
    activeGames.delete(channelId);
    await ErrorHandler.handleMessageError(message, error, 'Piss Comp command');
  }
}

/**
 * Handle the Piss Comp Max command: a normal Piss Comp first, then the JJK fight sequence.
 */
export async function handlePissCompMaxCommand(message: Message, args: string[]): Promise<void> {
  const channelId = message.channel.id;

  try {
    const setup = await parseChallenge(message, 'Piss Comp Max', '.pisscompmax @user');
    if (!setup) return;

    // The fight sequence is created up front so the channel stays "busy" the whole time,
    // including the moment between the normal game ending and the fight starting.
    const maxGame = new PissCompMaxGame(
      channelId,
      setup.guildId,
      setup.player1,
      setup.player2,
      () => {
        activeMaxGames.delete(channelId);
      }
    );

    let initialMessage: Message | undefined;

    // First, run the normal Piss Comp game (part of PissCompMax, so no coins awarded)
    const normalGame = new PissCompGame(
      channelId,
      setup.guildId,
      setup.player1,
      setup.player2,
      (winnerId) => {
        activeGames.delete(channelId);

        if (!winnerId || !initialMessage) {
          // Normal game ended without a winner (idle timeout): nothing to continue with
          activeMaxGames.delete(channelId);
          return;
        }

        activeMaxGames.set(channelId, maxGame);

        // Let people see who won the first round for a moment, then start the fight
        setTimeout(() => {
          maxGame.start(initialMessage!, winnerId).catch((error) => {
            console.error('[Piss Comp Max] Error starting JJK fight:', error);
            maxGame.cleanup();
            activeMaxGames.delete(channelId);
          });
        }, 2500);
      },
      true // isPartOfMax = true, so no coins will be awarded
    );

    activeGames.set(channelId, normalGame);

    initialMessage = await message.reply({ content: '💦 Setting up the competition...' });
    await normalGame.start(initialMessage);
  } catch (error) {
    console.error('[Piss Comp Max Command] Error:', error);
    activeGames.delete(channelId);
    activeMaxGames.delete(channelId);
    await ErrorHandler.handleMessageError(message, error, 'Piss Comp Max command');
  }
}

/**
 * Handle Piss Comp button interactions
 */
export async function handlePissCompInteraction(interaction: MessageComponentInteraction): Promise<void> {
  try {
    const channelId = interaction.channelId;
    const customId = interaction.customId;

    console.log(`[Piss Comp Interaction] customId: ${customId}, channelId: ${channelId}`);

    // Check if it's a Piss Comp Max interaction
    if (customId === 'pisscompmax_attack') {
      console.log('[Piss Comp Interaction] Handling Piss Comp Max interaction');
      const maxGame = activeMaxGames.get(channelId);

      if (!maxGame) {
        console.log('[Piss Comp Interaction] No active Piss Comp Max game');
        await interaction.reply({
          content: 'No active Piss Comp Max game in this channel.',
          ephemeral: true,
        });
        return;
      }

      await maxGame.handleInteraction(interaction);
      return;
    }

    // Normal Piss Comp interaction
    const game = activeGames.get(channelId);

    if (!game) {
      await interaction.reply({
        content: 'No active Piss Competition in this channel.',
        ephemeral: true,
      });
      return;
    }

    await game.handleInteraction(interaction);

  } catch (error) {
    console.error('[Piss Comp Interaction] Error:', error);
    await ErrorHandler.handleInteractionError(interaction, error, 'Piss Comp interaction');
  }
}