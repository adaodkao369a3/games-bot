import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageComponentInteraction
} from 'discord.js';
import { BobKunPersonality } from '../services/bob-kun-personality.js';

export interface SmashUIData {
  player1Name: string;
  player1Avatar: string;
  player2Name: string;
  player2Avatar: string;
  matchupId: string;
  round: number;
  totalRounds: number;
  player1Votes?: number;
  player2Votes?: number;
}

export class SmashUI {
  static createMatchupEmbed(data: SmashUIData): EmbedBuilder {
    const player1Votes = data.player1Votes || 0;
    const player2Votes = data.player2Votes || 0;
    const totalVotes = player1Votes + player2Votes;
    
    const player1Percent = totalVotes > 0 ? Math.round((player1Votes / totalVotes) * 100) : 0;
    const player2Percent = totalVotes > 0 ? Math.round((player2Votes / totalVotes) * 100) : 0;
    
    // Create progress bars
    const player1Bar = this.createProgressBar(player1Percent, '🔵');
    const player2Bar = this.createProgressBar(player2Percent, '🔴');

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTimestamp()
      .setFooter({ text: '15 seconds to vote' })
      .setThumbnail(data.player1Avatar)
      .setImage(data.player2Avatar);

    // Create the description with vote counts and percentages
    embed.setDescription(
      `**${data.player1Name}** ⚔️ **${data.player2Name}**\n\n` +
      `${BobKunPersonality.emojis.trophy} **Vote Counts:**\n` +
      `${data.player1Name}: ${player1Votes} votes (${player1Percent}%)\n` +
      `${data.player2Name}: ${player2Votes} votes (${player2Percent}%)\n\n` +
      `${player1Bar}\n` +
      `${player2Bar}`
    );

    return embed;
  }

  private static createProgressBar(percentage: number, emoji: string): string {
    const filledBlocks = Math.round(percentage / 10);
    const emptyBlocks = 10 - filledBlocks;
    const bar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
    return `${emoji} ${bar} ${percentage}%`;
  }

  static createActionRow(eventId: string, player1Name: string, player2Name: string): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${eventId}_player1`)
        .setLabel(`Vote for ${player1Name}`)
        .setStyle(ButtonStyle.Primary), // Blue
      
      new ButtonBuilder()
        .setCustomId(`${eventId}_player2`)
        .setLabel(`Vote for ${player2Name}`)
        .setStyle(ButtonStyle.Danger) // Red
    );

    return row;
  }

  static createVotingDisabledRow(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('smash_disabled_player1')
        .setLabel('Voting Ended')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      
      new ButtonBuilder()
        .setCustomId('smash_disabled_player2')
        .setLabel('Voting Ended')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true)
    );

    return row;
  }

  static createResultEmbed(
    winnerName: string,
    winnerAvatar: string,
    player1Votes: number,
    player2Votes: number
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`${BobKunPersonality.emojis.banana} BOB KUN HAS SPOKEN`)
      .setDescription(
        `${BobKunPersonality.emojis.boom} **${winnerName} WINS!**\n\n` +
        `Final Score:\n` +
        `${winnerName} — ${Math.max(player1Votes, player2Votes)} votes\n` +
        `Opponent — ${Math.min(player1Votes, player2Votes)} votes`
      )
      .setThumbnail(winnerAvatar)
      .setColor(0xFFD700)
      .setTimestamp()
      .setFooter({ text: 'Bob Kun 🍌' });

    return embed;
  }

  static createCalculatingEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setDescription(BobKunPersonality.calculating)
      .setColor(0xFFA500)
      .setTimestamp();
  }

  static async disableButtons(interaction: MessageComponentInteraction): Promise<void> {
    const disabledRow = this.createVotingDisabledRow();
    await interaction.update({
      components: [disabledRow],
    });
  }

  static async showCalculating(interaction: MessageComponentInteraction): Promise<void> {
    const calculatingEmbed = this.createCalculatingEmbed();
    const disabledRow = this.createVotingDisabledRow();
    
    await interaction.update({
      embeds: [calculatingEmbed],
      components: [disabledRow],
    });
  }

  static async showResult(
    interaction: MessageComponentInteraction,
    winnerName: string,
    winnerAvatar: string,
    player1Votes: number,
    player2Votes: number,
    isFinal: boolean = false
  ): Promise<void> {
    const resultEmbed = this.createResultEmbed(winnerName, winnerAvatar, player1Votes, player2Votes);
    
    await interaction.editReply({
      embeds: [resultEmbed],
      components: [],
    });
  }

  static async showTie(
    interaction: MessageComponentInteraction,
    player1Votes: number,
    player2Votes: number
  ): Promise<void> {
    const tieEmbed = this.createTieEmbed(player1Votes, player2Votes);
    
    await interaction.editReply({
      embeds: [tieEmbed],
      components: [],
    });
  }

  static createTieEmbed(player1Votes: number, player2Votes: number): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`${BobKunPersonality.emojis.confused} BOB KUN IS CONFUSED`)
      .setDescription(
        `${BobKunPersonality.emojis.confused} It's a tie!\n\n` +
        `${player1Votes} — ${player2Votes}`
      )
      .setColor(0xFFA500)
      .setTimestamp()
      .setFooter({ text: 'Bob Kun 🍌' });

    return embed;
  }
}
