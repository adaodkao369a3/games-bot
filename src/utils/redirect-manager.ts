// ============================================================
// REDIRECT STATE MANAGEMENT
// ============================================================

// Map of channel IDs to redirect state
// true = redirect enabled, false = redirect disabled
const redirectState = new Map<string, boolean>();

const DIRECTORS_CUT_CHANNEL_ID = '1526869451834654821';

export function isRedirectEnabled(channelId: string): boolean {
  return redirectState.get(channelId) ?? true; // Default to enabled
}

export function setRedirectEnabled(channelId: string, enabled: boolean): void {
  redirectState.set(channelId, enabled);
}

export function getDirectorsCutChannelId(): string {
  return DIRECTORS_CUT_CHANNEL_ID;
}
