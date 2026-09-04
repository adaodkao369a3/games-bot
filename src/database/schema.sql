-- Bombo Coins Database Schema
-- This schema replaces the old Residuals system with a clean Bombo Coins implementation

-- Users table for Bombo Coins
CREATE TABLE IF NOT EXISTS users (
  user_id VARCHAR(255) PRIMARY KEY,
  coin_balance BIGINT NOT NULL DEFAULT 0,
  lifetime_coins_earned BIGINT NOT NULL DEFAULT 0,
  lifetime_coins_spent BIGINT NOT NULL DEFAULT 0,
  lifetime_gambled BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups (create if not exists by checking first)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_coin_balance') THEN
        CREATE INDEX idx_users_coin_balance ON users(coin_balance);
    END IF;
END
$$;

-- Coin transactions table for audit trail
CREATE TABLE IF NOT EXISTS coin_transactions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  amount BIGINT NOT NULL,
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  source VARCHAR(100) NOT NULL,
  reason TEXT,
  description TEXT,
  game_instance_id VARCHAR(255) UNIQUE, -- Unique identifier for game instance to prevent duplicate rewards
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_coin_transactions_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Index for transaction queries (create if not exists by checking first)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_coin_transactions_user_id') THEN
        CREATE INDEX idx_coin_transactions_user_id ON coin_transactions(user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_coin_transactions_created_at') THEN
        CREATE INDEX idx_coin_transactions_created_at ON coin_transactions(created_at DESC);
    END IF;
END
$$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
