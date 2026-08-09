/**
 * Simplified database schema for Smash This events.
 * 
 * This schema only stores:
 * - Smash events (standalone events, no tournaments)
 * - Votes for events
 * - Recent user activity for selection pool
 * - Channel activity tracking for automatic spawning
 */

export interface SmashEvent {
  eventId: string;
  guildId: string;
  channelId: string;
  player1Id: string;
  player1DisplayName: string;
  player1AvatarUrl?: string;
  player2Id: string;
  player2DisplayName: string;
  player2AvatarUrl?: string;
  winnerId?: string;
  player1Votes: number;
  player2Votes: number;
  status: 'active' | 'completed' | 'tie';
  createdAt: number;
  votingStartedAt?: number;
  votingEndedAt?: number;
  isManual: boolean; // true if triggered by /smash command
}

export interface Vote {
  id: number;
  eventId: string;
  voterId: string;
  votedForId: string;
  votedAt: number;
}

export interface RecentUserActivity {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  channelId: string;
  lastActiveAt: number;
}

export interface ChannelActivity {
  channelId: string;
  lastActivityAt: number;
  lastSpawnAt?: number;
  activityWindowConsumed: boolean;
}

export interface DatabaseSchema {
  smashEvents: SmashEvent[];
  votes: Vote[];
  recentUserActivity: RecentUserActivity[];
  channelActivity: ChannelActivity[];
}
