# Pokusevski Data Fix - High Quality Logos & NBL Game Removal

## Issues Fixed

1. **NBL games showing up for European players** - Games from Australian NBL were incorrectly mixed with EuroLeague games
2. **Missing high-quality logos** - Team logos from API-Basketball weren't being stored or displayed
3. **No league-based filtering** - Games from different leagues with same team names were merged

## Changes Made

### 1. Database Schema Enhancement
**File**: `supabase/migrations/20250123_add_team_ids_to_prospect_games.sql`

Added columns to `prospect_games` table:
- `home_team_id` - API-Basketball team ID for logo lookup
- `away_team_id` - API-Basketball team ID for logo lookup  
- `home_team_logo` - Cached logo URL from API
- `away_team_logo` - Cached logo URL from API

### 2. League-Based Game Filtering
**File**: `lib/loadSchedules.ts`

Added intelligent filtering in `loadWatchlistPlayerGames()`:
- Detects player's league from database
- Filters out NBL games for European players
- Filters out European games for NBL players
- Uses comprehensive team name lists for detection

### 3. Logo Storage & Retrieval
**Files**: 
- `lib/fetchInternationalProspectGames.ts` - Store team IDs and logos when fetching games
- `lib/loadSchedules.ts` - Load logos from database when displaying games

Now when games are fetched from API-Basketball:
1. Team IDs and logos are extracted from API response
2. Stored in `prospect_games` table
3. Loaded and displayed when games are shown

### 4. API Endpoints for Maintenance
**File**: `app/api/admin/fix-pokusevski-complete/route.ts`

Created endpoint to:
- Delete incorrect NBL games
- Refetch all games with high-quality logos
- Usage: `POST /api/admin/fix-pokusevski-complete`

**File**: `app/api/admin/fetch-partizan-logos/route.ts`

Created endpoint to fetch logos for specific teams:
- Usage: `GET /api/admin/fetch-partizan-logos`

## How to Apply the Fix

### Step 1: Apply Database Migration

Run the SQL migration in your Supabase dashboard:

```sql
-- File: supabase/migrations/20250123_add_team_ids_to_prospect_games.sql

ALTER TABLE prospect_games
ADD COLUMN IF NOT EXISTS home_team_id INTEGER,
ADD COLUMN IF NOT EXISTS away_team_id INTEGER,
ADD COLUMN IF NOT EXISTS home_team_logo TEXT,
ADD COLUMN IF NOT EXISTS away_team_logo TEXT;

CREATE INDEX IF NOT EXISTS idx_prospect_games_home_team_id ON prospect_games(home_team_id);
CREATE INDEX IF NOT EXISTS idx_prospect_games_away_team_id ON prospect_games(away_team_id);
```

### Step 2: Refetch Pokusevski's Games

Call the API endpoint (from browser console or terminal):

```bash
curl -X POST http://localhost:3000/api/admin/fix-pokusevski-complete
```

Or open the URL in your browser:
```
http://localhost:3000/api/admin/fix-pokusevski-complete
```

### Step 3: Restart Dev Server

Restart your Next.js development server to load the new code:
```bash
# Stop the server (Ctrl+C)
# Restart it
npm run dev
```

### Step 4: Clear Browser Cache & Refresh

Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R) to see the updated data.

## Expected Results

After applying the fix:

✅ **NBL games removed** - Brisbane Bullets, Melbourne United, Perth, etc. games will no longer appear  
✅ **High-quality logos** - Partizan, Paris, Monaco, Borac, Hapoel Tel-Aviv logos will display  
✅ **Correct games only** - Only EuroLeague/Adriatic League games will show  
✅ **Future-proof** - New imported players will automatically get logos stored

## Technical Details

### League Detection Logic

The filtering identifies leagues based on:
- **European leagues**: EuroLeague, EuroCup, ACB, LNB, ABA, BBL, VTR, Adriatic
- **NBL teams**: Brisbane Bullets, Melbourne United, Sydney Kings, Perth Wildcats, Adelaide 36ers, Cairns Taipans, Illawarra Hawks, Tasmania JackJumpers, New Zealand Breakers, South East Melbourne Phoenix

### Logo Priority

When displaying team logos:
1. **Database cache** (`prospect_games.home_team_logo`) - High quality from API
2. **Team directory** - Local team logos
3. **Placeholder** - Basketball icon

### Game Deduplication

Enhanced `buildGameKey()` to include:
- Date
- Time
- Team names (normalized)
- Venue
- **League ID** (NEW) - Prevents collision between same-named teams in different leagues

## Troubleshooting

### If logos still don't show:
1. Check that migration was applied: Look for new columns in Supabase dashboard
2. Verify API key is configured: Check `API_BASKETBALL_KEY` in `.env.local`
3. Check console logs: Look for logo caching messages
4. Manually fetch logos: Call `/api/admin/fetch-partizan-logos`

### If NBL games still appear:
1. Ensure server was restarted after code changes
2. Check league is set correctly in `prospects` table
3. Verify filtering logic is running: Check console logs for "Filtering out NBL game" messages
4. Re-run the fix endpoint: `POST /api/admin/fix-pokusevski-complete`

## Files Changed

- ✅ `supabase/migrations/20250123_add_team_ids_to_prospect_games.sql` - New migration
- ✅ `lib/loadSchedules.ts` - Added league filtering and logo loading
- ✅ `lib/fetchInternationalProspectGames.ts` - Store team IDs and logos
- ✅ `app/api/admin/fix-pokusevski-complete/route.ts` - Fix endpoint
- ✅ `app/api/admin/fetch-partizan-logos/route.ts` - Logo fetching endpoint
- ✅ `app/api/admin/refresh-player-games/route.ts` - Refresh endpoint (existing)

## Next Steps

The system is now set up to:
1. Automatically cache logos when games are fetched
2. Filter games by league to prevent mixing
3. Display high-quality logos for all teams

Any new players imported will automatically benefit from these improvements!





