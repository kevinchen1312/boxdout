# Fast-Loading Today's Games Implementation

## Summary

Implemented a persistent caching system that ensures today's games load in **<1 second** on first visit with complete data.

## How It Works

### Architecture

1. **Supabase Cache Table** (`game_cache`)
   - Stores pre-computed today's games as JSONB
   - Indexed for fast lookups (<100ms)
   - Persists across server restarts

2. **Background Cron Job** (`/api/cron/refresh-today`)
   - Runs every minute (Vercel Cron or manual cron)
   - Fetches and computes today's games
   - Updates cache in Supabase
   - Runs in background (doesn't block user requests)

3. **Optimized API Endpoint** (`/api/games/today`)
   - **Phase 1**: Check Supabase cache (< 100ms)
   - If cache hit (fresh <2 min): Return immediately
   - **Phase 2**: If cache miss: Fall back to live fetch
   - After live fetch: Update cache for next request

### Performance

| Scenario | Load Time | Notes |
|----------|-----------|-------|
| **First visit (cache hit)** | <100ms | Reads from pre-computed cache |
| **First visit (cache miss)** | 5-10s | Falls back to live fetch, then caches |
| **Subsequent visits** | <100ms | Always from cache |
| **Cache age** | <1 minute | Refreshed every minute |

## Files Created

1. **`supabase/migrations/20250120_create_game_cache.sql`**
   - Creates `game_cache` table
   - Adds indexes for performance
   - Sets up RLS policies

2. **`app/api/cron/refresh-today/route.ts`**
   - Cron endpoint to refresh cache
   - Protected by CRON_SECRET or Vercel auth
   - Supports both POST and GET for testing

3. **`vercel.json`**
   - Configures Vercel Cron to run every minute
   - Automatically authenticated on Vercel

4. **`CRON_SETUP.md`**
   - Instructions for self-hosted deployment
   - Multiple cron setup options
   - Troubleshooting guide

## Files Modified

1. **`lib/supabase.ts`**
   - Added `game_cache` table types
   - Added helper functions: `getCachedGames()`, `setCachedGames()`
   - Cache freshness check (2 minute TTL)

2. **`app/api/games/today/route.ts`**
   - Added cache lookup before live fetch
   - Returns cached data if fresh
   - Falls back to live fetch if cache miss/stale
   - Stores result in cache after live fetch

## Setup Instructions

### For Vercel Deployment

1. **Run Supabase Migration**
   ```bash
   # In Supabase dashboard SQL editor, run:
   # supabase/migrations/20250120_create_game_cache.sql
   ```

2. **Deploy to Vercel**
   ```bash
   git push vercel main
   ```
   
   Vercel will automatically:
   - Read `vercel.json` and set up cron
   - Call `/api/cron/refresh-today` every minute
   - Authenticate requests automatically

3. **Verify**
   - Check Vercel dashboard > Cron Jobs
   - Should see `/api/cron/refresh-today` running every minute

### For Self-Hosted Deployment

1. **Run Supabase Migration**
   ```bash
   # In Supabase dashboard SQL editor, run:
   # supabase/migrations/20250120_create_game_cache.sql
   ```

2. **Set Environment Variable**
   ```bash
   # Add to .env.local:
   CRON_SECRET=your_random_secure_secret_here
   ```

3. **Set Up Cron Job**
   
   See `CRON_SETUP.md` for detailed instructions. Quick example:
   
   ```bash
   # Open crontab
   crontab -e
   
   # Add this line (replace YOUR_DOMAIN and YOUR_SECRET):
   * * * * * curl -X POST https://YOUR_DOMAIN.com/api/cron/refresh-today -H "Authorization: Bearer YOUR_SECRET"
   ```

4. **Restart Server**
   ```bash
   npm run build
   npm start
   ```

## Testing

### 1. Test Cache Refresh Endpoint

```bash
# For self-hosted with CRON_SECRET:
curl -X POST http://localhost:3000/api/cron/refresh-today \
  -H "Authorization: Bearer YOUR_SECRET"

# Expected response:
{
  "success": true,
  "timestamp": "2025-01-20T12:00:00.000Z",
  "date": "2025-01-20",
  "results": [
    {
      "source": "espn",
      "success": true,
      "games": 15,
      "timeMs": 2500
    }
  ],
  "totalGames": 15
}
```

### 2. Test Today's Games Endpoint

```bash
# First request (should be fast if cache is warm)
time curl http://localhost:3000/api/games/today?source=espn

# Check response headers:
# X-Cache-Status: HIT (from cache) or MISS (live fetch)
```

### 3. Verify Cache in Supabase

```sql
-- In Supabase SQL editor:
SELECT 
  cache_key,
  updated_at,
  jsonb_array_length(data->'games'->'2025-01-20') as game_count
FROM game_cache
ORDER BY updated_at DESC;
```

### 4. Monitor Performance

Check server logs for timing:
```bash
# Look for these log patterns:
[Cache] Hit (0.5 min old) for key: today_games_espn_2025-01-20
[API/Today] Returning from cache for espn
[API/Today] Cache lookup for today_games_espn_2025-01-20: 45ms

# Or for cache miss:
[Cache] Miss for key: today_games_espn_2025-01-20
[API/Today] Cache miss for espn, fetching live data
[API/Today] Live fetch for espn: 5234ms
```

## Environment Variables

### Required

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for cache writes)

