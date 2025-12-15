-- Create custom_players table
-- Stores user-created custom players for their draft board

CREATE TABLE IF NOT EXISTS custom_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  team TEXT NOT NULL,
  rank INTEGER NOT NULL,
  height TEXT,
  class TEXT,
  jersey TEXT,
  team_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique rank per user
  UNIQUE(user_id, rank)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_custom_players_user_id ON custom_players(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_players_rank ON custom_players(user_id, rank);

-- Add RLS policies
ALTER TABLE custom_players ENABLE ROW LEVEL SECURITY;

-- Users can only see their own custom players
CREATE POLICY "Users can view their own custom players"
  ON custom_players FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own custom players
CREATE POLICY "Users can insert their own custom players"
  ON custom_players FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own custom players
CREATE POLICY "Users can update their own custom players"
  ON custom_players FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own custom players
CREATE POLICY "Users can delete their own custom players"
  ON custom_players FOR DELETE
  USING (auth.uid() = user_id);

-- Allow service role to manage all custom players
CREATE POLICY "Service role can manage all custom players"
  ON custom_players FOR ALL
  USING (auth.role() = 'service_role');

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_custom_players_updated_at
  BEFORE UPDATE ON custom_players
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE custom_players IS 'User-created custom players for their draft board';


