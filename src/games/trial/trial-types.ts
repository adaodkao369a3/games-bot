export type TrialPhase =
  | "opening"
  | "defense"
  | "voting"
  | "result"
  | "sentence"
  | "jump"
  | "technical"
  | "innocent"
  | "no_judgement"
  | "ended";

export type DefenseRound = 1 | 2 | 3;
export type VoteRound = 1 | 2 | 3;
export type DefenseDuration = 60 | 30 | 15;

export interface TrialState {
  trialId: string;
  channelId: string;
  guildId: string;
  accuserId: string;
  accusedId: string;
  accusation: string;
  phase: TrialPhase;
  defenseRound: DefenseRound;
  defenseDurationSeconds: DefenseDuration;
  voteRound: VoteRound;
  guiltyVotes: Set<string>;
  innocentVotes: Set<string>;
  result?: "guilty" | "innocent" | "draw";
  sentence?: string;
  messageId?: string;
  votingMessageId?: string;
  startedAt: number;
  defenseEndsAt?: number;
  votingEndsAt?: number;
}

export interface TrialConfig {
  trialId: string;
  channelId: string;
  guildId: string;
  accuserId: string;
  accusedId: string;
  accusation: string;
}