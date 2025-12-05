-- Migration: Create prospects, user_rankings, and prospect_schedule_imports tables
-- Run this in your Supabase SQL Editor or via psql

-- Prospects table (shared across users, stores ESPN/external data)
CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  espn_id TEXT,
  full_name TEXT NOT NULL,
  position TEXT,
  team_name TEXT,
  team_id TEXT,
  league TEXT,
  source TEXT NOT NULL DEFAULT 'internal',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(espn_id)
);

-- Add team_id column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'prospects' AND column_name = 'team_id'
  ) THEN
    ALTER TABLE prospects ADD COLUMN team_id TEXT;
  END IF;
END $$;

-- User rankings table (links users to prospects with ranks)
CREATE TABLE IF NOT EXISTS user_rankings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'my_board',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, prospect_id)
);

-- Prospect schedule imports table (tracks background schedule imports)
CREATE TABLE IF NOT EXISTS prospect_schedule_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'done', 'error')) DEFAULT 'pending',
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_prospects_espn_id ON prospects(espn_id);
CREATE INDEX IF NOT EXISTS idx_prospects_full_name ON prospects(full_name);
CREATE INDEX IF NOT EXISTS idx_user_rankings_user_id ON user_rankings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_rankings_prospect_id ON user_rankings(prospect_id);
CREATE INDEX IF NOT EXISTS idx_user_rankings_rank ON user_rankings(user_id, rank);
CREATE INDEX IF NOT EXISTS idx_prospect_schedule_imports_prospect_id ON prospect_schedule_imports(prospect_id);
CREATE INDEX IF NOT EXISTS idx_prospect_schedule_imports_status ON prospect_schedule_imports(status);

-- Enable Row Level Security for new tables
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_schedule_imports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for prospects table (public read, authenticated can insert)
DROP POLICY IF EXISTS "Anyone can view prospects" ON prospects;
CREATE POLICY "Anyone can view prospects" ON prospects
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can insert prospects" ON prospects;
CREATE POLICY "Authenticated can insert prospects" ON prospects
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for user_rankings table
DROP POLICY IF EXISTS "Users can view own rankings" ON user_rankings;
CREATE POLICY "Users can view own rankings" ON user_rankings
  FOR SELECT USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

DROP POLICY IF EXISTS "Users can insert own rankings" ON user_rankings;
CREATE POLICY "Users can insert own rankings" ON user_rankings
  FOR INSERT WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

DROP POLICY IF EXISTS "Users can update own rankings" ON user_rankings;
CREATE POLICY "Users can update own rankings" ON user_rankings
  FOR UPDATE USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

DROP POLICY IF EXISTS "Users can delete own rankings" ON user_rankings;
CREATE POLICY "Users can delete own rankings" ON user_rankings
  FOR DELETE USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

-- RLS Policies for prospect_schedule_imports table
DROP POLICY IF EXISTS "Users can view schedule imports for their prospects" ON prospect_schedule_imports;
CREATE POLICY "Users can view schedule imports for their prospects" ON prospect_schedule_imports
  FOR SELECT USING (
    prospect_id IN (
      SELECT prospect_id FROM user_rankings WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can insert schedule imports for their prospects" ON prospect_schedule_imports;
CREATE POLICY "Users can insert schedule imports for their prospects" ON prospect_schedule_imports
  FOR INSERT WITH CHECK (
    prospect_id IN (
      SELECT prospect_id FROM user_rankings WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

-- Function to update updated_at timestamp (if not already exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on prospect_schedule_imports
DROP TRIGGER IF EXISTS update_prospect_schedule_imports_updated_at ON prospect_schedule_imports;
CREATE TRIGGER update_prospect_schedule_imports_updated_at BEFORE UPDATE ON prospect_schedule_imports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Prospect games table (stores games for imported/watchlist prospects)
CREATE TABLE IF NOT EXISTS prospect_games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  date TEXT NOT NULL,
  date_key TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  tipoff TEXT,
  tv TEXT,
  venue TEXT,
  location_type TEXT CHECK (location_type IN ('home', 'away', 'neutral')),
  source TEXT DEFAULT 'espn',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(prospect_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_prospect_games_prospect_id ON prospect_games(prospect_id);
CREATE INDEX IF NOT EXISTS idx_prospect_games_date_key ON prospect_games(date_key);
CREATE INDEX IF NOT EXISTS idx_prospect_games_game_id ON prospect_games(game_id);

-- Enable Row Level Security for prospect_games table
ALTER TABLE prospect_games ENABLE ROW LEVEL SECURITY;

-- RLS Policies for prospect_games table
DROP POLICY IF EXISTS "Users can view games for their watchlist prospects" ON prospect_games;
CREATE POLICY "Users can view games for their watchlist prospects" ON prospect_games
  FOR SELECT USING (
    prospect_id IN (
      SELECT prospect_id FROM user_rankings WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can insert games for their watchlist prospects" ON prospect_games;
CREATE POLICY "Users can insert games for their watchlist prospects" ON prospect_games
  FOR INSERT WITH CHECK (
    prospect_id IN (
      SELECT prospect_id FROM user_rankings WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can update games for their watchlist prospects" ON prospect_games;
CREATE POLICY "Users can update games for their watchlist prospects" ON prospect_games
  FOR UPDATE USING (
    prospect_id IN (
      SELECT prospect_id FROM user_rankings WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can delete games for their watchlist prospects" ON prospect_games;
CREATE POLICY "Users can delete games for their watchlist prospects" ON prospect_games
  FOR DELETE USING (
    prospect_id IN (
      SELECT prospect_id FROM user_rankings WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

-- Trigger to auto-update updated_at on prospect_games
DROP TRIGGER IF EXISTS update_prospect_games_updated_at ON prospect_games;
CREATE TRIGGER update_prospect_games_updated_at BEFORE UPDATE ON prospect_games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

