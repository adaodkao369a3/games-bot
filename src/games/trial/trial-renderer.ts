import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { TrialState, TrialPhase } from './trial-types.js';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { cwd } from 'process';
import { join } from 'path';
import { existsSync } from 'fs';

const PROJECT_ROOT = cwd();

// Font loading
const fontPath = join(PROJECT_ROOT, 'assets', 'fonts', 'Roboto-Bold.ttf');
let fontLoaded = false;

try {
  if (existsSync(fontPath)) {
    const success = GlobalFonts.registerFromPath(fontPath, 'Roboto');
    if (success) {
      fontLoaded = true;
      console.log('[TrialRenderer] Font loaded: assets/fonts/Roboto-Bold.ttf');
    }
  }
} catch (error) {
  console.error('[TrialRenderer] Failed to load font:', error);
}

export class TrialRenderer {
  private static readonly IMAGE_WIDTH = 1800;
  private static readonly IMAGE_HEIGHT = 900;
  private static readonly AVATAR_WIDTH = 900;
  private static readonly AVATAR_HEIGHT = 900;

  /**
   * Create court opening embed with GIF
   */
  static createCourtOpeningEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('🍌 Bob Kun: COURTS IN SESSION')
      .setColor(0xFFD700)
      .setImage('https://c.tenor.com/bOBzEJLVxhIAAAAd/tenor.gif');
  }

  /**
   * Create defense stage embed
   */
  static createDefenseEmbed(
    accusedMention: string,
    accuserMention: string,
    accusation: string,
    remainingSeconds: number
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('⚖️ DEFENSE STAGE')
      .setDescription(
        `${accusedMention} has been accused of **"${accusation}"** by ${accuserMention}.\n\n` +
        `${accusedMention}, what do you have to say about this?\n\n` +
        `You have **${remainingSeconds}** seconds.`
      )
      .setColor(0xFFA500)
      .setTimestamp();
  }

  /**
   * Create defense embed with GIF
   */
  static createDefenseGifEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('⚖️ DEFENSE STAGE')
      .setColor(0xFFA500)
      .setImage('https://c.tenor.com/dCK5UBjLY7YAAAAC/tenor.gif');
  }

  /**
   * Create jury voting embed
   */
  static createJuryEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('👥 JURY VOTING')
      .setDescription('**What does the jury have to say about what the accused said in their defense?**\n\nVoting begins now.')
      .setColor(0x00BFFF)
      .setTimestamp();
  }

  /**
   * Create voting buttons
   */
  static createVotingButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('trial_vote_guilty')
        .setLabel('🔴 GUILTY')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('trial_vote_innocent')
        .setLabel('🔵 INNOCENT')
        .setStyle(ButtonStyle.Primary)
    );

    return row;
  }

  /**
   * Create disabled voting buttons
   */
  static createDisabledVotingButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('trial_disabled_guilty')
        .setLabel('Voting Ended')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('trial_disabled_innocent')
        .setLabel('Voting Ended')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    return row;
  }

  /**
   * Generate voting card image
   */
  static async generateVotingCard(
    avatarBuffer: Buffer,
    guiltyVotes: number,
    innocentVotes: number
  ): Promise<Buffer> {
    if (!fontLoaded) {
      throw new Error('[TrialRenderer] Font not loaded');
    }

    const canvas = createCanvas(this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Load avatar
    const avatar = await loadImage(avatarBuffer);

    // Draw avatar on both sides
    this.drawCoverImage(ctx, avatar, 0, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT);
    this.drawCoverImage(ctx, avatar, this.AVATAR_WIDTH, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT);

    // Draw labels
    this.drawLabel(ctx, 'GUILTY', this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT / 2, '#FF0000');
    this.drawLabel(ctx, 'INNOCENT', this.AVATAR_WIDTH + this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT / 2, '#0000FF');

    // Draw vote counts
    this.drawVoteCount(ctx, guiltyVotes, 60, 100, 'left', '#FF0000');
    this.drawVoteCount(ctx, innocentVotes, this.IMAGE_WIDTH - 60, 100, 'right', '#0000FF');

    return canvas.toBuffer('image/png');
  }

  /**
   * Generate result card image with blur effect
   */
  static async generateResultCard(
    avatarBuffer: Buffer,
    guiltyVotes: number,
    innocentVotes: number,
    winner: 'guilty' | 'innocent'
  ): Promise<Buffer> {
    if (!fontLoaded) {
      throw new Error('[TrialRenderer] Font not loaded');
    }

    const canvas = createCanvas(this.IMAGE_WIDTH, this.IMAGE_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Load avatar
    const avatar = await loadImage(avatarBuffer);

    // Draw with blur treatment
    // Guilty wins = innocent side blurred, Innocent wins = guilty side blurred
    const guiltySideVisible = winner === 'guilty';
    const innocentSideVisible = winner === 'innocent';

    if (guiltySideVisible) {
      this.drawCoverImage(ctx, avatar, 0, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT);
    } else {
      ctx.save();
      ctx.filter = 'blur(10px) grayscale(100%) brightness(50%)';
      this.drawCoverImage(ctx, avatar, 0, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT);
      ctx.restore();
    }

    if (innocentSideVisible) {
      this.drawCoverImage(ctx, avatar, this.AVATAR_WIDTH, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT);
    } else {
      ctx.save();
      ctx.filter = 'blur(10px) grayscale(100%) brightness(50%)';
      this.drawCoverImage(ctx, avatar, this.AVATAR_WIDTH, 0, this.AVATAR_WIDTH, this.AVATAR_HEIGHT);
      ctx.restore();
    }

    // Draw labels
    if (guiltySideVisible) {
      this.drawLabel(ctx, 'GUILTY', this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT / 2, '#FF0000');
    } else {
      this.drawBlurredLabel(ctx, 'GUILTY', this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT / 2);
    }

    if (innocentSideVisible) {
      this.drawLabel(ctx, 'INNOCENT', this.AVATAR_WIDTH + this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT / 2, '#0000FF');
    } else {
      this.drawBlurredLabel(ctx, 'INNOCENT', this.AVATAR_WIDTH + this.AVATAR_WIDTH / 2, this.IMAGE_HEIGHT / 2);
    }

    // Draw vote counts
    this.drawVoteCount(ctx, guiltyVotes, 60, 100, 'left', '#FF0000');
    this.drawVoteCount(ctx, innocentVotes, this.IMAGE_WIDTH - 60, 100, 'right', '#0000FF');

    return canvas.toBuffer('image/png');
  }

  /**
   * Create guilty result embed (without GIF - for use with voting card)
   */
  static createGuiltyResultEmbed(
    accusedMention: string,
    accusation: string,
    sentence?: string
  ): EmbedBuilder {
    const sentenceText = sentence ? `"${sentence}"` : "pending sentencing";
    const description = `**${accusedMention} has been found guilty of "${accusation}" and is sentenced to ${sentenceText}**`;

    return new EmbedBuilder()
      .setTitle('⚖️ GUILTY VERDICT')
      .setDescription(description)
      .setColor(0xFF0000)
      .setTimestamp();
  }

  /**
   * Create guilty result embed with GIF (for final display)
   */
  static createGuiltyResultEmbedWithGif(
    accusedMention: string,
    accusation: string,
    sentence?: string
  ): EmbedBuilder {
    const sentenceText = sentence ? `"${sentence}"` : "pending sentencing";
    const description = `**${accusedMention} has been found guilty of "${accusation}" and is sentenced to ${sentenceText}**`;

    return new EmbedBuilder()
      .setTitle('⚖️ GUILTY VERDICT')
      .setDescription(description)
      .setColor(0xFF0000)
      .setImage('https://c.tenor.com/SCJRAgBurdcAAAAd/tenor.gif')
      .setTimestamp();
  }

  /**
   * Create sentence button
   */
  static createSentenceButton(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('trial_sentence')
        .setLabel('SENTENCE')
        .setStyle(ButtonStyle.Primary)
    );
    return row;
  }

  /**
   * Create jump button
   */
  static createJumpButton(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('trial_jump')
        .setLabel("JUMP 'EM?")
        .setStyle(ButtonStyle.Danger)
    );
    return row;
  }

  /**
   * Create jump result embed
   */
  static createJumpEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('💀 ouu shii')
      .setColor(0xFF0000)
      .setImage('https://c.tenor.com/9pdPttdj5CUAAAAC/tenor.gif');
  }

  /**
   * Create technical difficulties embed
   */
  static createTechnicalDifficultiesEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('📺 Please stand by, we are experiencing technical difficulties.')
      .setColor(0x808080)
      .setImage('https://c.tenor.com/hK408lWFkjgAAAAC/tenor.gif');
  }

  /**
   * Create innocent result embed (without GIF - for use with voting card)
   */
  static createInnocentResultEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('⚖️ INNOCENT VERDICT')
      .setDescription('The jury has found the accused NOT GUILTY!')
      .setColor(0x00FF00)
      .setTimestamp();
  }

  /**
   * Create innocent result embed with GIF (for final display)
   */
  static createInnocentResultEmbedWithGif(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('⚖️ INNOCENT VERDICT')
      .setDescription('The jury has found the accused NOT GUILTY!')
      .setColor(0x00FF00)
      .setImage('https://c.tenor.com/OhVr0qy0GzAAAAAd/tenor.gif')
      .setTimestamp();
  }

  /**
   * Create mute accuser button
   */
  static createMuteButton(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('trial_mute')
        .setLabel('MUTE ACCUSER')
        .setStyle(ButtonStyle.Danger)
    );
    return row;
  }

  /**
   * Create no judgement embed
   */
  static createNoJudgementEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('⚖️ NO JUDGEMENT')
      .setDescription('**No judgement could be made today.**')
      .setColor(0x808080)
      .setTimestamp();
  }

  /**
   * Helper: Draw image with cover cropping
   */
  private static drawCoverImage(
    ctx: any,
    image: any,
    destX: number,
    destY: number,
    destWidth: number,
    destHeight: number
  ): void {
    const imgRatio = image.width / image.height;
    const destRatio = destWidth / destHeight;

    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.width;
    let sourceHeight = image.height;

    if (imgRatio > destRatio) {
      sourceWidth = image.height * destRatio;
      sourceX = (image.width - sourceWidth) / 2;
    } else {
      sourceHeight = image.width / destRatio;
      sourceY = (image.height - sourceHeight) / 2;
    }

    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);
  }

  /**
   * Helper: Draw label
   */
  private static drawLabel(ctx: any, text: string, x: number, y: number, color: string): void {
    ctx.save();
    ctx.font = 'bold 80px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /**
   * Helper: Draw blurred label
   */
  private static drawBlurredLabel(ctx: any, text: string, x: number, y: number): void {
    ctx.save();
    ctx.font = 'bold 80px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.filter = 'blur(5px)';
    
    ctx.fillStyle = 'rgba(128, 128, 128, 0.5)';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /**
   * Helper: Draw vote count
   */
  private static drawVoteCount(
    ctx: any,
    votes: number,
    x: number,
    y: number,
    align: 'left' | 'right',
    color: string
  ): void {
    const fontSize = 140;
    const text = votes.toString();
    const voteLabel = votes === 1 ? 'vote' : 'votes';

    ctx.font = `bold ${fontSize}px Roboto`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = color;
    ctx.fillText(text, x, y);

    // Label
    const labelFontSize = 40;
    ctx.font = `bold ${labelFontSize}px Roboto`;
    const labelY = y + fontSize / 2 + labelFontSize / 2 + 10;
    ctx.fillStyle = 'white';
    ctx.fillText(voteLabel, x, labelY);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  /**
   * Download avatar from URL
   */
  static async downloadAvatar(url: string): Promise<Buffer> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}