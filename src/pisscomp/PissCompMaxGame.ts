import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction, EmbedBuilder } from 'discord.js';
import { getGifDuration } from '../utils/gif-duration.js';
import { PissCompGame, PissCompPlayer } from './PissCompGame.js';

/**
 * JJK Fight Sequence GIF URLs
 */
const GIFS = {
  // Transition GIFs
  TRANSITION_1: 'https://64.media.tumblr.com/b2a2bc168fc2af179a99e6a9b8f264f079d6f36b90.gif',
  TRANSITION_1_FALLBACK: 'https://64.media.tumblr.com/b2a2bc168fc2af179a99a6/6e8227c4fa592036-46/s540x810/0d5b71a315bf974c68e1a9b8f264f079d6f36b90.gif',
  TRANSITION_2: 'https://media1.tenor.com/m/UHmop4IsTSAAAAAC/choso-stand-off-choso-aura.gif',

  // Stage 1: Naoya vs Choso
  STAGE_1_INTRO: 'https://media1.tenor.com/m/UHmop4IsTSAAAAAC/choso-stand-off-choso-aura.gif',
  
  // Naoya Stage 1 attacks
  NAOYA_S1_MOVE_1: 'https://i.makeagif.com/media/1-24-2026/vg74A7.gif',
  NAOYA_S1_MOVE_2: 'https://64.media.tumblr.com/1dc3d5d0178d3956169c3b4b92422085/802b826e6e09d301-50/s250x400/79b388e0d7c707d988bfcb339191289838973244.gif',
  NAOYA_S1_MOVE_3: 'https://64.media.tumblr.com/35c289431389a9c49a8e38da91561a15/802b826e6e09d301-57/s1280x1920/45ce88e6b2c1b9ebfac56f3c303473ddd6f01650.gif',
  NAOYA_S1_WIN: 'https://media.tenor.com/Wfc3sxS8ZmIAAAAM/naoya-zenin.gif',
  
  // Choso Stage 1 attacks
  CHOSO_S1_MOVE_1: 'https://i.pinimg.com/originals/8f/c4/cd/8fc4cd008f7a188eedd5c9a9219c3dab.gif',
  CHOSO_S1_MOVE_2: 'https://media.tenor.com/ze1DLgRmCl0AAAAM/jjk-jujutsu-kaisen.gif',
  CHOSO_S1_MOVE_3: 'https://media1.tenor.com/m/L5UvsfC0m5kAAAAd/choso-vs-naoya-jujutsu-kaisen.gif',
  CHOSO_S1_WIN: 'https://64.media.tumblr.com/8b6032fd92d2a9acda88ffe00856e88d/947c30ebb836286b-a9/s1280x1920/a6641d4064d361397d05e3b4229d11d1f8c7c8d5.gif',

  // Stage 2: Naoya vs Maki
  STAGE_2_INTRO: 'https://media1.tenor.com/m/puaEEA-J_8oAAAAd/jujutsu-kaisen-jjk.gif',
  
  // Naoya Stage 2 attacks
  NAOYA_S2_MOVE_1: 'https://i.pinimg.com/originals/16/c5/ca/16c5ca25e6c451eec34254dee90f51ac.gif',
  NAOYA_S2_MOVE_2: 'https://64.media.tumblr.com/57f89765126595b213aeb43914d183e2/fa6f37fb084d8a9f-ce/s250x400/4306bb1f39587559ad18aed01990b78f1fe2002f.gif',
  NAOYA_S2_MOVE_3: 'https://i.namu.wiki/i/lZuHbWoqKyJFDY-WmbMNyZNkJhC6h8GCK2gLGYr1N0uUQ6iakbU_JAW6Pj1gomsV_exOsc9WlJ2u98GSYgmk9Q.gif',
  NAOYA_S2_WIN: 'https://media1.tenor.com/m/3hHnMhrLNYsAAAAd/naoya-folk.gif',
  
  // Maki Stage 2 attacks
  MAKI_S2_MOVE_1: 'https://64.media.tumblr.com/bd1b94d7c0a9ac7309e3cea20b232984/fa6f37fb084d8a9f-15/s250x400/4c995a42de48b13d65cc4eaad2efce96a0a7a199.gif',
  MAKI_S2_MOVE_2: 'https://media1.tenor.com/m/kANPHZ2EhjIAAAAd/maki-zenin-jujutsu-kaisen.gif',
  MAKI_S2_MOVE_3: 'https://i.makeagif.com/media/2-28-2026/z310pH.gif',
  MAKI_S2_WIN: 'https://64.media.tumblr.com/8100fb3867bc5f57b4b5bddc8555543d/f4136ceb038047b1-90/s250x400/80ee5c2e2af2d467f6dac22763df9bf94352e792.gif',

  // Final draw
  FINAL_DRAW: 'https://i.pinimg.com/originals/29/96/40/29964078bb55b335f62496c81ce637bc.gif',
};

