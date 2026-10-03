-- Bob Kun Talent Agency minigame schema (tables prefixed pa_). Idempotent.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS pa_tiers (
  tier_key      TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  sort_order    INTEGER NOT NULL,
  scout_weight  INTEGER NOT NULL CHECK (scout_weight >= 0),
  recruit_price BIGINT NOT NULL CHECK (recruit_price >= 0),
  base_payout   BIGINT NOT NULL CHECK (base_payout >= 0),
  care_price    BIGINT NOT NULL CHECK (care_price >= 0),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pa_characters (
  slug          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  tier_key      TEXT NOT NULL REFERENCES pa_tiers(tier_key),
  kind          TEXT NOT NULL CHECK (kind IN ('male','female','object','dog','cat')),
  blurb         TEXT NOT NULL DEFAULT '',
  image_file    TEXT NOT NULL,
  recruit_price BIGINT NOT NULL CHECK (recruit_price >= 0),
  base_payout   BIGINT NOT NULL CHECK (base_payout >= 0),
  stamina_cost  INTEGER NOT NULL DEFAULT 10 CHECK (stamina_cost > 0 AND stamina_cost <= 100),
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pa_players (
  user_id       TEXT PRIMARY KEY,
  last_scout_at TIMESTAMP WITH TIME ZONE,
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pa_discovered (
  user_id        TEXT NOT NULL,
  character_slug TEXT NOT NULL REFERENCES pa_characters(slug),
  discovered_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, character_slug)
);

CREATE TABLE IF NOT EXISTS pa_roster (
  id                 SERIAL PRIMARY KEY,
  user_id            TEXT NOT NULL,
  character_slug     TEXT NOT NULL REFERENCES pa_characters(slug),
  level              INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 10),
  stamina            INTEGER NOT NULL DEFAULT 100 CHECK (stamina >= 0 AND stamina <= 100),
  stamina_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status             TEXT NOT NULL DEFAULT 'resting' CHECK (status IN ('resting','working')),
  work_started_at    TIMESTAMP WITH TIME ZONE,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, character_slug)
);

CREATE INDEX IF NOT EXISTS idx_pa_roster_user_status ON pa_roster(user_id, status);

DROP TRIGGER IF EXISTS update_pa_tiers_updated_at ON pa_tiers;
CREATE TRIGGER update_pa_tiers_updated_at BEFORE UPDATE ON pa_tiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pa_characters_updated_at ON pa_characters;
CREATE TRIGGER update_pa_characters_updated_at BEFORE UPDATE ON pa_characters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pa_players_updated_at ON pa_players;
CREATE TRIGGER update_pa_players_updated_at BEFORE UPDATE ON pa_players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pa_roster_updated_at ON pa_roster;
CREATE TRIGGER update_pa_roster_updated_at BEFORE UPDATE ON pa_roster
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
