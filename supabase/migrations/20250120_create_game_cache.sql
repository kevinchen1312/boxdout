-- Create game_cache table for storing pre-computed today's games
-- This enables <1 second load times on first visit

CREATE TABLE IF NOT EXISTS public.game_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index on cache_key for fast lookups
CREATE INDEX IF NOT EXISTS idx_game_cache_key ON public.game_cache(cache_key);

-- Add index on updated_at for cache freshness checks
CREATE INDEX IF NOT EXISTS idx_game_cache_updated ON public.game_cache(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE public.game_cache ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access (cached game data is public)
CREATE POLICY "Allow public read access" ON public.game_cache
  FOR SELECT USING (true);

-- Create policy to allow service role to insert/update (cron job)
CREATE POLICY "Allow service role to insert/update" ON public.game_cache
  FOR ALL USING (auth.role() = 'service_role');

-- Comment on table
COMMENT ON TABLE public.game_cache IS 'Stores pre-computed game schedules for fast loading';
COMMENT ON COLUMN public.game_cache.cache_key IS 'Format: today_games_{source}_{date} (e.g., today_games_espn_2025-01-20)';
COMMENT ON COLUMN public.game_cache.data IS 'JSONB containing { games: GamesByDate, source: string, date: string }';