/**
 * Game state for JJK Fight Sequence
 */
interface JJKFightState {
  channelId: string;
  guildId?: string;
  player1: PissCompPlayer; // Naoya
  player2: PissCompPlayer; // Choso/Maki
  isGameOver: boolean;
  winner?: string;
  currentStage: 1 | 2;
  currentRound: number;
  player1Score: number;
  player2Score: number;
  isButtonEnabled: boolean;
  roundStartTime: number;
  message?: Message;
  normalGameWinner?: string;
}

/**
 * Manages the JJK Fight Sequence (Piss Comp Max)
 */
export class PissCompMaxGame {
  private state: JJKFightState;
  private onGameEnd?: () => void;
  private roundTimeout?: NodeJS.Timeout;
  private disableDelayTimeout?: NodeJS.Timeout;

  // Game constants
  private static readonly ROUNDS_PER_STAGE = 4;
  private static readonly ROUNDS_TO_WIN = 3;
  private static readonly BUTTON_DISABLE_DELAY_MS = 3000;
  private static readonly ROUND_TIMEOUT_MS = 20000;

  constructor(
    channelId: string,
    guildId: string | undefined,
    player1: PissCompPlayer,
    player2: PissCompPlayer,
    onGameEnd?: () => void
  ) {
    this.state = {
      channelId,
      guildId,
      player1,
      player2,
      isGameOver: false,
      currentStage: 1,
      currentRound: 1,
      player1Score: 0,
      player2Score: 0,
      isButtonEnabled: false,
      roundStartTime: 0,
    };
    this.onGameEnd = onGameEnd;
  }

  /**
   * Start the JJK Fight Sequence after normal Piss Comp
   */
  async start(message: Message, normalGameWinner: string): Promise<void> {
    this.state.message = message;
    this.state.normalGameWinner = normalGameWinner;

    // Show transition sequence
    await this.showTransitionSequence();
  }

  /**
   * Show the transition sequence before the fight
   */
  private async showTransitionSequence(): Promise<void> {
    // First transition GIF
    await this.updateEmbed(
      'TRANSITION',
      GIFS.TRANSITION_1,
      'YOU THOUGHT THE BATTLE WAS OVER?'
    );

    // Wait for GIF duration
    const duration1 = await getGifDuration(GIFS.TRANSITION_1);
    await this.delay(duration1);

    // Second transition GIF
    await this.updateEmbed(
      'TRANSITION',
      GIFS.TRANSITION_2,
      'DOMAIN OF CHAOS: ENGAGE!\n\nNAOYA ZENIN VS CHOSO — THE CURSED SHOWDOWN BEGINS!'
    );

    // Wait for GIF duration
    const duration2 = await getGifDuration(GIFS.TRANSITION_2);
    await this.delay(duration2);

    // Start Stage 1
    await this.startStage(1);
  }

  /**
   * Start a stage
   */
  private async startStage(stage: 1 | 2): Promise<void> {
    this.state.currentStage = stage;
    this.state.currentRound = 1;
    this.state.player1Score = 0;
    this.state.player2Score = 0;

    const stageName = stage === 1 ? 'STAGE 1 — NAOYA VS CHOSO' : 'STAGE 2 — NAOYA VS MAKI';
    const introGif = stage === 1 ? GIFS.STAGE_1_INTRO : GIFS.STAGE_2_INTRO;
    const description = stage === 1 
      ? 'NAOYA ZENIN VS CHOSO — THE CURSED SHOWDOWN BEGINS!'
      : 'STAGE 2 — NAOYA VS MAKI\n\nNaoya\'s cursed form is emerging. The battle becomes more dangerous...';

    await this.updateEmbed(stageName, introGif, description);

    // Wait for intro GIF duration
    const duration = await getGifDuration(introGif);
    await this.delay(duration);

    // Start first round
    await this.startRound();
  }

