import { Pool, PoolClient, type QueryResultRow } from 'pg';
import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';

let pool: Pool | null = null;

export interface CoinBalance {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  lifetime_gambled: number;
}

function parseBigInt(value: string | number): number {
  if (typeof value === 'number') return value;
  return parseInt(value, 10);
}

export interface CoinTransaction {
  id: number;
  user_id: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  transaction_type: string;
  source: string;
  reason: string | null;
  description: string | null;
  created_at: Date;
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

    // Initialize schema
    await initializeSchema();
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

async function initializeSchema(): Promise<void> {
  try {
    // Check if users table exists and has the correct schema
    const tableCheck = await pool!.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND table_schema = 'public'
    `);
    
    if (tableCheck.rows.length === 0) {
      // Table doesn't exist, create from schema
      const schemaPath = path.join(process.cwd(), 'src', 'database', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      await pool!.query(schema);
      console.log('✓ Database schema initialized');
    } else {
      // Check if it has the coin columns
      const hasCoinColumns = tableCheck.rows.some(
        (row: any) => row.column_name === 'coin_balance'
      );
      
      if (!hasCoinColumns) {
        console.error('✗ Existing users table does not have Bombo Coins schema. Please manually migrate or drop the table.');
        throw new Error('Incompatible database schema detected');
      } else {
        console.log('✓ Database schema already exists with Bombo Coins');
      }

      // Check if coin_transactions has game_instance_id column
      const transactionsCheck = await pool!.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'coin_transactions' 
        AND table_schema = 'public'
        AND column_name = 'game_instance_id'
      `);

      if (transactionsCheck.rows.length === 0) {
        console.log('⚠ coin_transactions table missing game_instance_id column, adding migration...');
        
        // Add game_instance_id column (allow NULL for existing rows)
        await pool!.query(`
          ALTER TABLE coin_transactions 
          ADD COLUMN IF NOT EXISTS game_instance_id VARCHAR(255)
        `);
        
        // Add UNIQUE constraint (idempotent - won't fail if constraint already exists)
        try {
          await pool!.query(`
            ALTER TABLE coin_transactions 
            ADD CONSTRAINT coin_transactions_game_instance_id_key UNIQUE (game_instance_id)
          `);
        } catch (constraintError: any) {
          // Constraint might already exist, which is fine
          if (!constraintError.message.includes('already exists')) {
            throw constraintError;
          }
        }
        
        console.log('✓ Migration completed: game_instance_id column added to coin_transactions');
      } else {
        console.log('✓ coin_transactions table has game_instance_id column');
      }

      // Check if users has lifetime_gambled column
      const usersCheck = await pool!.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND table_schema = 'public'
        AND column_name = 'lifetime_gambled'
      `);

      if (usersCheck.rows.length === 0) {
        console.log('⚠ users table missing lifetime_gambled column, adding migration...');
        
        // Add lifetime_gambled column (allow NULL for existing rows)
        await pool!.query(`
          ALTER TABLE users 
          ADD COLUMN IF NOT EXISTS lifetime_gambled BIGINT DEFAULT 0
        `);
        
        console.log('✓ Migration completed: lifetime_gambled column added to users');
      } else {
        console.log('✓ users table has lifetime_gambled column');
      }
    }
  } catch (error) {
    console.error('✗ Failed to initialize database schema:', error);
    throw error;
  }
}

/**
 * Get or create a user's coin balance
 * This ensures users exist in the database before transactions
 */
async function getOrCreateUser(userId: string, client: PoolClient): Promise<CoinBalance> {
  // Try to get existing user
  const result = await client.query(
    'SELECT coin_balance as balance, lifetime_coins_earned as lifetime_earned, lifetime_coins_spent as lifetime_spent, lifetime_gambled FROM users WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length > 0) {
    const row = result.rows[0];
    return {
      balance: parseBigInt(row.balance),
      lifetime_earned: parseBigInt(row.lifetime_earned),
      lifetime_spent: parseBigInt(row.lifetime_spent),
      lifetime_gambled: parseBigInt(row.lifetime_gambled || 0)
    };
  }

  // Create new user with 0 balance
  await client.query(
    'INSERT INTO users (user_id, coin_balance, lifetime_coins_earned, lifetime_coins_spent, lifetime_gambled) VALUES ($1, 0, 0, 0, 0)',
    [userId]
  );

  return {
    balance: 0,
    lifetime_earned: 0,
    lifetime_spent: 0,
    lifetime_gambled: 0
  };
}

/**
 * Add coins to a user's balance atomically
 * @param userId Discord user ID
 * @param amount Amount to add (positive for earning, negative for spending)
 * @param source Source of the transaction (e.g., 'gamble', 'admin')
 * @param reason Optional reason for the transaction
 * @param description Optional description
 * @param gameInstanceId Optional unique identifier for game instance (prevents duplicate rewards)
 * @returns New balance after transaction, or null if failed
 */
export async function addCoins(
  userId: string,
  amount: number,
  source: string,
  reason?: string,
  description?: string,
  gameInstanceId?: string
): Promise<number | null> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Get or create user with row lock for atomicity
    const balance = await getOrCreateUser(userId, client);
    
    // Lock the user row for this transaction
    const lockResult = await client.query(
      'SELECT coin_balance as balance, lifetime_coins_earned as lifetime_earned, lifetime_coins_spent as lifetime_spent FROM users WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    
    const currentBalance = parseBigInt(lockResult.rows[0].balance);
    const newBalance = currentBalance + amount;
    
    // Prevent zero amount transactions
    if (amount === 0) {
      await client.query('ROLLBACK');
      console.error(`[COINS] Transaction rejected: zero amount. User: ${userId}`);
      return null;
    }
    
    // Prevent negative balance
    if (newBalance < 0) {
      await client.query('ROLLBACK');
      console.error(`[COINS] Transaction rejected: would result in negative balance. User: ${userId}, Current: ${currentBalance}, Amount: ${amount}`);
      return null;
    }

    // Update user balance atomically
    // If source is 'gamble', also increment lifetime_gambled
    if (source === 'gamble') {
      await client.query(
        `UPDATE users 
         SET coin_balance = CAST(coin_balance AS BIGINT) + $1,
             lifetime_coins_earned = CAST(lifetime_coins_earned AS BIGINT) + GREATEST($1, 0),
             lifetime_coins_spent = CAST(lifetime_coins_spent AS BIGINT) + GREATEST(-$1, 0),
             lifetime_gambled = CAST(lifetime_gambled AS BIGINT) + GREATEST(-$1, 0)
         WHERE user_id = $2`,
        [amount, userId]
      );
    } else {
      await client.query(
        `UPDATE users 
         SET coin_balance = CAST(coin_balance AS BIGINT) + $1,
             lifetime_coins_earned = CAST(lifetime_coins_earned AS BIGINT) + GREATEST($1, 0),
             lifetime_coins_spent = CAST(lifetime_coins_spent AS BIGINT) + GREATEST(-$1, 0)
         WHERE user_id = $2`,
        [amount, userId]
      );
    }

    // Determine transaction type
    let transactionType = 'neutral';
    if (amount > 0) transactionType = 'earn';
    if (amount < 0) transactionType = 'spend';

    // Log transaction with optional game_instance_id
    if (gameInstanceId) {
      await client.query(
        `INSERT INTO coin_transactions 
         (user_id, amount, balance_before, balance_after, transaction_type, source, reason, description, game_instance_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId,
          amount,
          currentBalance,
          newBalance,
          transactionType,
          source,
          reason || null,
          description || null,
          gameInstanceId,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO coin_transactions 
         (user_id, amount, balance_before, balance_after, transaction_type, source, reason, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          amount,
          currentBalance,
          newBalance,
          transactionType,
          source,
          reason || null,
          description || null,
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`[COINS] Transaction successful: User ${userId}, Amount: ${amount}, New Balance: ${newBalance}, Source: ${source}${gameInstanceId ? `, GameInstance: ${gameInstanceId}` : ''}`);
    return newBalance;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[COINS] Failed to rollback transaction:', rollbackError);
    }
    console.error('[COINS] Transaction failed:', error);
    console.error('[COINS] Error details:', {
      userId,
      amount,
      source,
      gameInstanceId,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    });
    return null;
  } finally {
    client.release();
  }
}

