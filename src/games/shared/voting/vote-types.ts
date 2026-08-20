export interface VoteState {
  subject1Votes: number;
  subject2Votes: number;
  voters: Set<string>;
  votingStartTime?: number;
}

export interface VoteResult {
  winner: 'subject1' | 'subject2' | 'tie';
  subject1Votes: number;
  subject2Votes: number;
}

export enum VotePhase {
  VOTING = 'VOTING',
  RESULT = 'RESULT',
  FINISHED = 'FINISHED',
}