  /**
   * Start a round
   */
  private async startRound(): Promise<void> {
    this.state.isButtonEnabled = false;
    this.state.roundStartTime = Date.now();

    const stage = this.state.currentStage;
    const opponentName = stage === 1 ? 'Choso' : 'Maki';
    const description = `Round ${this.state.currentRound}/4\n\nNaoya Zenin: ${this.state.player1Score}\n${opponentName}: ${this.state.player2Score}\n\nGet ready to dodge!`;

    // Show waiting GIF with disabled button
    await this.updateEmbed(
      stage === 1 ? 'STAGE 1 — NAOYA VS CHOSO' : 'STAGE 2 — NAOYA VS MAKI',
      stage === 1 ? GIFS.STAGE_1_INTRO : GIFS.STAGE_2_INTRO,
      description,
      false // Button disabled
    );

    // Enable button after 3 seconds
    this.disableDelayTimeout = setTimeout(async () => {
      if (this.state.isGameOver) return;

      this.state.isButtonEnabled = true;
      await this.updateEmbed(
        stage === 1 ? 'STAGE 1 — NAOYA VS CHOSO' : 'STAGE 2 — NAOYA VS MAKI',
        stage === 1 ? GIFS.STAGE_1_INTRO : GIFS.STAGE_2_INTRO,
        description + '\n\n🔴 DODGE THIS!',
        true // Button enabled
      );

      // Set round timeout (20 seconds total, so 17 seconds remaining after 3s delay)
      this.roundTimeout = setTimeout(() => {
        this.handleTimeout();
      }, PissCompMaxGame.ROUND_TIMEOUT_MS - PissCompMaxGame.BUTTON_DISABLE_DELAY_MS);
    }, PissCompMaxGame.BUTTON_DISABLE_DELAY_MS);
  }

  /**
   * Handle button interaction
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state.isGameOver) {
      await interaction.reply({
        content: 'This game has already ended.',
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;

    // Validate: only players can click
    if (userId !== this.state.player1.id && userId !== this.state.player2.id) {
      await interaction.reply({
        content: 'Only the participants can click this button!',
        ephemeral: true,
      });
      return;
    }

    // Validate: button must be enabled
    if (!this.state.isButtonEnabled) {
      await interaction.reply({
        content: 'Wait for the button to be enabled!',
        ephemeral: true,
      });
      return;
    }

    // Determine winner (first to click wins)
    const winnerId = userId;
    const isPlayer1 = winnerId === this.state.player1.id;

    // Clear timeouts
    this.clearTimeouts();

    // Update score
    if (isPlayer1) {
      this.state.player1Score++;
    } else {
      this.state.player2Score++;
    }

    // Show attack GIF
    await this.showAttack(isPlayer1);

    // Check for stage win
    const stage = this.state.currentStage;
    const opponentName = stage === 1 ? 'Choso' : 'Maki';

    if (this.state.player1Score >= PissCompMaxGame.ROUNDS_TO_WIN) {
      // Naoya wins the stage (and the game)
      await this.handleGameWin(this.state.player1.id, this.state.player2.id, 'Naoya Zenin');
    } else if (this.state.player2Score >= PissCompMaxGame.ROUNDS_TO_WIN) {
      // Opponent wins the stage (and the game)
      await this.handleGameWin(this.state.player2.id, this.state.player1.id, opponentName);
    } else if (this.state.currentRound >= PissCompMaxGame.ROUNDS_PER_STAGE) {
      // Stage ends 2-2
      if (stage === 1) {
        // Advance to Stage 2
        await this.delay(2000);
        await this.startStage(2);
      } else {
        // Stage 2 also ends 2-2 - final draw
        await this.handleFinalDraw();
      }
    } else {
      // Next round
      this.state.currentRound++;
      await this.delay(2000);
      await this.startRound();
    }
  }

  /**
   * Show attack GIF based on who won the round
   */
  private async showAttack(isPlayer1: boolean): Promise<void> {
    const stage = this.state.currentStage;
    const round = this.state.currentRound;

    let attackGif: string;
    let winnerName: string;

    if (isPlayer1) {
      // Naoya attacks
      if (stage === 1) {
        if (round === 1) attackGif = GIFS.NAOYA_S1_MOVE_1;
        else if (round === 2) attackGif = GIFS.NAOYA_S1_MOVE_2;
        else attackGif = GIFS.NAOYA_S1_MOVE_3;
      } else {
        if (round === 1) attackGif = GIFS.NAOYA_S2_MOVE_1;
        else if (round === 2) attackGif = GIFS.NAOYA_S2_MOVE_2;
        else attackGif = GIFS.NAOYA_S2_MOVE_3;
      }
      winnerName = 'Naoya Zenin';
    } else {
      // Opponent attacks
      if (stage === 1) {
        if (round === 1) attackGif = GIFS.CHOSO_S1_MOVE_1;
        else if (round === 2) attackGif = GIFS.CHOSO_S1_MOVE_2;
        else attackGif = GIFS.CHOSO_S1_MOVE_3;
      } else {
        if (round === 1) attackGif = GIFS.MAKI_S2_MOVE_1;
        else if (round === 2) attackGif = GIFS.MAKI_S2_MOVE_2;
        else attackGif = GIFS.MAKI_S2_MOVE_3;
      }
      winnerName = stage === 1 ? 'Choso' : 'Maki';
    }

    const stageName = stage === 1 ? 'STAGE 1 — NAOYA VS CHOSO' : 'STAGE 2 — NAOYA VS MAKI';
    const opponentName = stage === 1 ? 'Choso' : 'Maki';

    await this.updateEmbed(
      stageName,
      attackGif,
      `${winnerName} lands a hit!\n\nNaoya Zenin: ${this.state.player1Score}\n${opponentName}: ${this.state.player2Score}`,
      false // Button disabled during attack
    );

    // Wait for attack GIF duration
    const duration = await getGifDuration(attackGif);
    await this.delay(duration);
  }

