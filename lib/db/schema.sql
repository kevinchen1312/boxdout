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
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, game_id)
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

