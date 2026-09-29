import { config } from '../config/index.js';

export class BobKunPersonality {
  private static readonly EMOJIS = {
    banana: '<:bob:1545141387656302663>',
    sparkle: '✨',
    boom: '<a:purplebomb:1545149042378407986>',
    skull: '💀',
    crown: '<:15394trophy:1545135066148118628>',
    confused: '😵',
    excited: '🤩',
    thinking: '🤔',
    wave: '👋',
    heart: '❤️',
    star: '⭐',
    trophy: '🏆',
  };

  private static readonly MESSAGES = {
    ready: `${this.EMOJIS.banana} Bob Kun is ready!`,
    bananaSpoken: `${this.EMOJIS.banana} The banana has spoken.`,
    calculating: `${this.EMOJIS.skull} Bob Kun is calculating...`,
    winner: `${this.EMOJIS.boom} SMASHED!`,
    finalWinner: `${this.EMOJIS.banana} BOB KUN'S FINAL RESULT ${this.EMOJIS.banana}`,
    weHaveWinner: `${this.EMOJIS.crown} WE HAVE A WINNER!`,
    notEnoughParticipants: `${this.EMOJIS.banana} Bob Kun needs at least two minions for this game.`,
    alreadyParticipating: `${this.EMOJIS.confused} Bob Kun sees you're already in the game!`,
    notParticipating: `${this.EMOJIS.confused} Bob Kun doesn't see you in the player pool!`,
    noParticipants: `${this.EMOJIS.confused} Bob Kun sees no minions in the player pool!`,
    gameAlreadyRunning: `${this.EMOJIS.confused} Bob Kun is already running a game!`,
    roundAnnouncement: (round: number, total: number) => `${this.EMOJIS.star} ROUND ${round}${total > 0 ? ` of ${total}` : ''} ${this.EMOJIS.star}`,
    error: `${this.EMOJIS.confused} Bob Kun encountered a problem!`,
    formatWinner: (name: string, votes: number, totalVotes: number) => `**${name}** wins!\n\n${votes} votes — ${totalVotes - votes} votes`,
    randomBanana: () => {
      const bananaMessages = [
        `${this.EMOJIS.banana} Bob Kun says banana!`,
        `${this.EMOJIS.banana} BANANA!`,
        `${this.EMOJIS.banana} Bob Kun loves bananas!`,
        `${this.EMOJIS.banana} <:bob:1545141387656302663>`,
      ];
      return bananaMessages[Math.floor(Math.random() * bananaMessages.length)];
    },
    randomExcited: () => {
      const excitedMessages = [
        `${this.EMOJIS.excited} Bob Kun is excited!`,
        `${this.EMOJIS.sparkle} This is gonna be good!`,
        `${this.EMOJIS.banana} Bob Kun can't wait!`,
      ];
      return excitedMessages[Math.floor(Math.random() * excitedMessages.length)];
    },
    // Trial-specific messages
    trialCourtOpening: `<a:hammer:1545148999386931272><:bob:1545141387656302663> **BOB KUN COURT IS NOW IN SESSION** <:bob:1545141387656302663><a:hammer:1545148999386931272>\nEveryone shut up. The court is cooking. 👨‍<a:hammer:1545148999386931272>`,
    trialAccusation: `<a:alert:1545148996434137149> **A VERY SERIOUS ACCUSATION HAS BEEN MADE.** <a:alert:1545148996434137149>`,
    trialDefense: (accused: string, time: string) => `<a:typing:1545149057503207497> ${accused}, what do you have to say for yourself?!\n\n<a:alarm1:1545148991782518844> You have **${time}**.\nMake it count. 😭`,
    trialVoting: `👨‍<a:hammer:1545148999386931272> **JURY, THE COURT AWAITS YOUR VERDICT.**\n\nGuilty or innocent?\nChoose wisely... 👁️`,
    trialVotingAlmostDone: `<a:alarm1:1545148991782518844> **THE JURY IS RUNNING OUT OF TIME...**`,
    trialDrawFirst: `<a:hammer:1545148999386931272> **HOLD ON.**\n\nIT'S A DRAW?! 😭\n\nThe court refuses to end like this.\nThe accused gets **another chance to defend themselves.**\n\n<a:typing:1545149057503207497> **30 SECONDS. GO.**`,
    trialDrawSecond: `😭 **YOU'VE GOT TO BE KIDDING ME.**\n\nSTILL A DRAW.\n\nOne final defense...\n<a:alarm1:1545148991782518844> **15 SECONDS.**`,
    trialNoJudgement: `<a:hammer:1545148999386931272>💀 **NO JUDGEMENT COULD BE MADE TODAY.**\n\nThe jury has failed Bob Kun.`,
    trialGuilty: (accused: string, accusation: string, sentence: string) => `<a:alert:1545148996434137149> **VERDICT: GUILTY** <a:alert:1545148996434137149>\n\n${accused} has been found guilty of:\n\n**"${accusation}"**\n\n<a:hammer:1545148999386931272> **SENTENCED TO:**\n\n*"${sentence}"*\n\n😭 It's over for you, buddy.`,
    trialInnocent: `<a:hammer:1545148999386931272> **VERDICT: NOT GUILTY** <a:hammer:1545148999386931272>\n\nThe jury has spoken! Justice prevails! <a:confettipopper:1545132978139693227>`,
    trialJump: `😳 **OUUU SHIIII...**`,
    trialEveryoneVote: `🗳️ **EVERYONE IS A JUROR.**\n\nProsecutor? Vote.\nDefense? Vote.\nRandom guy eating a sandwich? **VOTE.** <:bob:1545141387656302663>`,
  };

