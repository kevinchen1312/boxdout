-- Fix espn_players table unique constraint (if table was created with old migration)
-- Remove the single-column UNIQUE on espn_player_id to allow same player ID on different teams
-- Keep only the composite UNIQUE(espn_player_id, espn_team_id) constraint

-- Only run this if the table exists and has the old constraint
DO $$
BEGIN
  -- Check if table exists
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'espn_players') THEN
    -- Drop the unique constraint on espn_player_id alone if it exists
    ALTER TABLE espn_players 
      DROP CONSTRAINT IF EXISTS espn_players_espn_player_id_key;
    
    -- Add comment to the composite constraint if it exists
    IF EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'espn_players_espn_player_id_espn_team_id_key'
    ) THEN
      COMMENT ON CONSTRAINT espn_players_espn_player_id_espn_team_id_key ON espn_players IS 
        'Ensures unique player per team, allowing same player ID on different teams';
    END IF;
  END IF;
END $$;