### Optional (for self-hosted)

- `CRON_SECRET` - Secret token to protect cron endpoint

## Troubleshooting

### Cache not working

1. **Check Supabase connection:**
   - Verify environment variables are set
   - Check Supabase dashboard for `game_cache` table
   - Run migration if table doesn't exist

2. **Check cron job:**
   - For Vercel: Check Vercel dashboard > Cron Jobs
   - For self-hosted: Check crontab and logs
   - Manually trigger: `curl -X POST .../api/cron/refresh-today`

3. **Check cache freshness:**
   ```sql
   SELECT cache_key, updated_at, 
          EXTRACT(EPOCH FROM (NOW() - updated_at))/60 as age_minutes
   FROM game_cache
   ORDER BY updated_at DESC;
   ```
   
   Age should be <2 minutes for cache to be used.

### Still slow on first load

1. **Check cache hit rate:**
   - Look for `X-Cache-Status` header in response
   - Should be "HIT" after cron runs

2. **Verify cron is running:**
   - Check server logs for "[Cron]" entries
   - Should see new entries every minute

3. **Check cache size:**
   - Today's games should be <1MB
   - If larger, check for data bloat

### 401 Unauthorized on cron endpoint

- For self-hosted: Verify `CRON_SECRET` matches in `.env.local` and cron command
- For Vercel: Cron auth is automatic, no secret needed

## Architecture Decisions

### Why Supabase instead of in-memory cache?

- **Persistence**: Survives server restarts
- **Serverless-friendly**: Works on Vercel's ephemeral instances
- **Shared across instances**: Multiple server instances share the same cache
- **Fast**: <100ms reads with indexes

### Why 1-minute refresh interval?

- **Balance**: Fresh enough for live score updates, not too frequent for API rate limits
- **Cost**: ~1,440 API calls/day to ESPN API (well within limits)
- **Performance**: Users always see data <1 minute old

### Why 2-minute cache TTL?

- **Buffer**: If cron fails one run, cache is still usable
- **Safety**: Prevents serving stale data if cron breaks
- **Fallback**: Guaranteed fresh data within 2 minutes worst case

## Future Improvements

1. **Cache warm-up on deploy**: Pre-populate cache on server start
2. **Multi-date caching**: Cache next 3-7 days for even faster navigation
3. **Client-side cache**: Layer browser caching on top of Supabase cache
4. **Cache invalidation**: Smart invalidation on score updates
5. **Compression**: Compress JSONB data to reduce storage/transfer size

## Metrics to Monitor

- **Cache hit rate**: Should be >90% after 1 minute of server uptime
- **Cache age**: Should average <30 seconds
- **Load time (cache hit)**: Should be <100ms
- **Load time (cache miss)**: Will be 5-10s (acceptable fallback)
- **Cron execution time**: Should be <10s per run
- **Cron success rate**: Should be >99%





