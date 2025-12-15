-- Add team ID columns to prospect_games table to support logo lookup
-- This allows us to fetch high-quality logos from the team_logos cache

ALTER TABLE prospect_games
ADD COLUMN IF NOT EXISTS home_team_id INTEGER,
ADD COLUMN IF NOT EXISTS away_team_id INTEGER,
ADD COLUMN IF NOT EXISTS home_team_logo TEXT,
ADD COLUMN IF NOT EXISTS away_team_logo TEXT;

-- Add indexes for faster lookup by team IDs
CREATE INDEX IF NOT EXISTS idx_prospect_games_home_team_id ON prospect_games(home_team_id);
CREATE INDEX IF NOT EXISTS idx_prospect_games_away_team_id ON prospect_games(away_team_id);

-- Comment for documentation
COMMENT ON COLUMN prospect_games.home_team_id IS 'API-Basketball team ID for home team (for logo lookup)';
COMMENT ON COLUMN prospect_games.away_team_id IS 'API-Basketball team ID for away team (for logo lookup)';
COMMENT ON COLUMN prospect_games.home_team_logo IS 'Cached logo URL for home team';
COMMENT ON COLUMN prospect_games.away_team_logo IS 'Cached logo URL for away team';





