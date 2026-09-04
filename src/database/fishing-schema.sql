-- Fishing Loot Table Schema
-- This table stores all possible fishing catches with their properties

CREATE TABLE IF NOT EXISTS fishing_loot (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  emoji VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL, -- 'fish', 'trash', 'treasure', 'valuable', 'mystery'
  rarity VARCHAR(50) NOT NULL, -- 'common', 'uncommon', 'rare', 'epic', 'legendary'
  min_depth INTEGER NOT NULL DEFAULT 0,
  max_depth INTEGER, -- NULL for no max depth
  min_reward BIGINT NOT NULL DEFAULT 0,
  max_reward BIGINT NOT NULL DEFAULT 0,
  weight INTEGER NOT NULL DEFAULT 10, -- Higher weight = more likely
  reel_difficulty VARCHAR(50) NOT NULL DEFAULT 'normal', -- 'easy', 'normal', 'hard', 'extreme'
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster loot queries by depth
CREATE INDEX IF NOT EXISTS idx_fishing_loot_depth ON fishing_loot(min_depth, max_depth);
CREATE INDEX IF NOT EXISTS idx_fishing_loot_enabled ON fishing_loot(enabled);
CREATE INDEX IF NOT EXISTS idx_fishing_loot_category ON fishing_loot(category);

-- Function to update updated_at timestamp for fishing_loot
DROP TRIGGER IF EXISTS update_fishing_loot_updated_at ON fishing_loot;
CREATE TRIGGER update_fishing_loot_updated_at
  BEFORE UPDATE ON fishing_loot
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
