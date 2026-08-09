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
}

export class SmashUI {
  static createMatchupEmbed(data: SmashUIData): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTimestamp()
      .setFooter({ text: '15 seconds to vote' });

    // Simple layout: avatar1 | avatar2, username1 | username2
    embed.setDescription(
      `${data.player1Avatar} | ${data.player2Avatar}\n${data.player1Name} | ${data.player2Name}`
    );

    return embed;
  }

  static createActionRow(eventId: string): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`smash_vote_${eventId}_player1`)
        .setLabel('Vote')
        .setStyle(ButtonStyle.Primary),
      
      new ButtonBuilder()
        .setCustomId(`smash_vote_${eventId}_player2`)
        .setLabel('Vote')
        .setStyle(ButtonStyle.Primary)
    );

    return row;
  }

  static createVotingDisabledRow(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('smash_disabled_player1')
        .setLabel(`${BobKunPersonality.emojis.boom} SMASH`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
      
      new ButtonBuilder()
        .setCustomId('smash_disabled_player2')
        .setLabel(`${BobKunPersonality.emojis.boom} SMASH`)
        .setStyle(ButtonStyle.Danger)
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
        `${winnerName} — ${player1Votes} votes\n` +
        `${player1Votes > player2Votes ? 'Opponent' : 'Opponent'} — ${player2Votes} votes`
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
