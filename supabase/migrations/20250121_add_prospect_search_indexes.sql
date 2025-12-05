-- Add indexes for fast prospect searching
-- This enables quick search by name, position, and team

-- Index for name searching (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_prospects_full_name_lower 
ON prospects (LOWER(full_name));

-- Index for team searching
CREATE INDEX IF NOT EXISTS idx_prospects_team_name_lower 
ON prospects (LOWER(team_name));

-- Index for position searching  
CREATE INDEX IF NOT EXISTS idx_prospects_position 
ON prospects (position);

-- Index for source filtering (espn vs international)
CREATE INDEX IF NOT EXISTS idx_prospects_source 
ON prospects (source);

-- Index for ESPN ID lookups
CREATE INDEX IF NOT EXISTS idx_prospects_espn_id 
ON prospects (espn_id) WHERE espn_id IS NOT NULL;

-- Composite index for common queries (source + name)
CREATE INDEX IF NOT EXISTS idx_prospects_source_name 
ON prospects (source, LOWER(full_name));

COMMENT ON INDEX idx_prospects_full_name_lower IS 'Fast case-insensitive name search';
COMMENT ON INDEX idx_prospects_team_name_lower IS 'Fast case-insensitive team search';
COMMENT ON INDEX idx_prospects_position IS 'Filter by position';
COMMENT ON INDEX idx_prospects_source IS 'Filter by data source (espn/international)';
COMMENT ON INDEX idx_prospects_espn_id IS 'Quick ESPN ID lookups';
COMMENT ON INDEX idx_prospects_source_name IS 'Optimized for source-filtered name searches';




