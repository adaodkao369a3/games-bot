// Pure logic helpers for roulette betting

export type RouletteBet =
  | { kind: 'color'; value: 'red' | 'black' | 'green' }
  | { kind: 'parity'; value: 'odd' | 'even' }
  | { kind: 'range'; value: 'low' | 'high' }
  | { kind: 'row'; value: 1 | 2 | 3 }
  | { kind: 'dozen'; value: 1 | 2 | 3 }
  | { kind: 'number'; value: number };

// Red numbers in European roulette
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

// Wheel order (clockwise from 0)
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

export function isWinningBet(bet: RouletteBet, result: number): boolean {
  switch (bet.kind) {
    case 'color':
      if (bet.value === 'green') return result === 0;
      if (bet.value === 'red') return RED_NUMBERS.has(result);
      if (bet.value === 'black') return result > 0 && !RED_NUMBERS.has(result);
      return false;
    case 'parity':
      if (result === 0) return false;
      if (bet.value === 'odd') return result % 2 === 1;
      if (bet.value === 'even') return result % 2 === 0;
      return false;
    case 'range':
      if (result === 0) return false;
      if (bet.value === 'low') return result >= 1 && result <= 18;
      if (bet.value === 'high') return result >= 19 && result <= 36;
      return false;
    case 'row':
      if (result === 0) return false;
      if (bet.value === 1) return result % 3 === 1;
      if (bet.value === 2) return result % 3 === 2;
      if (bet.value === 3) return result % 3 === 0;
      return false;
    case 'dozen':
      if (result === 0) return false;
      if (bet.value === 1) return result >= 1 && result <= 12;
      if (bet.value === 2) return result >= 13 && result <= 24;
      if (bet.value === 3) return result >= 25 && result <= 36;
      return false;
    case 'number':
      return bet.value === result;
  }
}

export function describeBet(bet: RouletteBet): string {
  switch (bet.kind) {
    case 'color':
      return bet.value === 'green' ? 'Green (0)' : bet.value.charAt(0).toUpperCase() + bet.value.slice(1);
    case 'parity':
      return bet.value.charAt(0).toUpperCase() + bet.value.slice(1);
    case 'range':
      return bet.value === 'low' ? '1–18' : '19–36';
    case 'row':
      return `${bet.value}${getOrdinalSuffix(bet.value)} Row`;
    case 'dozen':
      return `${bet.value}${getOrdinalSuffix(bet.value)} Dozen`;
    case 'number':
      return `Number ${bet.value}`;
  }
}

function getOrdinalSuffix(n: number): string {
  if (n === 1) return 'st';
  if (n === 2) return 'nd';
  if (n === 3) return 'rd';
  return 'th';
}

export function payoutMultiplier(bet: RouletteBet): number {
  switch (bet.kind) {
    case 'color':
    case 'parity':
    case 'range':
      return 2;
    case 'row':
    case 'dozen':
      return 3;
    case 'number':
      return 36;
  }
}

export function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}
