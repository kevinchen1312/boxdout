-- Create ncaa_team_schedules table
-- Stores game schedules for NCAA teams (fetched from ESPN API)

CREATE TABLE IF NOT EXISTS ncaa_team_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  espn_team_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  date_key TEXT NOT NULL,
  home_team_id TEXT NOT NULL,
  away_team_id TEXT NOT NULL,
  home_team_name TEXT NOT NULL,
  away_team_name TEXT NOT NULL,
  home_team_display_name TEXT NOT NULL,
  away_team_display_name TEXT NOT NULL,
  home_team_logo TEXT,
  away_team_logo TEXT,
  location_type TEXT CHECK (location_type IN ('home', 'away', 'neutral')),
  venue TEXT,
  venue_city TEXT,
  venue_state TEXT,
  season TEXT,
  status TEXT,
  status_detail TEXT,
  home_score TEXT,
  away_score TEXT,
  broadcasts TEXT[], -- Array of broadcast networks
  notes TEXT, -- Tournament/event notes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique game per team
  UNIQUE(espn_team_id, game_id)
);

-- Create indexes for faster queries
CREATE INDEX idx_ncaa_schedules_espn_team_id ON ncaa_team_schedules(espn_team_id);
CREATE INDEX idx_ncaa_schedules_game_id ON ncaa_team_schedules(game_id);
CREATE INDEX idx_ncaa_schedules_date ON ncaa_team_schedules(date);
CREATE INDEX idx_ncaa_schedules_date_key ON ncaa_team_schedules(date_key);
CREATE INDEX idx_ncaa_schedules_season ON ncaa_team_schedules(season);
CREATE INDEX idx_ncaa_schedules_status ON ncaa_team_schedules(status);

-- Composite index for common queries
CREATE INDEX idx_ncaa_schedules_team_date ON ncaa_team_schedules(espn_team_id, date);

-- Add RLS policies
ALTER TABLE ncaa_team_schedules ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "NCAA schedules are viewable by everyone"
  ON ncaa_team_schedules FOR SELECT
  USING (true);

-- Allow service role to manage schedules
CREATE POLICY "Service role can manage NCAA schedules"
  ON ncaa_team_schedules FOR ALL
  USING (auth.role() = 'service_role');

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_ncaa_schedules_updated_at
  BEFORE UPDATE ON ncaa_team_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE ncaa_team_schedules IS 'Game schedules for NCAA teams, synced from ESPN API';

-- Create nbl_team_schedules table
-- Stores game schedules for NBL teams (fetched from ESPN API)

CREATE TABLE IF NOT EXISTS nbl_team_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  espn_team_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  date_key TEXT NOT NULL,
  home_team_id TEXT NOT NULL,
  away_team_id TEXT NOT NULL,
  home_team_name TEXT NOT NULL,
  away_team_name TEXT NOT NULL,
  home_team_display_name TEXT NOT NULL,
  away_team_display_name TEXT NOT NULL,
  home_team_logo TEXT,
  away_team_logo TEXT,
  location_type TEXT CHECK (location_type IN ('home', 'away', 'neutral')),
  venue TEXT,
  venue_city TEXT,
  venue_state TEXT,
  season TEXT,
  status TEXT,
  status_detail TEXT,
  home_score TEXT,
  away_score TEXT,
  broadcasts TEXT[], -- Array of broadcast networks
  notes TEXT, -- Tournament/event notes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique game per team
  UNIQUE(espn_team_id, game_id)
);

-- Create indexes for faster queries
CREATE INDEX idx_nbl_schedules_espn_team_id ON nbl_team_schedules(espn_team_id);
CREATE INDEX idx_nbl_schedules_game_id ON nbl_team_schedules(game_id);
CREATE INDEX idx_nbl_schedules_date ON nbl_team_schedules(date);
CREATE INDEX idx_nbl_schedules_date_key ON nbl_team_schedules(date_key);
CREATE INDEX idx_nbl_schedules_season ON nbl_team_schedules(season);
CREATE INDEX idx_nbl_schedules_status ON nbl_team_schedules(status);

-- Composite index for common queries
CREATE INDEX idx_nbl_schedules_team_date ON nbl_team_schedules(espn_team_id, date);

-- Add RLS policies
ALTER TABLE nbl_team_schedules ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "NBL schedules are viewable by everyone"
  ON nbl_team_schedules FOR SELECT
  USING (true);

-- Allow service role to manage schedules
CREATE POLICY "Service role can manage NBL schedules"
  ON nbl_team_schedules FOR ALL
  USING (auth.role() = 'service_role');

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_nbl_schedules_updated_at
  BEFORE UPDATE ON nbl_team_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE nbl_team_schedules IS 'Game schedules for NBL teams, synced from ESPN API';