  /**
   * Handle game win
   */
  private async handleGameWin(winnerId: string, loserId: string, winnerName: string): Promise<void> {
    this.state.winner = winnerId;
    this.state.isGameOver = true;

    this.clearTimeouts();

    // Show winning screen
    let winGif: string;
    const stage = this.state.currentStage;

    if (winnerId === this.state.player1.id) {
      // Naoya wins
      winGif = stage === 1 ? GIFS.NAOYA_S1_WIN : GIFS.NAOYA_S2_WIN;
    } else {
      // Opponent wins
      winGif = stage === 1 ? GIFS.CHOSO_S1_WIN : GIFS.MAKI_S2_WIN;
    }

    const stageName = stage === 1 ? 'STAGE 1 — NAOYA VS CHOSO' : 'STAGE 2 — NAOYA VS MAKI';

    await this.updateEmbed(
      stageName,
      winGif,
      `🏆 ${winnerName} WINS THE FIGHT!\n\n<@${winnerId}> is victorious!`,
      false // Button disabled
    );

    // Call cleanup callback
    if (this.onGameEnd) {
      this.onGameEnd();
    }
  }

  /**
   * Handle final draw
   */
  private async handleFinalDraw(): Promise<void> {
    this.state.isGameOver = true;

    this.clearTimeouts();

    await this.updateEmbed(
      'FINAL STANDOFF',
      GIFS.FINAL_DRAW,
      'well looks like its a draw... both need to be eliminated.',
      false // Button disabled
    );

    // Call cleanup callback
    if (this.onGameEnd) {
      this.onGameEnd();
    }
  }

  /**
   * Handle round timeout
   */
  private async handleTimeout(): Promise<void> {
    this.state.isGameOver = true;

    this.clearTimeouts();

    await this.updateEmbed(
      'TIMEOUT',
      GIFS.STAGE_1_INTRO,
      'Oops, looks like everyone fell asleep. 💤',
      false // Button disabled
    );

    // Call cleanup callback
    if (this.onGameEnd) {
      this.onGameEnd();
    }
  }

  /**
   * Update the embed with new content
   */
  private async updateEmbed(
    title: string,
    gifUrl: string,
    description: string,
    buttonEnabled: boolean = false
  ): Promise<void> {
    if (!this.state.message) return;

    // Add timestamp to URL to prevent Discord caching
    const uniqueGifUrl = `${gifUrl}?t=${Date.now()}`;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(0xFF0000)
      .setImage(uniqueGifUrl)
      .setFooter({
        text: `Round ${this.state.currentRound}/4 | Naoya: ${this.state.player1Score} | ${this.state.currentStage === 1 ? 'Choso' : 'Maki'}: ${this.state.player2Score}`,
      });

    const components = this.createButton(buttonEnabled);

    await this.state.message.edit({
      embeds: [embed],
      components,
    });
  }

  /**
   * Create the attack button
   */
  private createButton(enabled: boolean): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>();

    const button = new ButtonBuilder()
      .setCustomId('pisscompmax_attack')
      .setLabel('Attack!')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!enabled);

    row.addComponents(button);

    return [row];
  }

  /**
   * Clear all timeouts
   */
  private clearTimeouts(): void {
    if (this.roundTimeout) {
      clearTimeout(this.roundTimeout);
      this.roundTimeout = undefined;
    }
    if (this.disableDelayTimeout) {
      clearTimeout(this.disableDelayTimeout);
      this.disableDelayTimeout = undefined;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if game is over
   */
  isFinished(): boolean {
    return this.state.isGameOver;
  }

  /**
   * Cleanup (call when game ends or bot restarts)
   */
  cleanup(): void {
    this.clearTimeouts();
    this.state.isGameOver = true;
  }
}
