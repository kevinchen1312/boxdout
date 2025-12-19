import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy initialization to avoid errors during build when env vars aren't available
let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
  }
  return url;
}

function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured');
  }
  return key;
}

// Client for browser usage (lazy initialization)
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_supabase) {
      _supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
    }
    return (_supabase as any)[prop];
  },
});

// Server-side client with service role (for admin operations) - lazy initialization
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_supabaseAdmin) {
      const url = getSupabaseUrl();
      const anonKey = getSupabaseAnonKey();
      _supabaseAdmin = createClient(
        url,
        process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );
    }
    return (_supabaseAdmin as any)[prop];
  },
});

// Helper function to get Supabase user ID from Clerk user ID
export async function getSupabaseUserId(clerkUserId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('clerk_user_id', clerkUserId)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data.id;
}

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
      custom_players: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          position: string;
          team: string;
          rank: number;
          height: string | null;
          class: string | null;
          jersey: string | null;
          team_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          position: string;
          team: string;
          rank: number;
          height?: string | null;
          class?: string | null;
          jersey?: string | null;
          team_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          position?: string;
          team?: string;
          rank?: number;
          height?: string | null;
          class?: string | null;
          jersey?: string | null;
          team_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      custom_player_games: {
        Row: {
          id: string;
          custom_player_id: string;
          game_id: string;
          date: string;
          date_key: string;
          home_team: string;
          away_team: string;
          tipoff: string | null;
          tv: string | null;
          venue: string | null;
          location_type: 'home' | 'away' | 'neutral' | null;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          custom_player_id: string;
          game_id: string;
          date: string;
          date_key: string;
          home_team: string;
          away_team: string;
          tipoff?: string | null;
          tv?: string | null;
          venue?: string | null;
          location_type?: 'home' | 'away' | 'neutral' | null;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          custom_player_id?: string;
          game_id?: string;
          date?: string;
          date_key?: string;
          home_team?: string;
          away_team?: string;
          tipoff?: string | null;
          tv?: string | null;
          venue?: string | null;
          location_type?: 'home' | 'away' | 'neutral' | null;
          source?: string;
          created_at?: string;
        };
      };
      prospects: {
        Row: {
          id: string;
          espn_id: string | null;
          full_name: string;
          position: string | null;
          team_name: string | null;
          league: string | null;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          espn_id?: string | null;
          full_name: string;
          position?: string | null;
          team_name?: string | null;
          league?: string | null;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          espn_id?: string | null;
          full_name?: string;
          position?: string | null;
          team_name?: string | null;
          league?: string | null;
          source?: string;
          created_at?: string;
        };
      };
      user_rankings: {
        Row: {
          id: string;
          user_id: string;
          prospect_id: string;
          rank: number;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          prospect_id: string;
          rank: number;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          prospect_id?: string;
          rank?: number;
          source?: string;
          created_at?: string;
        };
      };
      prospect_schedule_imports: {
        Row: {
          id: string;
          prospect_id: string;
          status: 'pending' | 'in_progress' | 'done' | 'error';
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          prospect_id: string;
          status?: 'pending' | 'in_progress' | 'done' | 'error';
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          prospect_id?: string;
          status?: 'pending' | 'in_progress' | 'done' | 'error';
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      game_cache: {
        Row: {
          id: string;
          cache_key: string;
          data: any; // JSONB - stores { games: GamesByDate, source: string, date: string }
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cache_key: string;
          data: any;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cache_key?: string;
          data?: any;
          created_at?: string;
          updated_at?: string;
        };
      };
      player_team_mappings: {
        Row: {
          id: number;
          player_id: number;
          player_name: string;
          team_id: number;
          team_name: string;
          league_id: number | null;
          league_name: string | null;
          season: number;
          position: string | null;
          jersey_number: string | null;
          country: string | null;
          age: number | null;
          last_updated: string;
        };
        Insert: {
          id?: number;
          player_id: number;
          player_name: string;
          team_id: number;
          team_name: string;
          league_id?: number | null;
          league_name?: string | null;
          season: number;
          position?: string | null;
          jersey_number?: string | null;
          country?: string | null;
          age?: number | null;
          last_updated?: string;
        };
        Update: {
          id?: number;
          player_id?: number;
          player_name?: string;
          team_id?: number;
          team_name?: string;
          league_id?: number | null;
          league_name?: string | null;
          season?: number;
          position?: string | null;
          jersey_number?: string | null;
          country?: string | null;
          age?: number | null;
          last_updated?: string;
        };
      };
    };
  };
}

