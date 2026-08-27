import { addResiduals, getResiduals } from '../database/client.js';

export interface ResidualOptions {
  reason?: string;
  adminUserId?: string;
  description?: string;
}

export class ResidualsService {
  static async awardResiduals(
    userId: string,
    amount: number,
    source: string,
    reason?: string,
    adminUserId?: string,
    description?: string
  ): Promise<number | null> {
    if (amount <= 0) {
      console.error(`awardResiduals called with non-positive amount: ${amount}`);
      return null;
    }
    
    console.log(`Awarding ${amount} Residuals to user ${userId} from source: ${source}`);
    
    return await addResiduals(userId, amount, source, reason, adminUserId, description);
  }
  
  static async removeResiduals(
    userId: string,
    amount: number,
    source: string,
    reason?: string,
    adminUserId?: string,
    description?: string
  ): Promise<number | null> {
    if (amount <= 0) {
      console.error(`removeResiduals called with non-positive amount: ${amount}`);
      return null;
    }
    
    console.log(`Removing ${amount} Residuals from user ${userId} for: ${source}`);
    
    // Use negative amount for removal
    return await addResiduals(userId, -amount, source, reason, adminUserId, description);
  }
  
  static async getResiduals(userId: string): Promise<{ balance: number; lifetime_earned: number; lifetime_spent: number } | null> {
    return await getResiduals(userId);
  }
}

// Convenience functions
export async function awardResiduals(
  userId: string,
  amount: number,
  source: string,
  options?: ResidualOptions
): Promise<number | null> {
  return await ResidualsService.awardResiduals(
    userId,
    amount,
    source,
    options?.reason,
    options?.adminUserId,
    options?.description
  );
}

export async function removeResiduals(
  userId: string,
  amount: number,
  source: string,
  options?: ResidualOptions
): Promise<number | null> {
  return await ResidualsService.removeResiduals(
    userId,
    amount,
    source,
    options?.reason,
    options?.adminUserId,
    options?.description
  );
}

export async function getResidualsInfo(userId: string): Promise<{ balance: number; lifetime_earned: number; lifetime_spent: number } | null> {
  return await ResidualsService.getResiduals(userId);
}
