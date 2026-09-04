// Card suits and emojis
const SUITS = [
  { name: 'Hearts', emoji: '♥️' },
  { name: 'Diamonds', emoji: '♦️' },
  { name: 'Clubs', emoji: '♣️' },
  { name: 'Spades', emoji: '♠️' },
];

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
  emoji: string;
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
        emoji: suit.emoji,
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

/**
 * Format a card for display
 */
export function formatCard(card: Card): string {
  return `${card.emoji} ${card.rank}`;
}

/**
 * Format a hand for display
 */
export function formatHand(cards: Card[], hideSecond: boolean = false): string {
  if (hideSecond && cards.length > 1) {
    return `${formatCard(cards[0])} ❓`;
  }
  return cards.map(formatCard).join(' ');
}
