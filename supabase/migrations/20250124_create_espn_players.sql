-- Create espn_players table
-- Stores all players from NCAA and NBL teams for instant search and import

CREATE TABLE IF NOT EXISTS espn_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  espn_player_id TEXT NOT NULL, -- Removed UNIQUE constraint - same player ID can exist on different teams
  espn_team_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  position TEXT,
  jersey_number TEXT,
  height TEXT,
  weight TEXT,
  class TEXT, -- e.g., "FR", "SO", "JR", "SR" for NCAA
  league TEXT NOT NULL CHECK (league IN ('ncaa', 'nbl')),
  headshot_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique player per team (a player can be on multiple teams if they transfer)
  -- This composite unique constraint allows the same ESPN player ID on different teams
  UNIQUE(espn_player_id, espn_team_id)
);

-- Create indexes for faster queries
CREATE INDEX idx_espn_players_espn_team_id ON espn_players(espn_team_id);
CREATE INDEX idx_espn_players_espn_player_id ON espn_players(espn_player_id);
CREATE INDEX idx_espn_players_full_name ON espn_players(full_name);
CREATE INDEX idx_espn_players_league ON espn_players(league);

-- Full text search index for player names
CREATE INDEX idx_espn_players_name_search ON espn_players USING gin(to_tsvector('english', full_name));

-- Composite index for common queries
CREATE INDEX idx_espn_players_team_league ON espn_players(espn_team_id, league);

-- Add RLS policies
ALTER TABLE espn_players ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "ESPN players are viewable by everyone"
  ON espn_players FOR SELECT
  USING (true);

-- Allow service role to manage players
CREATE POLICY "Service role can manage ESPN players"
  ON espn_players FOR ALL
  USING (auth.role() = 'service_role');

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_espn_players_updated_at
  BEFORE UPDATE ON espn_players
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE espn_players IS 'All players from NCAA and NBL teams, synced from ESPN API for instant search and import';

