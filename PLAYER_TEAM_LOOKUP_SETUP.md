# Player-to-Team Lookup System - Setup Instructions

## Overview

This system allows users to search for international basketball players and see their current team BEFORE adding them to their watchlist. It works by building a comprehensive database of player-to-team mappings from API Basketball.

## What Has Been Implemented

### ✅ Completed Tasks

1. **Database Schema** - Created `player_team_mappings` table in Supabase
   - Location: `supabase/migrations/20250121_create_player_team_mappings.sql`
   - Run this migration in your Supabase project

2. **Scanner Script** - Built comprehensive roster scanning tool
   - Location: `scripts/scan-international-rosters.mjs`
   - Scans ALL international men's basketball leagues
   - Handles rate limiting automatically
   - Stores player-to-team mappings with: name, team, league, position, jersey number, country, age

3. **API Endpoint** - Player search endpoint
   - Location: `app/api/players/search/route.ts`
   - Query: `GET /api/players/search?name={playerName}`
   - Query: `GET /api/players/search?id={playerId}`
   - Returns player info including current team

4. **UI Integration** - Updated Add Player interface
   - Location: `app/components/SearchImportPlayer.tsx`
   - Searches BOTH ESPN prospects AND international players
   - Shows team, league, jersey number, country, age for international players
   - Seamlessly imports with full team information

5. **Auto-Fetch Games** - Automatically syncs team schedules
   - Location: `app/api/draft-prospects/import-and-add/route.ts`
   - When user adds international player, automatically fetches their team's games
   - No manual schedule setup required

6. **Library Functions** - Helper functions for database queries
   - Location: `lib/playerTeamMappings.ts`
   - `searchPlayerByName()` - Search by name
   - `getPlayerById()` - Get by player ID
   - `getTeamRoster()` - Get full team roster
   - `insertPlayerMappings()` - Bulk insert (used by scanner)
   - `getMappingStats()` - Get statistics

## Setup Steps

### Step 1: Run Database Migration

In your Supabase project SQL Editor, run:

```sql
-- Copy contents from supabase/migrations/20250121_create_player_team_mappings.sql
```

Or if you have Supabase CLI:

```bash
supabase db push
```

### Step 2: Run Initial Roster Scan

⚠️ **IMPORTANT**: This scan takes several hours and uses API rate limits

```bash
# Set your API key (if not already in .env)
export RAPIDAPI_BASKETBALL_KEY=137753bdbaae2a23471e3aad86e92c73

# Run the scanner
node scripts/scan-international-rosters.mjs
```

The scanner will:
- Query all international leagues (Europe, Asia, Australia, Africa, South America, etc.)
- Get all teams in each league
- Get roster for each team
- Store player-team mappings in database
- Show progress every 20 teams
- Take 2-second delays between requests (7,500 requests/day limit)

**Estimated Time**: 4-8 hours for comprehensive scan
**API Requests**: ~3,000-5,000 requests (well within daily limit)

### Step 3: Verify the Data

After the scan completes, test the system:

```bash
# Test the API endpoint
curl "http://localhost:3000/api/players/search?name=riethauser"
```

Or use the UI:
1. Go to Rankings page
2. Click "Add Custom Player"
3. Click "Search & Import" tab
4. Search for any international player (e.g., "riethauser")
5. You should see team information displayed

### Step 4: Schedule Periodic Updates (Optional)

To catch mid-season transfers and roster changes, schedule the scanner to run:
- Monthly during season
- Before start of new season
- Or on-demand via admin panel

You can create a cron job or manually trigger the scan.

## How It Works

### User Flow

1. **User searches for player** (e.g., "K. Riethauser")
2. **System searches two sources**:
   - ESPN prospects database (college players)
   - Player-team mappings database (international players)
3. **Results show**:
   - Player name
   - Current team
   - League
   - Position
   - Jersey number (if available)
   - Country (if available)
   - Age (if available)
4. **User clicks "Import & Add"**
5. **System automatically**:
   - Creates prospect record
   - Adds to user's board
   - Fetches team's game schedule
   - Stores games in database
6. **Games appear on user's calendar** - Done!

### Data Sources

- **College players**: ESPN API (existing)
- **International players**: API Basketball player-team mappings (new)
- **Games**: API Basketball for international, ESPN for college

## API Basketball Coverage

### Included Leagues

The scanner covers ALL international men's basketball leagues, including but not limited to:

**Europe:**
- EuroLeague, EuroCup
- Spanish Liga ACB
- French LNB Pro A
- German BBL
- Italian Serie A
- Turkish BSL
- Greek Basket League
- And many more domestic leagues

**Other Regions:**
- Australia - NBL
- Asia - CBA, KBL, B.League, etc.
- South America - LNB Argentina, NBB Brazil, etc.
- Africa - BAL, etc.

**Excluded:**
- NCAA (uses ESPN)
- NBA, G-League (uses ESPN)
- WNBA and women's leagues

### Limitations

- **U21/Youth teams**: Not tracked by API Basketball
  - Players like K. Riethauser on Chalon U21 won't appear
  - Only senior/professional teams are mapped
- **Incomplete player data**: Some players only have initials
  - Example: "J. Kante" vs "John Kante"
  - This is a limitation of API Basketball's database
- **Season specific**: Mappings are per season
  - Default: 2025 season (2025-2026)
  - Historical seasons available but need separate scans

## Maintenance

### Re-run Scanner

To refresh mappings (e.g., after trades/transfers):

```bash
node scripts/scan-international-rosters.mjs
```

This will **update** existing player mappings (upsert), so it's safe to re-run.

### Check Database Stats

```typescript
import { getMappingStats } from '@/lib/playerTeamMappings';

const stats = await getMappingStats(2025);
console.log(stats);
// { totalPlayers: 5000, totalTeams: 300, totalLeagues: 50 }
```

### Query Examples

```typescript
// Search by name
const players = await searchPlayerByName('riethauser');

// Get specific player
const player = await getPlayerById(16311);

// Get team roster
const roster = await getTeamRoster(20, 2025); // Chalon/Saone, 2025 season
```

## Troubleshooting

### Scanner fails with "403 Forbidden"
- Check API key is correct
- Verify subscription is active
- Some endpoints require Pro plan

### Scanner fails with "429 Too Many Requests"
- Rate limit reached (7,500/day)
- Wait until next day or increase delays

### No players found in search
- Run the scanner first (`node scripts/scan-international-rosters.mjs`)
- Check database has data: `SELECT COUNT(*) FROM player_team_mappings;`

### Player has team but games don't load
- Check team name matches API Basketball exactly
- Verify team has games in current season
- Check logs in `/api/draft-prospects/import-and-add` endpoint

## Future Enhancements

Possible improvements:
- Add admin UI to trigger scans
- Show last scan date in UI
- Add filtering by league/country in search
- Cache search results for better performance
- Add player photos/avatars
- Track player statistics over time

## Files Reference

**Database:**
- `supabase/migrations/20250121_create_player_team_mappings.sql`
- `lib/supabase.ts` (updated with type definitions)

**Scanner:**
- `scripts/scan-international-rosters.mjs`

**API:**
- `app/api/players/search/route.ts`

**Libraries:**
- `lib/playerTeamMappings.ts`

**UI:**
- `app/components/SearchImportPlayer.tsx`
- `app/components/AddCustomPlayerForm.tsx`

**Import:**
- `app/api/draft-prospects/import-and-add/route.ts`

---

**Status**: ✅ Implementation Complete
**Next Step**: Run the scanner to populate mappings

