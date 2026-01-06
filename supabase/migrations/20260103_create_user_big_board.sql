-- Create user_big_board table
-- Stores user-specific big board rankings (their custom ordering of the top 100)

CREATE TABLE IF NOT EXISTS user_big_board (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prospect_name TEXT NOT NULL,
  prospect_position TEXT NOT NULL,
  prospect_team TEXT NOT NULL,
  rank INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Each user can only have one entry per prospect name
  UNIQUE(user_id, prospect_name)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_user_big_board_user_id ON user_big_board(user_id);
CREATE INDEX IF NOT EXISTS idx_user_big_board_rank ON user_big_board(user_id, rank);

-- Add RLS policies
ALTER TABLE user_big_board ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage all records (we use service role from API)
CREATE POLICY "Service role can manage all user big board entries"
  ON user_big_board FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_big_board_updated_at
  BEFORE UPDATE ON user_big_board
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE user_big_board IS 'User-specific big board rankings - their custom ordering of prospects';


