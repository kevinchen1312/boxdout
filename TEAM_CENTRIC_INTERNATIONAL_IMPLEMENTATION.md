# Team-Centric International System - Implementation Summary

## ✅ Completed Tasks

### Phase 1: Database Schema ✅
Created 4 new database migrations:

1. **`supabase/migrations/20250123_create_international_teams.sql`**
   - Stores all international basketball teams
   - Fields: `api_team_id`, `name`, `logo_url`, `country`, `league_id`, `league_name`, `season_format`

2. **`supabase/migrations/20250123_create_international_rosters.sql`**
   - Stores player rosters for each team
   - Fields: `team_id` (FK), `player_name`, `position`, `season`
   - Full-text search index on `player_name`

3. **`supabase/migrations/20250123_create_international_team_schedules.sql`**
   - Stores game schedules for each team
   - Fields: `team_id` (FK), `game_id`, `date`, `home/away teams`, `logos`, `venue`, `scores`

4. **`supabase/migrations/20250123_add_international_team_to_prospects.sql`**
   - Adds `international_team_id` column to `prospects` table
   - Links prospects to international teams

### Phase 2 & 3: Sync Scripts ✅
Created comprehensive data sync system:

1. **`scripts/sync-international-leagues.ts`**
   - Fetches ALL basketball leagues worldwide (excluding USA)
   - Fetches all teams for each league
   - Determines season format automatically (YYYY vs YYYY-YYYY)
   - Stores in `international_teams` table

2. **`scripts/sync-international-rosters.ts`**
   - Fetches current season roster for each team
   - Stores players in `international_rosters` table
   - Rate-limited for API safety

3. **`scripts/sync-international-schedules.ts`**
   - Fetches games for current and previous seasons
   - Tries both season formats automatically
   - Stores in `international_team_schedules` with logos

4. **`scripts/daily-international-sync.ts`**
   - Master script that runs all 3 syncs in sequence
   - Includes retry logic and error handling
   - Reports sync statistics

5. **Added to `package.json`:**
   ```json
   "sync-international": "ts-node scripts/daily-international-sync.ts"
   ```

### Phase 4: Search System ✅
Updated player search to query international rosters:

**`app/api/players/search-all/route.ts`**
- Now searches `international_rosters` table
- Returns results with team info, logos, league, country
- Merges with college and watchlist search results
- Instant search (no API calls)

### Phase 5: Import Flow ✅
Updated player import to use roster-based system:

**`app/api/draft-prospects/import-and-add/route.ts`**
- Detects international roster players (`intl-roster-` prefix)
- Looks up team from roster entry
- Creates prospect with `source: 'international-roster'`
- Stores `international_team_id` foreign key
- **Skips game fetching** - games already in database!

## 🚧 Still To Do

### 1. Run Database Migrations

**CRITICAL:** You need to run these migrations on your Supabase instance:

```bash
# Option A: Via Supabase CLI
supabase db push

# Option B: Copy/paste SQL into Supabase Dashboard
# Go to Database → SQL Editor
# Run each migration file in order:
# 1. 20250123_create_international_teams.sql
# 2. 20250123_create_international_rosters.sql
# 3. 20250123_create_international_team_schedules.sql
# 4. 20250123_add_international_team_to_prospects.sql
```

### 2. Run Initial Sync

**After migrations are complete**, run the initial data sync:

```bash
npm run sync-international
```

This will:
- Fetch all international leagues (~100-200 leagues)
- Fetch all teams (~500-1000 teams)
- Fetch rosters (~10,000-20,000 players)
- Fetch schedules (~20,000-40,000 games)
- **Takes 2-4 hours due to API rate limiting**
- Uses ~3000-5000 API calls

### 3. Update Game Loading

**File:** `lib/loadSchedules.ts`

Need to add logic to load games from `international_team_schedules` for roster-based prospects:

```typescript
// Pseudocode - add this to game loading function
if (prospect.source === 'international-roster' && prospect.international_team_id) {
  // Load games from international_team_schedules
  const { data: games } = await supabase
    .from('international_team_schedules')
    .select('*')
    .eq('team_id', prospect.international_team_id)
    .order('date');
  
  // Determine home/away based on team_id match
  // Return formatted games
}
```

### 4. Create Admin UI

**File:** `app/api/admin/international-sync-ui/route.ts`

Create admin dashboard with:
- View sync status (last sync time, team/player counts)
- Manual sync triggers
- Browse teams, rosters, schedules
- Error logs

### 5. Migration & Cleanup

**File:** `scripts/migrate-to-team-system.ts`

Create script to:
- Delete old international prospects (`source: 'external'`)
- Delete old `prospect_games` for internationals
- Export backup before deletion
- Clean up `player_team_mappings` table

## 🎯 How The New System Works

### For Users

1. **Search for player** (e.g., "Pokusevski")
   - System searches `international_rosters` table
   - Returns instant results with team logo, league, country

2. **Add to watchlist**
   - System looks up player's roster entry
   - Gets their `team_id`
   - Creates prospect linked to that team
   - **No API calls, no game fetching!**

3. **View schedule**
   - System loads games from `international_team_schedules`
   - Filters to games for that team
   - All logos already cached
   - **Instant, no API calls!**

### For Maintenance

**Daily at 3 AM (or manual trigger):**
- Sync rosters (updates if players change teams)
- Sync schedules (adds new games, updates scores)
- Sync leagues (only if new season detected)

**Benefits:**
- ✅ No more "team not found" errors
- ✅ No more API calls per player
- ✅ Consistent schedules for teammates
- ✅ All logos pre-cached
- ✅ Works exactly like NCAA system
- ✅ Scales to thousands of players

## 📊 Expected Results After Full Implementation

- **200-300 leagues** in database
- **500-1000 teams** across all continents
- **10,000-20,000 players** searchable
- **20,000-40,000 games** with logos
- **Search speed:** <100ms (vs 5-10s before)
- **Add player:** <200ms (vs 10-30s before)
- **Load schedule:** <150ms (vs 5-15s before)

## 🚀 Next Steps

1. **Run migrations** (5 minutes)
2. **Run initial sync** (2-4 hours)
3. **Update game loading** (30 minutes)
4. **Test with a player** (add Pokusevski, verify games load)
5. **Create admin UI** (1-2 hours)
6. **Delete old international players** (run migration script)

## 📝 Notes

- Migrations include RLS policies (public read, service role write)
- All scripts include rate limiting (1-1.5s between API calls)
- Sync scripts are idempotent (safe to run multiple times)
- Team season formats auto-detected from API
- Player names normalized for search (accents, special chars)

---

**Ready to proceed?** Run the migrations first, then the initial sync!




