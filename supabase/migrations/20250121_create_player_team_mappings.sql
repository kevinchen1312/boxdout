-- Create player_team_mappings table for storing player-to-team relationships
-- This enables instant lookup of which team a player is on when searching

CREATE TABLE IF NOT EXISTS public.player_team_mappings (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  team_name TEXT NOT NULL,
  league_id INTEGER,
  league_name TEXT,
  season INTEGER NOT NULL,
  position TEXT,
  jersey_number TEXT,
  country TEXT,
  age INTEGER,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_player_season UNIQUE(player_id, season)
);

-- Add indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_player_name ON public.player_team_mappings(player_name);
CREATE INDEX IF NOT EXISTS idx_player_id ON public.player_team_mappings(player_id);
CREATE INDEX IF NOT EXISTS idx_team_id ON public.player_team_mappings(team_id);
CREATE INDEX IF NOT EXISTS idx_season ON public.player_team_mappings(season);
CREATE INDEX IF NOT EXISTS idx_league_id ON public.player_team_mappings(league_id);

-- Add index for case-insensitive player name search
CREATE INDEX IF NOT EXISTS idx_player_name_lower ON public.player_team_mappings(LOWER(player_name));

-- Enable Row Level Security
ALTER TABLE public.player_team_mappings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access (player data is public)
CREATE POLICY "Allow public read access" ON public.player_team_mappings
  FOR SELECT USING (true);

-- Create policy to allow service role to insert/update (scanner script)
CREATE POLICY "Allow service role to insert/update" ON public.player_team_mappings
  FOR ALL USING (auth.role() = 'service_role');

-- Comment on table
COMMENT ON TABLE public.player_team_mappings IS 'Stores player-to-team mappings from API Basketball for instant player lookups';
COMMENT ON COLUMN public.player_team_mappings.player_id IS 'API Basketball player ID';
COMMENT ON COLUMN public.player_team_mappings.team_id IS 'API Basketball team ID';
COMMENT ON COLUMN public.player_team_mappings.season IS 'Season year (e.g., 2025 for 2025-2026 season)';
COMMENT ON COLUMN public.player_team_mappings.jersey_number IS 'Player jersey number on current team';




