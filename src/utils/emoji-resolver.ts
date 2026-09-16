import { Client, Guild } from 'discord.js';

/**
 * Gets a Discord application emoji by name and returns it in the <:name:id> format
 * @param clientOrGuild - The Discord client or guild to fetch emojis from
 * @param emojiName - The name of the emoji to look up
 * @returns The emoji string in <:name:id> format, or empty string if not found
 */
export function getEmoji(clientOrGuild: Client | Guild | null, emojiName: string): string {
  if (!clientOrGuild) return '';
  
  // Extract client from guild if needed
  const client = clientOrGuild instanceof Client ? clientOrGuild : clientOrGuild.client;
  
  if (!client || !client.application) return '';
  
  // Application emojis are accessed through the client's application emoji collection
  const emoji = client.application.emojis.cache.find(e => e.name === emojiName);
  return emoji ? `<:${emoji.name}:${emoji.id}>` : '';
}

/**
 * Gets a card emoji by suit and rank
 * @param clientOrGuild - The Discord client or guild to fetch emojis from
 * @param suit - The card suit (spades, hearts, diamonds, clubs)
 * @param rank - The card rank (2-10, ace, jack, queen, king)
 * @returns The card emoji string, or card back if not found
 */
export function getCardEmoji(clientOrGuild: Client | Guild | null, suit: string, rank: string): string {
  const emojiName = `${suit}_${rank}`;
  const cardEmoji = getEmoji(clientOrGuild, emojiName);
  return cardEmoji || getEmoji(clientOrGuild, 'card_back');
}

/**
 * Gets the card back emoji
 * @param clientOrGuild - The Discord client or guild to fetch emojis from
 * @returns The card back emoji string
 */
export function getCardBackEmoji(clientOrGuild: Client | Guild | null): string {
  return getEmoji(clientOrGuild, 'card_back');
}

/**
 * Gets the joker emoji
 * @param clientOrGuild - The Discord client or guild to fetch emojis from
 * @returns The joker emoji string
 */
export function getJokerEmoji(clientOrGuild: Client | Guild | null): string {
  return getEmoji(clientOrGuild, 'joker');
}