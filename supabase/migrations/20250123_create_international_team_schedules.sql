-- Create international_team_schedules table
-- Stores game schedules for each international team

CREATE TABLE IF NOT EXISTS international_team_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES international_teams(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  date_key TEXT NOT NULL,
  home_team_id INTEGER NOT NULL,
  away_team_id INTEGER NOT NULL,
  home_team_name TEXT NOT NULL,
  away_team_name TEXT NOT NULL,
  home_team_logo TEXT,
  away_team_logo TEXT,
  location_type TEXT CHECK (location_type IN ('home', 'away', 'neutral')),
  venue TEXT,
  league_id INTEGER,
  season TEXT,
  status TEXT,
  home_score INTEGER,
  away_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique game per team
  UNIQUE(team_id, game_id)
);

-- Create indexes for faster queries
CREATE INDEX idx_international_schedules_team_id ON international_team_schedules(team_id);
CREATE INDEX idx_international_schedules_game_id ON international_team_schedules(game_id);
CREATE INDEX idx_international_schedules_date ON international_team_schedules(date);
CREATE INDEX idx_international_schedules_date_key ON international_team_schedules(date_key);
CREATE INDEX idx_international_schedules_league_id ON international_team_schedules(league_id);
CREATE INDEX idx_international_schedules_season ON international_team_schedules(season);
CREATE INDEX idx_international_schedules_status ON international_team_schedules(status);

-- Composite index for common queries
CREATE INDEX idx_international_schedules_team_date ON international_team_schedules(team_id, date);

-- Add RLS policies
ALTER TABLE international_team_schedules ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "International schedules are viewable by everyone"
  ON international_team_schedules FOR SELECT
  USING (true);

-- Allow service role to manage schedules
CREATE POLICY "Service role can manage international schedules"
  ON international_team_schedules FOR ALL
  USING (auth.role() = 'service_role');

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_international_schedules_updated_at
  BEFORE UPDATE ON international_team_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE international_team_schedules IS 'Game schedules for international teams, synced daily from API-Basketball';




