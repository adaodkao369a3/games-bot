import { addCoins, getCoinBalance, CoinBalance } from '../database/client.js';

export interface CoinOptions {
  reason?: string;
  description?: string;
  gameInstanceId?: string;
}

export class CoinsService {
  /**
   * Award coins to a user
   * @param userId Discord user ID
   * @param amount Amount to award (must be positive)
   * @param source Source of the coins (e.g., 'gamble', 'admin')
   * @param options Optional reason and description
   * @returns New balance after awarding, or null if failed
   */
  static async awardCoins(
    userId: string,
    amount: number,
    source: string,
    options?: CoinOptions
  ): Promise<number | null> {
    if (amount <= 0) {
      console.error(`[COINS] awardCoins called with non-positive amount: ${amount}`);
      return null;
    }
    
    console.log(`[COINS] Awarding ${amount} coins to user ${userId} from source: ${source}`);
    
    return await addCoins(userId, amount, source, options?.reason, options?.description, options?.gameInstanceId);
  }
  
  /**
   * Remove/spend coins from a user
   * @param userId Discord user ID
   * @param amount Amount to remove (must be positive)
   * @param source Source of the transaction (e.g., 'gamble')
   * @param options Optional reason and description
   * @returns New balance after removal, or null if failed
   */
  static async removeCoins(
    userId: string,
    amount: number,
    source: string,
    options?: CoinOptions
  ): Promise<number | null> {
    if (amount <= 0) {
      console.error(`[COINS] removeCoins called with non-positive amount: ${amount}`);
      return null;
    }
    
    console.log(`[COINS] Removing ${amount} coins from user ${userId} for: ${source}`);
    
    // Use negative amount for removal
    return await addCoins(userId, -amount, source, options?.reason, options?.description, options?.gameInstanceId);
  }
  
  /**
   * Get a user's coin balance information
   * @param userId Discord user ID
   * @returns User's coin balance info, or null if user doesn't exist
   */
  static async getCoinBalance(userId: string): Promise<CoinBalance | null> {
    return await getCoinBalance(userId);
  }
}

// Convenience functions for backward compatibility and ease of use
export async function awardCoins(
  userId: string,
  amount: number,
  source: string,
  options?: CoinOptions
): Promise<number | null> {
  return await CoinsService.awardCoins(userId, amount, source, options);
}

export async function removeCoins(
  userId: string,
  amount: number,
  source: string,
  options?: CoinOptions
): Promise<number | null> {
  return await CoinsService.removeCoins(userId, amount, source, options);
}

export async function getCoinBalanceInfo(userId: string): Promise<CoinBalance | null> {
  return await CoinsService.getCoinBalance(userId);
}
