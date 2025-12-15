-- Add espn_team_id column to prospects table
-- This links NCAA and NBL prospects to their ESPN team IDs for fast schedule loading

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS espn_team_id TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_prospects_espn_team_id ON prospects(espn_team_id);

-- Add comment
COMMENT ON COLUMN prospects.espn_team_id IS 'ESPN team ID for NCAA and NBL prospects, used to query ncaa_team_schedules and nbl_team_schedules tables';


