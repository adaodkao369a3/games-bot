import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction, EmbedBuilder } from 'discord.js';
import { getGifDuration } from '../utils/gif-duration.js';
import { PissCompGame, PissCompPlayer } from './PissCompGame.js';

/**
 * JJK Fight Sequence GIF URLs
 */
const GIFS = {
  // Transition GIFs
  TRANSITION_1: 'https://media.tenor.com/UHmop4IsTSAAAAAC/choso-stand-off-choso-aura.gif',
  TRANSITION_2: 'https://media.tenor.com/puaEEA-J_8oAAAAd/jujutsu-kaisen-jjk.gif',

  // Stage 1: Naoya vs Choso
  STAGE_1_INTRO: 'https://media.tenor.com/UHmop4IsTSAAAAAC/choso-stand-off-choso-aura.gif',

  // Naoya Stage 1 attacks
  NAOYA_S1_MOVE_1: 'https://media.tenor.com/Wfc3sxS8ZmIAAAAM/naoya-zenin.gif',
  NAOYA_S1_MOVE_2: 'https://media.tenor.com/ze1DLgRmCl0AAAAM/jjk-jujutsu-kaisen.gif',
  NAOYA_S1_MOVE_3: 'https://media.tenor.com/L5UvsfC0m5kAAAAd/choso-vs-naoya-jujutsu-kaisen.gif',
  NAOYA_S1_WIN: 'https://media.tenor.com/Wfc3sxS8ZmIAAAAM/naoya-zenin.gif',

  // Choso Stage 1 attacks
  CHOSO_S1_MOVE_1: 'https://media.tenor.com/ze1DLgRmCl0AAAAM/jjk-jujutsu-kaisen.gif',
  CHOSO_S1_MOVE_2: 'https://media.tenor.com/L5UvsfC0m5kAAAAd/choso-vs-naoya-jujutsu-kaisen.gif',
  CHOSO_S1_MOVE_3: 'https://media.tenor.com/UHmop4IsTSAAAAAC/choso-stand-off-choso-aura.gif',
  CHOSO_S1_WIN: 'https://media.tenor.com/L5UvsfC0m5kAAAAd/choso-vs-naoya-jujutsu-kaisen.gif',

  // Stage 2: Naoya vs Maki
  STAGE_2_INTRO: 'https://media.tenor.com/puaEEA-J_8oAAAAd/jujutsu-kaisen-jjk.gif',

  // Naoya Stage 2 attacks
  NAOYA_S2_MOVE_1: 'https://media.tenor.com/3hHnMhrLNYsAAAAd/naoya-folk.gif',
  NAOYA_S2_MOVE_2: 'https://media.tenor.com/kANPHZ2EhjIAAAAd/maki-zenin-jujutsu-kaisen.gif',
  NAOYA_S2_MOVE_3: 'https://media.tenor.com/puaEEA-J_8oAAAAd/jujutsu-kaisen-jjk.gif',
  NAOYA_S2_WIN: 'https://media.tenor.com/3hHnMhrLNYsAAAAd/naoya-folk.gif',

  // Maki Stage 2 attacks
  MAKI_S2_MOVE_1: 'https://media.tenor.com/kANPHZ2EhjIAAAAd/maki-zenin-jujutsu-kaisen.gif',
  MAKI_S2_MOVE_2: 'https://media.tenor.com/puaEEA-J_8oAAAAd/jujutsu-kaisen-jjk.gif',
  MAKI_S2_MOVE_3: 'https://media.tenor.com/3hHnMhrLNYsAAAAd/naoya-folk.gif',
  MAKI_S2_WIN: 'https://media.tenor.com/kANPHZ2EhjIAAAAd/maki-zenin-jujutsu-kaisen.gif',

  // Final draw
  FINAL_DRAW: 'https://media.tenor.com/UHmop4IsTSAAAAAC/choso-stand-off-choso-aura.gif',
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
    console.log('[PissCompMax] Starting JJK fight sequence');
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
    console.log(`[PissCompMax] Starting round ${this.state.currentRound}`);
    this.state.isButtonEnabled = false;
    this.state.roundStartTime = Date.now();

    const stage = this.state.currentStage;
    const opponentName = stage === 1 ? 'Choso' : 'Maki';
    const description = `Round ${this.state.currentRound}/4\n\nNaoya Zenin: ${this.state.player1Score}\n${opponentName}: ${this.state.player2Score}\n\nGet ready to dodge!`;

    // Show waiting GIF with disabled button
    console.log('[PissCompMax] Showing waiting embed with disabled button');
    await this.updateEmbed(
      stage === 1 ? 'STAGE 1 — NAOYA VS CHOSO' : 'STAGE 2 — NAOYA VS MAKI',
      stage === 1 ? GIFS.STAGE_1_INTRO : GIFS.STAGE_2_INTRO,
      description,
      false // Button disabled
    );

    // Enable button after 3 seconds
    console.log(`[PissCompMax] Setting button enable timeout for ${PissCompMaxGame.BUTTON_DISABLE_DELAY_MS}ms`);
    this.disableDelayTimeout = setTimeout(async () => {
      console.log('[PissCompMax] Button enable timeout fired');
      if (this.state.isGameOver) {
        console.log('[PissCompMax] Game over, skipping button enable');
        return;
      }

      this.state.isButtonEnabled = true;
      console.log('[PissCompMax] Button enabled, updating embed');
      await this.updateEmbed(
        stage === 1 ? 'STAGE 1 — NAOYA VS CHOSO' : 'STAGE 2 — NAOYA VS MAKI',
        stage === 1 ? GIFS.STAGE_1_INTRO : GIFS.STAGE_2_INTRO,
        description + '\n\n🔴 DODGE THIS!',
        true // Button enabled
      );

      // Set round timeout (20 seconds total, so 17 seconds remaining after 3s delay)
      this.roundTimeout = setTimeout(() => {
        console.log('[PissCompMax] Round timeout fired');
        this.handleTimeout();
      }, PissCompMaxGame.ROUND_TIMEOUT_MS - PissCompMaxGame.BUTTON_DISABLE_DELAY_MS);
    }, PissCompMaxGame.BUTTON_DISABLE_DELAY_MS);
  }

  /**
   * Handle button interaction
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    console.log(`[PissCompMax] Button clicked by ${interaction.user.id}, customId: ${interaction.customId}`);
    console.log(`[PissCompMax] Game state - isGameOver: ${this.state.isGameOver}, isButtonEnabled: ${this.state.isButtonEnabled}`);
    console.log(`[PissCompMax] Player 1: ${this.state.player1.id}, Player 2: ${this.state.player2.id}`);

    if (this.state.isGameOver) {
      console.log('[PissCompMax] Game already over, ignoring click');
      await interaction.reply({
        content: 'This game has already ended.',
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;

    // Validate: only players can click
    if (userId !== this.state.player1.id && userId !== this.state.player2.id) {
      console.log('[PissCompMax] Non-player tried to click');
      await interaction.reply({
        content: 'Only the participants can click this button!',
        ephemeral: true,
      });
      return;
    }

    // Validate: button must be enabled
    if (!this.state.isButtonEnabled) {
      console.log('[PissCompMax] Button not enabled yet');
      await interaction.reply({
        content: 'Wait for the button to be enabled!',
        ephemeral: true,
      });
      return;
    }

    console.log(`[PissCompMax] Button click validated, isButtonEnabled: ${this.state.isButtonEnabled}`);

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

    console.log(`[PissCompMax] Score updated - Naoya: ${this.state.player1Score}, Opponent: ${this.state.player2Score}`);

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

    console.log(`[PissCompMax] Updating embed with GIF: ${gifUrl}`);
    console.log(`[PissCompMax] Button enabled: ${buttonEnabled}`);

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

    try {
      await this.state.message.edit({
        embeds: [embed],
        components,
      });
      console.log('[PissCompMax] Embed updated successfully');
    } catch (error) {
      console.error('[PissCompMax] Error updating embed:', error);
    }
  }

  /**
   * Create the attack button
   */
  private createButton(enabled: boolean): ActionRowBuilder<ButtonBuilder>[] {
    console.log(`[PissCompMax] Creating button - enabled: ${enabled}`);
    const row = new ActionRowBuilder<ButtonBuilder>();

    const button = new ButtonBuilder()
      .setCustomId('pisscompmax_attack')
      .setLabel('Attack!')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!enabled);

    row.addComponents(button);

    console.log(`[PissCompMax] Button created - disabled: ${!enabled}`);
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