/**
 * Get a user's current coin balance
 * @param userId Discord user ID
 * @returns User's coin balance info, or null if user doesn't exist
 */
export async function getCoinBalance(userId: string): Promise<CoinBalance | null> {
  const client = await getClient();
  try {
    const result = await client.query(
      'SELECT coin_balance as balance, lifetime_coins_earned as lifetime_earned, lifetime_coins_spent as lifetime_spent, lifetime_gambled FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      balance: parseBigInt(row.balance),
      lifetime_earned: parseBigInt(row.lifetime_earned),
      lifetime_spent: parseBigInt(row.lifetime_spent),
      lifetime_gambled: parseBigInt(row.lifetime_gambled || 0)
    };
  } finally {
    client.release();
  }
}

/**
 * Get transaction history for a user
 * @param userId Discord user ID
 * @param limit Maximum number of transactions to return
 * @returns Array of transactions
 */
export async function getTransactionHistory(userId: string, limit: number = 50): Promise<CoinTransaction[]> {
  const client = await getClient();
  try {
    const result = await client.query(
      'SELECT * FROM coin_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      amount: parseBigInt(row.amount),
      balance_before: parseBigInt(row.balance_before),
      balance_after: parseBigInt(row.balance_after),
      transaction_type: row.transaction_type,
      source: row.source,
      reason: row.reason,
      description: row.description,
      created_at: row.created_at
    }));
  } finally {
    client.release();
  }
}

/**
 * Create a user with 0 balance if they don't exist
 * @param userId Discord user ID
 * @returns User's coin balance info
 */
export async function createOrUpdateUser(userId: string): Promise<CoinBalance> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const balance = await getOrCreateUser(userId, client);
    await client.query('COMMIT');
    return balance;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[COINS] Failed to rollback transaction:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export interface LeaderboardEntry {
  user_id: string;
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
}

/**
 * Get the leaderboard of users sorted by coin balance
 * @param limit Maximum number of users to return
 * @returns Array of leaderboard entries
 */
export async function getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT user_id, coin_balance as balance, lifetime_coins_earned as lifetime_earned, lifetime_coins_spent as lifetime_spent 
       FROM users 
       WHERE coin_balance > 0 
       ORDER BY coin_balance DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows.map(row => ({
      user_id: row.user_id,
      balance: parseBigInt(row.balance),
      lifetime_earned: parseBigInt(row.lifetime_earned),
      lifetime_spent: parseBigInt(row.lifetime_spent)
    }));
  } finally {
    client.release();
  }
}
