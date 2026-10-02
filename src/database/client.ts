import { Pool, PoolClient, type QueryResultRow } from 'pg';
import { config } from '../config/index.js';
import * as fs from 'fs';
import * as path from 'path';

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

      // Check if goon_edge_tracking table exists
      const goonEdgeCheck = await pool!.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = 'goon_edge_tracking'
        AND table_schema = 'public'
      `);

      if (goonEdgeCheck.rows.length === 0) {
        console.log('⚠ goon_edge_tracking table does not exist, creating...');

        await pool!.query(`
          CREATE TABLE goon_edge_tracking (
            user_id VARCHAR(255) PRIMARY KEY,
            last_goon_used TIMESTAMP WITH TIME ZONE,
            last_edge_used TIMESTAMP WITH TIME ZONE,
            edge_daily_count INTEGER NOT NULL DEFAULT 0,
            edge_daily_date DATE NOT NULL DEFAULT CURRENT_DATE,
            goon_count INTEGER NOT NULL DEFAULT 0,
            edge_blocked_until TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await pool!.query(`
          CREATE INDEX idx_goon_edge_tracking_daily_date ON goon_edge_tracking(edge_daily_date)
        `);

        await pool!.query(`
          CREATE TRIGGER update_goon_edge_tracking_updated_at
          BEFORE UPDATE ON goon_edge_tracking
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column()
        `);

        console.log('✓ Migration completed: goon_edge_tracking table created');
      } else {
        console.log('✓ goon_edge_tracking table exists');
      }

      // Check if fishing_loot table exists
      const fishingCheck = await pool!.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'fishing_loot' 
        AND table_schema = 'public'
      `);

      if (fishingCheck.rows.length === 0) {
        console.log('⚠ fishing_loot table does not exist, creating...');
        
        const fishingSchemaPath = path.join(process.cwd(), 'src', 'database', 'fishing-schema.sql');
        const fishingSchema = fs.readFileSync(fishingSchemaPath, 'utf-8');
        await pool!.query(fishingSchema);
        
        console.log('✓ fishing_loot table created');
      } else {
        console.log('✓ fishing_loot table exists');
      }

      // Check if title_ownership table exists
      const titleCheck = await pool!.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'title_ownership' 
        AND table_schema = 'public'
      `);

      if (titleCheck.rows.length === 0) {
        console.log('⚠ title_ownership table does not exist, creating...');
        
        await pool!.query(`
          CREATE TABLE IF NOT EXISTS title_ownership (
            category_id VARCHAR(255) PRIMARY KEY,
            holder_id VARCHAR(255),
            holder_name VARCHAR(255),
            acquired_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // Create index
        await pool!.query(`
          CREATE INDEX IF NOT EXISTS idx_title_ownership_holder_id ON title_ownership(holder_id)
        `);
        
        // Create trigger for updated_at
        await pool!.query(`
          CREATE TRIGGER update_title_ownership_updated_at
          BEFORE UPDATE ON title_ownership
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column()
        `);
        
        console.log('✓ title_ownership table created');
      } else {
        console.log('✓ title_ownership table exists');
      }

      // Check if quote_redirect_settings table exists
      const quoteRedirectCheck = await pool!.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'quote_redirect_settings' 
        AND table_schema = 'public'
      `);

      if (quoteRedirectCheck.rows.length === 0) {
        console.log('⚠ quote_redirect_settings table does not exist, creating...');
        
        await pool!.query(`
          CREATE TABLE IF NOT EXISTS quote_redirect_settings (
            guild_id VARCHAR(255) PRIMARY KEY,
            redirect_enabled BOOLEAN NOT NULL DEFAULT true,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // Create index
        await pool!.query(`
          CREATE INDEX IF NOT EXISTS idx_quote_redirect_settings_guild_id ON quote_redirect_settings(guild_id)
        `);
        
        // Create trigger for updated_at
        await pool!.query(`
          CREATE TRIGGER update_quote_redirect_settings_updated_at
          BEFORE UPDATE ON quote_redirect_settings
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column()
        `);
        
        console.log('✓ quote_redirect_settings table created');
      } else {
        console.log('✓ quote_redirect_settings table exists');
      }

      // Check if mog_profiles table exists
      const mogProfilesCheck = await pool!.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'mog_profiles' 
        AND table_schema = 'public'
      `);

      if (mogProfilesCheck.rows.length === 0) {
        console.log('⚠ mog_profiles table does not exist, creating...');

        await pool!.query(`
          CREATE TABLE IF NOT EXISTS mog_profiles (
            guild_id VARCHAR(255) NOT NULL,
            user_id VARCHAR(255) NOT NULL,
            rank VARCHAR(10) NOT NULL CHECK (rank IN ('D', 'C', 'B', 'A', 'S', 'SS')),
            stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            theme_color VARCHAR(7) NOT NULL,
            attributes JSONB NOT NULL DEFAULT '{}',
            analysis_attributes VARCHAR(10)[] NOT NULL DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (guild_id, user_id)
          )
        `);

        // Create index
        await pool!.query(`
          CREATE INDEX IF NOT EXISTS idx_mog_profiles_user_id ON mog_profiles(user_id)
        `);

        console.log('✓ mog_profiles table created');
      } else {
        console.log('✓ mog_profiles table exists');

        // Check if attributes column exists
        const attributesColumnCheck = await pool!.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'mog_profiles' 
          AND table_schema = 'public'
          AND column_name = 'attributes'
        `);

        if (attributesColumnCheck.rows.length === 0) {
          console.log('⚠ mog_profiles table missing attributes column, adding migration...');

          // Add attributes column
          await pool!.query(`
            ALTER TABLE mog_profiles 
            ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'
          `);

          // Add analysis_attributes column
          await pool!.query(`
            ALTER TABLE mog_profiles 
            ADD COLUMN IF NOT EXISTS analysis_attributes VARCHAR(10)[] NOT NULL DEFAULT '{}'
          `);

          console.log('✓ Migration completed: attributes and analysis_attributes columns added to mog_profiles');
        } else {
          console.log('✓ mog_profiles table has attributes column');
        }
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

export interface TitleOwnership {
  category_id: string;
  holder_id: string | null;
  holder_name: string | null;
  acquired_at: Date | null;
}

export interface QuoteRedirectSettings {
  guild_id: string;
  redirect_enabled: boolean;
}

export interface MogProfile {
  guild_id: string;
  user_id: string;
  rank: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';
  stars: number;
  title: string;
  description: string;
  theme_color: string;
  attributes: { [key: string]: number };
  analysis_attributes: string[];
  created_at: Date;
}

export interface MogLeaderboardEntry {
  user_id: string;
  rank: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';
  stars: number;
  title: string;
  description: string;
  theme_color: string;
  attributes: { [key: string]: number };
  analysis_attributes: string[];
  created_at: Date;
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

/**
 * Get title ownership for a specific category
 * @param categoryId The category ID
 * @returns Title ownership data or null if not found
 */
export async function getTitleOwnership(categoryId: string): Promise<TitleOwnership | null> {
  const client = await getClient();
  try {
    const result = await client.query(
      'SELECT category_id, holder_id, holder_name, acquired_at FROM title_ownership WHERE category_id = $1',
      [categoryId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      category_id: row.category_id,
      holder_id: row.holder_id,
      holder_name: row.holder_name,
      acquired_at: row.acquired_at
    };
  } finally {
    client.release();
  }
}

/**
 * Set title ownership for a category
 * @param categoryId The category ID
 * @param holderId The user ID of the holder (null to clear)
 * @param holderName The username of the holder (null to clear)
 * @returns True if successful
 */
export async function setTitleOwnership(
  categoryId: string,
  holderId: string | null,
  holderName: string | null
): Promise<boolean> {
  const client = await getClient();
  try {
    await client.query(
      `INSERT INTO title_ownership (category_id, holder_id, holder_name, acquired_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (category_id) 
       DO UPDATE SET 
         holder_id = EXCLUDED.holder_id,
         holder_name = EXCLUDED.holder_name,
         acquired_at = EXCLUDED.acquired_at,
         updated_at = CURRENT_TIMESTAMP`,
      [categoryId, holderId, holderName, holderId ? new Date() : null]
    );
    return true;
  } catch (error) {
    console.error('[TITLE_OWNERSHIP] Failed to set title ownership:', error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Get all title ownerships
 * @returns Map of category_id to TitleOwnership
 */
export async function getAllTitleOwnerships(): Promise<Map<string, TitleOwnership>> {
  const client = await getClient();
  try {
    const result = await client.query(
      'SELECT category_id, holder_id, holder_name, acquired_at FROM title_ownership'
    );

    const ownerships = new Map<string, TitleOwnership>();
    for (const row of result.rows) {
      ownerships.set(row.category_id, {
        category_id: row.category_id,
        holder_id: row.holder_id,
        holder_name: row.holder_name,
        acquired_at: row.acquired_at
      });
    }

    return ownerships;
  } finally {
    client.release();
  }
}

/**
 * Get quote redirect settings for a guild
 * @param guildId Discord guild ID
 * @returns Quote redirect settings (defaults to enabled if not found)
 */
export async function getQuoteRedirectSettings(guildId: string): Promise<QuoteRedirectSettings> {
  const client = await getClient();
  try {
    const result = await client.query(
      'SELECT guild_id, redirect_enabled FROM quote_redirect_settings WHERE guild_id = $1',
      [guildId]
    );

    if (result.rows.length === 0) {
      // Default to enabled if not found
      return {
        guild_id: guildId,
        redirect_enabled: true
      };
    }

    const row = result.rows[0];
    return {
      guild_id: row.guild_id,
      redirect_enabled: row.redirect_enabled
    };
  } finally {
    client.release();
  }
}

/**
 * Set quote redirect settings for a guild
 * @param guildId Discord guild ID
 * @param redirectEnabled Whether redirect is enabled
 * @returns True if successful
 */
export async function setQuoteRedirectSettings(guildId: string, redirectEnabled: boolean): Promise<boolean> {
  const client = await getClient();
  try {
    await client.query(
      `INSERT INTO quote_redirect_settings (guild_id, redirect_enabled)
       VALUES ($1, $2)
       ON CONFLICT (guild_id) 
       DO UPDATE SET 
         redirect_enabled = EXCLUDED.redirect_enabled,
         updated_at = CURRENT_TIMESTAMP`,
      [guildId, redirectEnabled]
    );
    return true;
  } catch (error) {
    console.error('[QUOTE_REDIRECT] Failed to set quote redirect settings:', error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Get MOG profile for a user in a guild
 * @param guildId Discord guild ID
 * @param userId Discord user ID
 * @returns MOG profile or null if not found
 */
export async function getMogProfile(guildId: string, userId: string): Promise<MogProfile | null> {
  const client = await getClient();
  try {
    const result = await client.query(
      'SELECT guild_id, user_id, rank, stars, title, description, theme_color, attributes, analysis_attributes, created_at FROM mog_profiles WHERE guild_id = $1 AND user_id = $2',
      [guildId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      guild_id: row.guild_id,
      user_id: row.user_id,
      rank: row.rank as 'D' | 'C' | 'B' | 'A' | 'S' | 'SS',
      stars: row.stars,
      title: row.title,
      description: row.description,
      theme_color: row.theme_color,
      attributes: row.attributes || {},
      analysis_attributes: row.analysis_attributes || [],
      created_at: row.created_at
    };
  } finally {
    client.release();
  }
}

/**
 * Create MOG profile for a user in a guild (atomic operation)
 * Uses INSERT with ON CONFLICT to handle race conditions
 * @param guildId Discord guild ID
 * @param userId Discord user ID
 * @param rank Rank (D, C, B, A, S, SS)
 * @param stars Star rating (1-5)
 * @param title Randomized title
 * @param description Randomized description
 * @param themeColor Random theme color
 * @param attributes Object with attribute values
 * @param analysisAttributes Array of 3 selected attribute names for analysis
 * @returns Created MOG profile or existing profile if already exists
 */
export async function createMogProfile(
  guildId: string,
  userId: string,
  rank: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS',
  stars: number,
  title: string,
  description: string,
  themeColor: string,
  attributes: { [key: string]: number },
  analysisAttributes: string[]
): Promise<MogProfile> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Try to insert new profile with ON CONFLICT to handle race conditions
    const result = await client.query(
      `INSERT INTO mog_profiles (guild_id, user_id, rank, stars, title, description, theme_color, attributes, analysis_attributes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (guild_id, user_id)
       DO NOTHING
       RETURNING guild_id, user_id, rank, stars, title, description, theme_color, attributes, analysis_attributes, created_at`,
      [guildId, userId, rank, stars, title, description, themeColor, JSON.stringify(attributes), analysisAttributes]
    );

    if (result.rows.length > 0) {
      // Successfully created new profile
      await client.query('COMMIT');
      const row = result.rows[0];
      return {
        guild_id: row.guild_id,
        user_id: row.user_id,
        rank: row.rank as 'D' | 'C' | 'B' | 'A' | 'S' | 'SS',
        stars: row.stars,
        title: row.title,
        description: row.description,
        theme_color: row.theme_color,
        attributes: row.attributes || {},
        analysis_attributes: row.analysis_attributes || [],
        created_at: row.created_at
      };
    } else {
      // Profile already exists (race condition), fetch it
      const existingResult = await client.query(
        'SELECT guild_id, user_id, rank, stars, title, description, theme_color, attributes, analysis_attributes, created_at FROM mog_profiles WHERE guild_id = $1 AND user_id = $2',
        [guildId, userId]
      );

      await client.query('COMMIT');
      const row = existingResult.rows[0];
      return {
        guild_id: row.guild_id,
        user_id: row.user_id,
        rank: row.rank as 'D' | 'C' | 'B' | 'A' | 'S' | 'SS',
        stars: row.stars,
        title: row.title,
        description: row.description,
        theme_color: row.theme_color,
        attributes: row.attributes || {},
        analysis_attributes: row.analysis_attributes || [],
        created_at: row.created_at
      };
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[MOG_PROFILES] Failed to rollback transaction:', rollbackError);
    }
    console.error('[MOG_PROFILES] Failed to create MOG profile:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update MOG profile for a user in a guild
 * @param guildId Discord guild ID
 * @param userId Discord user ID
 * @param rank Rank (D, C, B, A, S, SS)
 * @param stars Star rating (1-5)
 * @param title Randomized title
 * @param description Randomized description
 * @param themeColor Random theme color
 * @param attributes Object with attribute values
 * @param analysisAttributes Array of 3 selected attribute names for analysis
 * @returns Updated MOG profile
 */
export async function updateMogProfile(
  guildId: string,
  userId: string,
  rank: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS',
  stars: number,
  title: string,
  description: string,
  themeColor: string,
  attributes: { [key: string]: number },
  analysisAttributes: string[]
): Promise<MogProfile> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE mog_profiles
       SET rank = $3, stars = $4, title = $5, description = $6, theme_color = $7, attributes = $8, analysis_attributes = $9
       WHERE guild_id = $1 AND user_id = $2
       RETURNING guild_id, user_id, rank, stars, title, description, theme_color, attributes, analysis_attributes, created_at`,
      [guildId, userId, rank, stars, title, description, themeColor, JSON.stringify(attributes), analysisAttributes]
    );

    await client.query('COMMIT');
    const row = result.rows[0];
    return {
      guild_id: row.guild_id,
      user_id: row.user_id,
      rank: row.rank as 'D' | 'C' | 'B' | 'A' | 'S' | 'SS',
      stars: row.stars,
      title: row.title,
      description: row.description,
      theme_color: row.theme_color,
      attributes: row.attributes || {},
      analysis_attributes: row.analysis_attributes || [],
      created_at: row.created_at
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[MOG_PROFILES] Failed to rollback transaction:', rollbackError);
    }
    console.error('[MOG_PROFILES] Failed to update MOG profile:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all MOG profiles for a guild (for leaderboard sorting)
 * @param guildId Discord guild ID
 * @returns Array of all MOG profiles for the guild
 */
export async function getAllMogProfilesForGuild(guildId: string): Promise<MogLeaderboardEntry[]> {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT user_id, rank, stars, title, description, theme_color, attributes, analysis_attributes, created_at
       FROM mog_profiles
       WHERE guild_id = $1
       ORDER BY user_id ASC`,
      [guildId]
    );

    return result.rows.map(row => ({
      user_id: row.user_id,
      rank: row.rank as 'D' | 'C' | 'B' | 'A' | 'S' | 'SS',
      stars: row.stars,
      title: row.title,
      description: row.description,
      theme_color: row.theme_color,
      attributes: row.attributes || {},
      analysis_attributes: row.analysis_attributes || [],
      created_at: row.created_at
    }));
  } catch (error) {
    console.error('[MOG_PROFILES] Failed to get all MOG profiles for guild:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get paginated MOG leaderboard for a guild
 * @param guildId Discord guild ID
 * @param limit Maximum number of entries to return
 * @param offset Number of entries to skip (for pagination)
 * @returns Array of MOG leaderboard entries
 */
export async function getMogLeaderboard(guildId: string, limit: number = 10, offset: number = 0): Promise<MogLeaderboardEntry[]> {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT user_id, rank, stars, title, description, theme_color, attributes, analysis_attributes, created_at
       FROM mog_profiles
       WHERE guild_id = $1
       ORDER BY user_id ASC
       LIMIT $2 OFFSET $3`,
      [guildId, limit, offset]
    );

    return result.rows.map(row => ({
      user_id: row.user_id,
      rank: row.rank as 'D' | 'C' | 'B' | 'A' | 'S' | 'SS',
      stars: row.stars,
      title: row.title,
      description: row.description,
      theme_color: row.theme_color,
      attributes: row.attributes || {},
      analysis_attributes: row.analysis_attributes || [],
      created_at: row.created_at
    }));
  } catch (error) {
    console.error('[MOG_PROFILES] Failed to get MOG leaderboard:', error);
    throw error;
  } finally {
    client.release();
  }
}
