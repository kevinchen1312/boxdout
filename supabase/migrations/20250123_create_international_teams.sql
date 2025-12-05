-- Create international_teams table
-- Stores all international basketball teams from API-Basketball

CREATE TABLE IF NOT EXISTS international_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_team_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  logo_url TEXT,
  country TEXT,
  league_id INTEGER NOT NULL,
  league_name TEXT,
  season_format TEXT CHECK (season_format IN ('YYYY', 'YYYY-YYYY')),
  last_synced TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX idx_international_teams_api_team_id ON international_teams(api_team_id);
CREATE INDEX idx_international_teams_league_id ON international_teams(league_id);
CREATE INDEX idx_international_teams_country ON international_teams(country);
CREATE INDEX idx_international_teams_name ON international_teams(name);

-- Add RLS policies
ALTER TABLE international_teams ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "International teams are viewable by everyone"
  ON international_teams FOR SELECT
  USING (true);

-- Allow service role to manage teams
CREATE POLICY "Service role can manage international teams"
  ON international_teams FOR ALL
  USING (auth.role() = 'service_role');

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_international_teams_updated_at
  BEFORE UPDATE ON international_teams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE international_teams IS 'International basketball teams from API-Basketball, synced daily';