// Cache helper functions
export interface CachedGameData {
  games: Record<string, any[]>; // GamesByDate
  source: string;
  date: string;
}

export async function getCachedGames(cacheKey: string, allowStale = false): Promise<CachedGameData | null> {
  try {
    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('[Cache] Supabase not fully configured, skipping cache');
      return null;
    }

    const { data, error } = await supabaseAdmin
      .from('game_cache')
      .select('data, updated_at')
      .eq('cache_key', cacheKey)
      .single();
    
    if (error) {
      // Don't log error if table doesn't exist yet (expected during setup)
      if (error.code === '42P01') {
        console.log(`[Cache] Table doesn't exist yet, skipping cache`);
      } else {
        console.log(`[Cache] Error (${error.code}): ${error.message}`);
      }
      return null;
    }
    
    if (!data) {
      console.log(`[Cache] Miss for key: ${cacheKey}`);
      return null;
    }
    
    // Check if cache is fresh (less than 10 minutes old)
    // Cron job runs every minute, so cache should always be fresh
    const updatedAt = new Date(data.updated_at);
    const now = new Date();
    const ageMinutes = (now.getTime() - updatedAt.getTime()) / 1000 / 60;
    
    // If allowStale is true, return cache even if old (better than 20s wait)
    if (!allowStale && ageMinutes > 10) {
      console.log(`[Cache] Stale (${ageMinutes.toFixed(1)} min old) for key: ${cacheKey}`);
      return null;
    }
    
    console.log(`[Cache] Hit (${ageMinutes.toFixed(1)} min old) for key: ${cacheKey}`);
    return data.data as CachedGameData;
  } catch (error) {
    console.error('[Cache] Error reading cache:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function setCachedGames(cacheKey: string, data: CachedGameData): Promise<boolean> {
  try {
    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('[Cache] Supabase not fully configured, skipping cache write');
      return false;
    }

    const { error } = await supabaseAdmin
      .from('game_cache')
      .upsert(
        {
          cache_key: cacheKey,
          data,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'cache_key',
        }
      );
    
    if (error) {
      // Don't log full error if table doesn't exist yet
      if (error.code === '42P01') {
        console.log('[Cache] Table doesn\'t exist yet, skipping cache write');
      } else {
        console.error('[Cache] Error writing cache:', error.message);
      }
      return false;
    }
    
    console.log(`[Cache] Wrote key: ${cacheKey}`);
    return true;
  } catch (error) {
    console.error('[Cache] Error writing cache:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

export async function clearCachedGames(cacheKey: string): Promise<boolean> {
  try {
    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('[Cache] Supabase not fully configured, skipping cache clear');
      return false;
    }

    const { error } = await supabaseAdmin
      .from('game_cache')
      .delete()
      .eq('cache_key', cacheKey);
    
    if (error) {
      // Don't log full error if table doesn't exist yet
      if (error.code === '42P01') {
        console.log('[Cache] Table doesn\'t exist yet, skipping cache clear');
      } else {
        console.error('[Cache] Error clearing cache:', error.message);
      }
      return false;
    }
    
    console.log(`[Cache] Cleared key: ${cacheKey}`);
    return true;
  } catch (error) {
    console.error('[Cache] Error clearing cache:', error instanceof Error ? error.message : String(error));
    return false;
  }
}


