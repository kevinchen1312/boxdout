import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client for browser usage
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client with service role (for admin operations)
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Database types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          clerk_user_id: string;
          username: string | null;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          username?: string | null;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          clerk_user_id?: string;
          username?: string | null;
          email?: string;
          created_at?: string;
        };
      };
      watched_games: {
        Row: {
          id: string;
          user_id: string;
          game_id: string;
          watched_at: string;
          game_date: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          game_id: string;
          watched_at?: string;
          game_date: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          game_id?: string;
          watched_at?: string;
          game_date?: string;
        };
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          game_id: string;
          content: string;
          visibility: 'self' | 'friends' | 'group' | 'public';
          group_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          game_id: string;
          content: string;
          visibility?: 'self' | 'friends' | 'group' | 'public';
          group_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          game_id?: string;
          content?: string;
          visibility?: 'self' | 'friends' | 'group' | 'public';
          group_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      friend_requests: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          status: 'pending' | 'accepted' | 'rejected';
          created_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          status?: 'pending' | 'accepted' | 'rejected';
          created_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          status?: 'pending' | 'accepted' | 'rejected';
          created_at?: string;
        };
      };
      friends: {
        Row: {
          id: string;
          user1_id: string;
          user2_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user1_id: string;
          user2_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user1_id?: string;
          user2_id?: string;
          created_at?: string;
        };
      };
      groups: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          created_at?: string;
        };
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          joined_at?: string;
        };
      };
    };
  };
}

