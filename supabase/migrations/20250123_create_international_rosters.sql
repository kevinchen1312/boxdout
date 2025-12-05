-- Create international_rosters table
-- Stores player rosters for each international team

CREATE TABLE IF NOT EXISTS international_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES international_teams(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  api_player_id INTEGER,
  position TEXT,
  number TEXT,
  season TEXT NOT NULL,
  last_synced TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique player per team per season
  UNIQUE(team_id, player_name, season)
);

-- Create indexes for faster queries
CREATE INDEX idx_international_rosters_team_id ON international_rosters(team_id);
CREATE INDEX idx_international_rosters_player_name ON international_rosters(player_name);
CREATE INDEX idx_international_rosters_api_player_id ON international_rosters(api_player_id);
CREATE INDEX idx_international_rosters_season ON international_rosters(season);

-- Enable pg_trgm extension for fuzzy text search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create full-text search index for player names
CREATE INDEX idx_international_rosters_player_name_trgm ON international_rosters USING gin(player_name gin_trgm_ops);

-- Add RLS policies
ALTER TABLE international_rosters ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "International rosters are viewable by everyone"
  ON international_rosters FOR SELECT
  USING (true);

-- Allow service role to manage rosters
CREATE POLICY "Service role can manage international rosters"
  ON international_rosters FOR ALL
  USING (auth.role() = 'service_role');

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_international_rosters_updated_at
  BEFORE UPDATE ON international_rosters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE international_rosters IS 'Player rosters for international teams, synced daily from API-Basketball';

