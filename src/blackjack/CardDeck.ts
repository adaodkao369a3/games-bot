import { Client, Guild } from 'discord.js';
import { EMOJIS } from '../utils/emoji-registry.js';

// Card suits and emoji names
const SUITS = [
  { name: 'Hearts', emojiName: 'hearts' },
  { name: 'Diamonds', emojiName: 'diamonds' },
  { name: 'Clubs', emojiName: 'clubs' },
  { name: 'Spades', emojiName: 'spades' },
];

// Suit symbols for the short text label (e.g. K♠)
const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

/** Rank as it appears in the emoji names: A -> ace, J -> jack, Q -> queen, K -> king, 2..10 stay. */
export function rankEmojiKey(rank: string): string {
  switch (rank.toUpperCase()) {
    case 'A': return 'ace';
    case 'J': return 'jack';
    case 'Q': return 'queen';
    case 'K': return 'king';
    default: return rank.toLowerCase();
  }
}

/** Registry key of a card emoji, e.g. hearts_ace, spades_10 */
export function cardEmojiKey(suit: string, rank: string): string {
  return `${suit.toLowerCase()}_${rankEmojiKey(rank)}`;
}

// Card ranks and values
const RANKS = [
  { name: 'A', value: 1 },
  { name: '2', value: 2 },
  { name: '3', value: 3 },
  { name: '4', value: 4 },
  { name: '5', value: 5 },
  { name: '6', value: 6 },
  { name: '7', value: 7 },
  { name: '8', value: 8 },
  { name: '9', value: 9 },
  { name: '10', value: 10 },
  { name: 'J', value: 10 },
  { name: 'Q', value: 10 },
  { name: 'K', value: 10 },
];

export interface Card {
  rank: string;
  suit: string;
  value: number;
  emojiName: string;
}

/**
 * Create and shuffle a standard 52-card deck
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        rank: rank.name,
        suit: suit.name,
        value: rank.value,
        emojiName: cardEmojiKey(suit.emojiName, rank.name),
      });
    }
  }
  
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

/**
 * Calculate the total value of a hand, handling Aces
 */
export function calculateHandTotal(cards: Card[]): number {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    total += card.value;
    if (card.rank === 'A') {
      aces++;
    }
  }

  // Handle Aces: count as 11 if it doesn't bust
  while (aces > 0 && total <= 11) {
    total += 10;
    aces--;
  }

  return total;
}

/**
 * Check if a hand is a natural Blackjack (Ace + 10-value card, exactly 2 cards)
 */
export function isBlackjack(cards: Card[]): boolean {
  if (cards.length !== 2) return false;
  
  const hasAce = cards.some(c => c.rank === 'A');
  const hasTen = cards.some(c => c.value === 10);
  
  return hasAce && hasTen;
}

/**
 * Check if a hand is busted
 */
export function isBust(cards: Card[]): boolean {
  return calculateHandTotal(cards) > 21;
}

/** Short text label, e.g. K♠ or 10♥ */
export function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit.toLowerCase()] ?? ''}`;
}

/**
 * Card emoji from the registry. Never calls the Discord API (the old lookup did a
 * network fetch per card). Falls back to the text label if an emoji is missing.
 */
export function cardEmoji(card: Card): string {
  return (EMOJIS as Record<string, string>)[card.emojiName] ?? `**${cardLabel(card)}**`;
}

/** Kept async + client param so existing callers keep working. */
export async function formatCard(card: Card, _client: Client | Guild | null = null): Promise<string> {
  return cardEmoji(card);
}

/** A hand as one tight row of card emojis. hideSecond shows the first card + a card back. */
export async function formatHand(cards: Card[], hideSecond: boolean = false, _client: Client | Guild | null = null): Promise<string> {
  if (hideSecond && cards.length > 1) {
    return `${cardEmoji(cards[0])}${EMOJIS.card_back}`;
  }
  return cards.map(cardEmoji).join('');
}
