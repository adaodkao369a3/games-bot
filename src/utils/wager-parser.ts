/**
 * Parses a wager string that supports:
 *   - Plain numbers, with or without commas: "500", "1,500"
 *   - Shorthand suffixes: "10k" -> 10,000, "2.5m" -> 2,500,000
 *   - "all" / "max": wagers the player's entire current balance
 * 
 * @param raw - The raw wager string from user input
 * @param balance - The user's current coin balance (required for "all"/"max")
 * @returns The parsed wager amount, or null if invalid
 */
export function parseWagerAmount(raw: string, balance: number): number | null {
  const input = raw.trim().toLowerCase().replace(/,/g, '');

  if (!input) return null;

  if (input === 'all' || input === 'max') {
    return balance > 0 ? balance : null;
  }

  const match = input.match(/^(\d+(?:\.\d+)?)([km]?)$/);
  if (!match) return null;

  let value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;

  if (match[2] === 'k') value *= 1_000;
  else if (match[2] === 'm') value *= 1_000_000;

  value = Math.floor(value);

  if (value <= 0) return null;

  return value;
}
