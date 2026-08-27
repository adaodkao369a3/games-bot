import { Pool, PoolClient, type QueryResultRow } from 'pg';
import { config } from '../config/index.js';

let pool: Pool | null = null;

export interface User extends QueryResultRow {
  user_id: string;
  username: string;
  nickname: string | null;
  current_xp: number;
  current_level: number;
  current_progression_role: string;
  promotion_eligibility_percentage: number;
  total_residuals_balance: number;
  lifetime_residuals_earned: number;
  lifetime_residuals_spent: number;
  last_xp_timestamp: Date | null;
  daily_xp_earned: number;
  last_daily_xp_reset: Date | null;
  daily_bonus_paid: boolean;
  last_promotion_timestamp: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ResidualBalanceRow extends QueryResultRow {
  total_residuals_balance: number;
  lifetime_residuals_earned: number;
  lifetime_residuals_spent: number;
}

export async function connect(): Promise<void> {
  if (pool) {
    console.log('Database pool already initialized');
    return;
  }

  if (!config.database.url) {
    throw new Error('DATABASE_URL is not set');
  }

  pool = new Pool({
    connectionString: config.database.url,
    max: 10,
  });

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('✓ Database connected');
  } catch (error) {
    console.error('✗ Failed to connect to database:', error);
    await pool.end().catch(endError => {
      console.error('✗ Failed to close database pool after connection error:', endError);
    });
    pool = null;
    throw error;
  }
}

export async function disconnect(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✓ Database disconnected');
  }
}

export async function getClient(): Promise<PoolClient> {
  if (!pool) {
    throw new Error('Database not connected. Call connect() first.');
  }
  return pool.connect();
}

export async function getUser(userId: string): Promise<User | null> {
  const client = await getClient();
  try {
    const result = await client.query<User>(
      'SELECT * FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToUser(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function addResiduals(
  userId: string,
  amount: number,
  source: string,
  reason?: string,
  adminUserId?: string,
  description?: string
): Promise<number | null> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Get current balance with row lock for atomicity
    const userResult = await client.query<ResidualBalanceRow>(
      'SELECT total_residuals_balance, lifetime_residuals_earned, lifetime_residuals_spent FROM users WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const balanceBefore = userResult.rows[0].total_residuals_balance;
    const balanceAfter = balanceBefore + amount;
    
    // Prevent negative balance
    if (balanceAfter < 0) {
      await client.query('ROLLBACK');
      return null;
    }

    // Update user balance
    await client.query(
      `UPDATE users 
       SET total_residuals_balance = total_residuals_balance + $1,
           lifetime_residuals_earned = lifetime_residuals_earned + GREATEST($1, 0),
           lifetime_residuals_spent = lifetime_residuals_spent + GREATEST(-$1, 0),
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [amount, userId]
    );

    // Determine transaction type
    let transactionType = 'neutral';
    if (amount > 0) transactionType = 'earn';
    if (amount < 0) transactionType = 'spend';

    // Log transaction
    await client.query(
      `INSERT INTO residual_transactions 
       (user_id, amount, balance_before, balance_after, transaction_type, source, reason, admin_user_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId,
        amount,
        balanceBefore,
        balanceAfter,
        transactionType,
        source,
        reason || null,
        adminUserId || null,
        description || null,
      ]
    );

    await client.query('COMMIT');
    return balanceAfter;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to add residuals:', error);
    return null;
  } finally {
    client.release();
  }
}

export async function getResiduals(userId: string): Promise<{ balance: number; lifetime_earned: number; lifetime_spent: number } | null> {
  const client = await getClient();
  try {
    const result = await client.query<ResidualBalanceRow>(
      'SELECT total_residuals_balance, lifetime_residuals_earned, lifetime_residuals_spent FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      balance: row.total_residuals_balance,
      lifetime_earned: row.lifetime_residuals_earned,
      lifetime_spent: row.lifetime_residuals_spent,
    };
  } finally {
    client.release();
  }
}

function mapRowToUser(row: User): User {
  return {
    user_id: row.user_id,
    username: row.username,
    nickname: row.nickname,
    current_xp: row.current_xp,
    current_level: row.current_level,
    current_progression_role: row.current_progression_role,
    promotion_eligibility_percentage: row.promotion_eligibility_percentage,
    total_residuals_balance: row.total_residuals_balance,
    lifetime_residuals_earned: row.lifetime_residuals_earned,
    lifetime_residuals_spent: row.lifetime_residuals_spent,
    last_xp_timestamp: row.last_xp_timestamp,
    daily_xp_earned: row.daily_xp_earned,
    last_daily_xp_reset: row.last_daily_xp_reset,
    daily_bonus_paid: row.daily_bonus_paid || false,
    last_promotion_timestamp: row.last_promotion_timestamp,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
