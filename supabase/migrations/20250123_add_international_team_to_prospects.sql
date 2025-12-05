-- Add international_team_id column to prospects table
-- This links prospects to international teams for roster-based international players

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS international_team_id UUID REFERENCES international_teams(id) ON DELETE SET NULL;

-- Create index for faster joins
CREATE INDEX IF NOT EXISTS idx_prospects_international_team_id ON prospects(international_team_id);

-- Add comment
COMMENT ON COLUMN prospects.international_team_id IS 'Foreign key to international_teams table for roster-based international players';




