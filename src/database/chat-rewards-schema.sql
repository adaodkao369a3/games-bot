-- Chat Rewards Tracking Table
-- Tracks user message progress and cooldowns for chat-based coin rewards

CREATE TABLE IF NOT EXISTS chat_rewards_tracking (
  user_id VARCHAR(255) PRIMARY KEY,
  guild_id VARCHAR(255) NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_reward_at TIMESTAMP WITH TIME ZONE,
  cooldown_until TIMESTAMP WITH TIME ZONE,
  last_message_content TEXT,
  consecutive_duplicate_count INTEGER NOT NULL DEFAULT 0,
  total_rewards_earned BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for guild-based queries
CREATE INDEX IF NOT EXISTS idx_chat_rewards_guild_id ON chat_rewards_tracking(guild_id);

-- Index for cooldown cleanup
CREATE INDEX IF NOT EXISTS idx_chat_rewards_cooldown_until ON chat_rewards_tracking(cooldown_until);

-- Trigger for updated_at
CREATE TRIGGER update_chat_rewards_updated_at
  BEFORE UPDATE ON chat_rewards_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
