-- Fix date_key values in ncaa_team_schedules and nbl_team_schedules
-- ESPN dates are in ET timezone, but date_key was calculated using UTC
-- This migration recalculates date_key using ET timezone to match the actual game dates

-- Update ncaa_team_schedules
UPDATE ncaa_team_schedules
SET date_key = TO_CHAR(
  (date AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date,
  'YYYY-MM-DD'
)
WHERE date_key IS NOT NULL;

-- Update nbl_team_schedules
UPDATE nbl_team_schedules
SET date_key = TO_CHAR(
  (date AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date,
  'YYYY-MM-DD'
)
WHERE date_key IS NOT NULL;

-- Log the update
DO $$
DECLARE
  ncaa_count INTEGER;
  nbl_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO ncaa_count FROM ncaa_team_schedules WHERE date_key IS NOT NULL;
  SELECT COUNT(*) INTO nbl_count FROM nbl_team_schedules WHERE date_key IS NOT NULL;
  RAISE NOTICE 'Updated date_key for % NCAA games and % NBL games', ncaa_count, nbl_count;
END $$;


