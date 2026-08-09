import { config } from '../config/index.js';

export class BobKunPersonality {
  private static readonly EMOJIS = {
    banana: '🍌',
    sparkle: '✨',
    boom: '💥',
    skull: '💀',
    crown: '👑',
    confused: '😵',
    excited: '🤩',
    thinking: '🤔',
    wave: '👋',
    heart: '❤️',
    star: '⭐',
  };

  private static readonly MESSAGES = {
    ready: `${this.EMOJIS.banana} Bob Kun is ready!`,
    contestantsSelected: `${this.EMOJIS.banana} Bob Kun has selected the contestants.`,
    demandDecision: `${this.EMOJIS.boom} BOB KUN DEMANDS A DECISION.`,
    bananaSpoken: `${this.EMOJIS.banana} The banana has spoken.`,
    calculating: `${this.EMOJIS.skull} Bob Kun is calculating...`,
    winner: `${this.EMOJIS.boom} SMASHED!`,
    finalWinner: `${this.EMOJIS.banana} BOB KUN'S FINAL RESULT ${this.EMOJIS.banana}`,
    weHaveWinner: `${this.EMOJIS.crown} WE HAVE A WINNER!`,
    championDeclared: (name: string) => `${this.EMOJIS.banana} Bob Kun officially declares **${name}** the Smash Champion!`,
    notEnoughParticipants: `${this.EMOJIS.banana} Bob Kun needs at least two minions for this game.`,
    alreadyParticipating: `${this.EMOJIS.confused} Bob Kun sees you're already in the game!`,
    joined: `${this.EMOJIS.banana} Bob Kun added you to the Smash This player pool!`,
    left: `${this.EMOJIS.wave} Bob Kun removed you from the Smash This player pool!`,
    notParticipating: `${this.EMOJIS.confused} Bob Kun doesn't see you in the player pool!`,
    noParticipants: `${this.EMOJIS.confused} Bob Kun sees no minions in the player pool!`,
    gameAlreadyRunning: `${this.EMOJIS.confused} Bob Kun is already running a game!`,
    roundAnnouncement: (round: number, total: number) => `${this.EMOJIS.star} ROUND ${round}${total > 0 ? ` of ${total}` : ''} ${this.EMOJIS.star}`,
    nextMatchup: `${this.EMOJIS.banana} Bob Kun presents the next matchup!`,
    error: `${this.EMOJIS.confused} Bob Kun encountered a problem!`,
  };

  static get ready(): string {
    return this.MESSAGES.ready;
  }

  static get contestantsSelected(): string {
    return this.MESSAGES.contestantsSelected;
  }

  static get demandDecision(): string {
    return this.MESSAGES.demandDecision;
  }

  static get bananaSpoken(): string {
    return this.MESSAGES.bananaSpoken;
  }

  static get calculating(): string {
    return this.MESSAGES.calculating;
  }

  static get winner(): string {
    return this.MESSAGES.winner;
  }

  static get finalWinner(): string {
    return this.MESSAGES.finalWinner;
  }

  static get weHaveWinner(): string {
    return this.MESSAGES.weHaveWinner;
  }

  static championDeclared(name: string): string {
    return this.MESSAGES.championDeclared(name);
  }

  static get notEnoughParticipants(): string {
    return this.MESSAGES.notEnoughParticipants;
  }

  static get alreadyParticipating(): string {
    return this.MESSAGES.alreadyParticipating;
  }

  static get joined(): string {
    return this.MESSAGES.joined;
  }

  static get left(): string {
    return this.MESSAGES.left;
  }

  static get notParticipating(): string {
    return this.MESSAGES.notParticipating;
  }

  static get noParticipants(): string {
    return this.MESSAGES.noParticipants;
  }

  static get gameAlreadyRunning(): string {
    return this.MESSAGES.gameAlreadyRunning;
  }

  static roundAnnouncement(round: number, total?: number): string {
    return this.MESSAGES.roundAnnouncement(round, total ?? 0);
  }

  static get nextMatchup(): string {
    return this.MESSAGES.nextMatchup;
  }

  static get error(): string {
    return this.MESSAGES.error;
  }

  static formatWinner(name: string, votes: number, totalVotes: number): string {
    return `**${name}** wins!\n\n${votes} votes — ${totalVotes - votes} votes`;
  }

  static formatChampion(name: string, totalVotes: number): string {
    return `${this.EMOJIS.crown}\n\n**${name}**\n\nSMASH CHAMPION\n\n${totalVotes} TOTAL VOTES`;
  }

  static randomBanana(): string {
    const bananaMessages = [
      `${this.EMOJIS.banana} Bob Kun says banana!`,
      `${this.EMOJIS.banana} BANANA!`,
      `${this.EMOJIS.banana} Bob Kun loves bananas!`,
      `${this.EMOJIS.banana} 🍌`,
    ];
    return bananaMessages[Math.floor(Math.random() * bananaMessages.length)];
  }

  static randomExcited(): string {
    const excitedMessages = [
      `${this.EMOJIS.excited} Bob Kun is excited!`,
      `${this.EMOJIS.sparkle} This is gonna be good!`,
      `${this.EMOJIS.banana} Bob Kun can't wait!`,
    ];
    return excitedMessages[Math.floor(Math.random() * excitedMessages.length)];
  }

  static formatVoteCount(player1Votes: number, player2Votes: number): string {
    return `${player1Votes} votes — ${player2Votes} votes`;
  }

  static get emojis() {
    return this.EMOJIS;
  }
}