  static get ready(): string {
    return this.MESSAGES.ready;
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

  static get notEnoughParticipants(): string {
    return this.MESSAGES.notEnoughParticipants;
  }

  static get alreadyParticipating(): string {
    return this.MESSAGES.alreadyParticipating;
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

  static get error(): string {
    return this.MESSAGES.error;
  }

  // Trial-specific getters
  static get trialCourtOpening(): string {
    return this.MESSAGES.trialCourtOpening;
  }

  static get trialAccusation(): string {
    return this.MESSAGES.trialAccusation;
  }

  static trialDefense(accused: string, time: string): string {
    return this.MESSAGES.trialDefense(accused, time);
  }

  static get trialVoting(): string {
    return this.MESSAGES.trialVoting;
  }

  static get trialVotingAlmostDone(): string {
    return this.MESSAGES.trialVotingAlmostDone;
  }

  static get trialDrawFirst(): string {
    return this.MESSAGES.trialDrawFirst;
  }

  static get trialDrawSecond(): string {
    return this.MESSAGES.trialDrawSecond;
  }

  static get trialNoJudgement(): string {
    return this.MESSAGES.trialNoJudgement;
  }

  static trialGuilty(accused: string, accusation: string, sentence: string): string {
    return this.MESSAGES.trialGuilty(accused, accusation, sentence);
  }

  static get trialInnocent(): string {
    return this.MESSAGES.trialInnocent;
  }

  static get trialJump(): string {
    return this.MESSAGES.trialJump;
  }

  static get trialEveryoneVote(): string {
    return this.MESSAGES.trialEveryoneVote;
  }

  static formatWinner(name: string, votes: number, totalVotes: number): string {
    return `**${name}** wins!\n\n${votes} votes — ${totalVotes - votes} votes`;
  }

  static randomBanana(): string {
    const bananaMessages = [
      `${this.EMOJIS.banana} Bob Kun says banana!`,
      `${this.EMOJIS.banana} BANANA!`,
      `${this.EMOJIS.banana} Bob Kun loves bananas!`,
      `${this.EMOJIS.banana} <:bob:1545141387656302663>`,
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

  static get emojis() {
    return this.EMOJIS;
  }
}
