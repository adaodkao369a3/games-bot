import { GuildMember } from 'discord.js';

/**
 * Check if a user has staff permissions
 * Staff is defined as having Administrator permission
 */
export function isStaff(member: GuildMember | null | undefined): boolean {
  if (!member) {
    return false;
  }
  return member.permissions.has('Administrator');
}

/**
 * Check if a user has staff permissions and send denial message if not
 * Returns true if user is staff, false otherwise
 */
export async function requireStaffPermission(member: GuildMember | null | undefined): Promise<boolean> {
  if (isStaff(member)) {
    return true;
  }
  return false;
}
