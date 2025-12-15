# Multi-League Team Coverage

## The Problem

**Why Besiktas EuroCup games were missing:**

1. **Database Structure**: The `international_teams` table stores ONE `league_id` per team
2. **Reality**: Many teams play in MULTIPLE competitions:
   - **Besiktas**: Turkish BSL (104) + EuroCup (194)
   - **Real Madrid**: Spanish Liga ACB + EuroLeague (120)
   - **Barcelona**: Spanish Liga ACB + EuroLeague (120)
   - **Partizan**: ABA League (198) + EuroLeague (120)

3. **Original Schedule Sync**: Only fetched games from the team's PRIMARY league (stored in DB)

## The Solution

### 1. Multi-League Mapping

Added `MULTI_LEAGUE_TEAMS` configuration in `scripts/sync-international-schedules.ts`:

```typescript
const MULTI_LEAGUE_TEAMS: Record<number, number[]> = {
  1266: [194], // Besiktas: BSL (104) + EuroCup (194)
  1326: [120], // Real Madrid: Liga ACB + EuroLeague (120)
  1334: [120], // Barcelona: Liga ACB + EuroLeague (120)
  1068: [120, 198], // Partizan: ABA League + EuroLeague (120)
};
```

### 2. Enhanced Schedule Sync

The sync now:
1. Fetches games from the team's primary league (from DB)
2. Checks if the team is in `MULTI_LEAGUE_TEAMS`
3. Fetches games from ALL additional leagues

### 3. Verification Tool

Run `npm run verify-leagues` to check coverage:

```bash
npm run verify-leagues
```

This will show:
- Which teams should have multiple leagues
- Which leagues each team currently has games from
- Which leagues are missing

## Current Status

✅ **Besiktas**: 72 BSL + 37 EuroCup = **109 total games**

❌ **Others need re-sync**:
- Real Madrid: Missing EuroLeague games
- Barcelona: Missing EuroLeague games
- Partizan: Missing EuroLeague/ABA games

## How to Fix Other Teams

Run the schedule sync for a specific team or all teams:

```bash
# Full re-sync (will take time due to API rate limits)
npm run sync-international

# Or manually add teams to MULTI_LEAGUE_TEAMS and re-sync
```

## Adding New Multi-League Teams

1. **Find the team's API ID** (from `international_teams` table)
2. **Find the additional league IDs** (use API-Basketball or check existing games)
3. **Add to `MULTI_LEAGUE_TEAMS`** in `scripts/sync-international-schedules.ts`:

```typescript
const MULTI_LEAGUE_TEAMS: Record<number, number[]> = {
  1266: [194], // Besiktas: BSL + EuroCup
  YOUR_TEAM_ID: [LEAGUE_ID_1, LEAGUE_ID_2], // Team Name: League 1 + League 2
};
```

4. **Re-run schedule sync** for that team

## Season Format Notes

- **EuroCup**: Uses `"2025"` (YYYY format) for 2025-2026 season
- **EuroLeague**: Uses `"2025"` (YYYY format)
- **Domestic leagues**: Varies by country
  - France (LNB): `"2025-2026"` (YYYY-YYYY)
  - Spain (ACB): `"2025"` (YYYY)
  - Turkey (BSL): `"2025"` (YYYY)

The sync script automatically handles both formats based on the team's `season_format` field.





