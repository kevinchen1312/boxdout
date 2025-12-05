-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Watched games table
CREATE TABLE IF NOT EXISTS watched_games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  watched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  game_date TEXT NOT NULL,
  UNIQUE(user_id, game_id)
);

-- Friend requests table
CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(sender_id, receiver_id)
);

-- Friends table
CREATE TABLE IF NOT EXISTS friends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (user1_id < user2_id),
  UNIQUE(user1_id, user2_id)
);

-- Groups table (must be before notes because notes references it)
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Group members table
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- Notes table (after groups because it references groups)
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  content TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('self', 'friends', 'group', 'public')) DEFAULT 'self',
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_watched_games_user_id ON watched_games(user_id);
CREATE INDEX IF NOT EXISTS idx_watched_games_game_id ON watched_games(game_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_game_id ON notes(game_id);
CREATE INDEX IF NOT EXISTS idx_notes_visibility ON notes(visibility);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_id ON friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_id ON friend_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON friend_requests(status);
CREATE INDEX IF NOT EXISTS idx_friends_user1_id ON friends(user1_id);
CREATE INDEX IF NOT EXISTS idx_friends_user2_id ON friends(user2_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE watched_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view all profiles" ON users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid()::text = clerk_user_id);

-- RLS Policies for watched_games table
CREATE POLICY "Users can view own watched games" ON watched_games
  FOR SELECT USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can view friends' watched games" ON watched_games
  FOR SELECT USING (
    user_id IN (
      SELECT user2_id FROM friends WHERE user1_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
      UNION
      SELECT user1_id FROM friends WHERE user2_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Users can insert own watched games" ON watched_games
  FOR INSERT WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can delete own watched games" ON watched_games
  FOR DELETE USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

-- RLS Policies for notes table
CREATE POLICY "Users can view own notes" ON notes
  FOR SELECT USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can view public notes" ON notes
  FOR SELECT USING (visibility = 'public');

CREATE POLICY "Users can view friends' friend-visible notes" ON notes
  FOR SELECT USING (
    visibility = 'friends' AND user_id IN (
      SELECT user2_id FROM friends WHERE user1_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
      UNION
      SELECT user1_id FROM friends WHERE user2_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Users can view group notes if member" ON notes
  FOR SELECT USING (
    visibility = 'group' AND group_id IN (
      SELECT group_id FROM group_members WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Users can insert own notes" ON notes
  FOR INSERT WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can update own notes" ON notes
  FOR UPDATE USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can delete own notes" ON notes
  FOR DELETE USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

-- RLS Policies for friend_requests table
CREATE POLICY "Users can view own sent requests" ON friend_requests
  FOR SELECT USING (sender_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can view own received requests" ON friend_requests
  FOR SELECT USING (receiver_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can insert own requests" ON friend_requests
  FOR INSERT WITH CHECK (sender_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can update received requests" ON friend_requests
  FOR UPDATE USING (receiver_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can delete own sent requests" ON friend_requests
  FOR DELETE USING (sender_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

-- RLS Policies for friends table
CREATE POLICY "Users can view own friendships" ON friends
  FOR SELECT USING (
    user1_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text) OR
    user2_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
  );

CREATE POLICY "Users can delete own friendships" ON friends
  FOR DELETE USING (
    user1_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text) OR
    user2_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
  );

-- RLS Policies for groups table
CREATE POLICY "Users can view groups they own" ON groups
  FOR SELECT USING (owner_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can view groups they're members of" ON groups
  FOR SELECT USING (
    id IN (SELECT group_id FROM group_members WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text))
  );

CREATE POLICY "Users can insert own groups" ON groups
  FOR INSERT WITH CHECK (owner_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can update own groups" ON groups
  FOR UPDATE USING (owner_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can delete own groups" ON groups
  FOR DELETE USING (owner_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

-- RLS Policies for group_members table
CREATE POLICY "Users can view members of their groups" ON group_members
  FOR SELECT USING (
    group_id IN (
      SELECT id FROM groups WHERE owner_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
      UNION
      SELECT group_id FROM group_members WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Group owners can insert members" ON group_members
  FOR INSERT WITH CHECK (
    group_id IN (SELECT id FROM groups WHERE owner_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text))
  );

CREATE POLICY "Group owners can delete members" ON group_members
  FOR DELETE USING (
    group_id IN (SELECT id FROM groups WHERE owner_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text))
  );

CREATE POLICY "Users can leave groups" ON group_members
  FOR DELETE USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on notes
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Custom players table
CREATE TABLE IF NOT EXISTS custom_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  team TEXT NOT NULL,
  rank INTEGER NOT NULL,
  height TEXT,
  class TEXT,
  jersey TEXT,
  team_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Custom player games table
CREATE TABLE IF NOT EXISTS custom_player_games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  custom_player_id UUID NOT NULL REFERENCES custom_players(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  date DATE NOT NULL,
  date_key TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  tipoff TEXT,
  tv TEXT,
  venue TEXT,
  location_type TEXT CHECK (location_type IN ('home', 'away', 'neutral')),
  source TEXT NOT NULL DEFAULT 'espn',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(custom_player_id, game_id)
);

-- Create indexes for custom players tables
CREATE INDEX IF NOT EXISTS idx_custom_players_user_id ON custom_players(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_players_rank ON custom_players(user_id, rank);
CREATE INDEX IF NOT EXISTS idx_custom_player_games_custom_player_id ON custom_player_games(custom_player_id);
CREATE INDEX IF NOT EXISTS idx_custom_player_games_date_key ON custom_player_games(date_key);
CREATE INDEX IF NOT EXISTS idx_custom_player_games_game_id ON custom_player_games(game_id);

-- Enable Row Level Security for custom players tables
ALTER TABLE custom_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_player_games ENABLE ROW LEVEL SECURITY;

-- RLS Policies for custom_players table
CREATE POLICY "Users can view own custom players" ON custom_players
  FOR SELECT USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can insert own custom players" ON custom_players
  FOR INSERT WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can update own custom players" ON custom_players
  FOR UPDATE USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can delete own custom players" ON custom_players
  FOR DELETE USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

-- RLS Policies for custom_player_games table
CREATE POLICY "Users can view games for own custom players" ON custom_player_games
  FOR SELECT USING (
    custom_player_id IN (
      SELECT id FROM custom_players WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Users can insert games for own custom players" ON custom_player_games
  FOR INSERT WITH CHECK (
    custom_player_id IN (
      SELECT id FROM custom_players WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Users can update games for own custom players" ON custom_player_games
  FOR UPDATE USING (
    custom_player_id IN (
      SELECT id FROM custom_players WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Users can delete games for own custom players" ON custom_player_games
  FOR DELETE USING (
    custom_player_id IN (
      SELECT id FROM custom_players WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

-- Trigger to auto-update updated_at on custom_players
CREATE TRIGGER update_custom_players_updated_at BEFORE UPDATE ON custom_players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Prospects table (shared across users, stores ESPN/external data)
CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  espn_id TEXT,
  full_name TEXT NOT NULL,
  position TEXT,
  team_name TEXT,
  league TEXT,
  source TEXT NOT NULL DEFAULT 'internal',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(espn_id)
);

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

-- Create indexes for new tables
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
CREATE POLICY "Anyone can view prospects" ON prospects
  FOR SELECT USING (true);

CREATE POLICY "Authenticated can insert prospects" ON prospects
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for user_rankings table
CREATE POLICY "Users can view own rankings" ON user_rankings
  FOR SELECT USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can insert own rankings" ON user_rankings
  FOR INSERT WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can update own rankings" ON user_rankings
  FOR UPDATE USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

CREATE POLICY "Users can delete own rankings" ON user_rankings
  FOR DELETE USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text));

-- RLS Policies for prospect_schedule_imports table
CREATE POLICY "Users can view schedule imports for their prospects" ON prospect_schedule_imports
  FOR SELECT USING (
    prospect_id IN (
      SELECT prospect_id FROM user_rankings WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Users can insert schedule imports for their prospects" ON prospect_schedule_imports
  FOR INSERT WITH CHECK (
    prospect_id IN (
      SELECT prospect_id FROM user_rankings WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.uid()::text)
    )
  );

-- Trigger to auto-update updated_at on prospect_schedule_imports
CREATE TRIGGER update_prospect_schedule_imports_updated_at BEFORE UPDATE ON prospect_schedule_imports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

