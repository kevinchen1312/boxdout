# API Limit Reset - What to Do Tomorrow

## Problem Summary
We hit the API-Basketball daily request limit (100 requests/day for free tier) while debugging. The limit resets at **midnight UTC**.

## What's Already Fixed ✅

### 1. Pokusevski Issues - ALL CODE FIXED
- ✅ League-based filtering to prevent NBL/EuroLeague mixing
- ✅ Enhanced database schema with `team_id` and logo columns
- ✅ Team mapping for Partizan (ID: 40, Leagues: 120 + 198)
- ✅ JavaScript scope bug fixed (`leagueId` error)
- ✅ Logo caching system ready
- ✅ "Super League" added to European league detection

**Status:** Team ID and mappings are correct. Just needs API to fetch games.

### 2. Nadolny Issue - Partial Fix
- ✅ Team correctly identified as "Chalon/Saone"  
- ❌ Team ID is `null` - needs to be found and set
- ❌ No games fetched yet

## What to Do When API Limit Resets

### Step 1: Find Chalon's Team ID (5 minutes)

**Open in browser:**
```
http://localhost:3000/api/admin/search-team-id?name=Chalon
```

Or try these alternate names:
- `?name=Elan%20Chalon`
- `?name=Chalon-Sur-Saone`
- `?name=JL%20Bourg` (if they merged/renamed)

**Look for:**
- Team name that matches Chalon's French team
- Note the `id` number
- Check it says "France" or "French" in country/league

### Step 2: Add Chalon to Team Mappings

Edit `lib/loadSchedulesFromApiBasketball.ts` around line 70-90, add:

```typescript
'chalon': { teamId: XXX, leagueIds: [2], leagueName: 'LNB Pro A' },  // Replace XXX with actual ID
'chalonsaone': { teamId: XXX, leagueIds: [2], leagueName: 'LNB Pro A' },
'elanchalon': { teamId: XXX, leagueIds: [2], leagueName: 'LNB Pro A' },
```

### Step 3: Fix Pokusevski's Games

**Run:**
```
http://localhost:3000/api/admin/fix-pokusevski-complete
```

Click "Run Fix" button.

**Expected result:** "Success! Fetched 50+ games"

### Step 4: Fix Nadolny's Games

**In browser console (F12), run:**

```javascript
fetch('http://localhost:3000/api/admin/set-team-id', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prospectId: "23b6a2a9-ab93-4e68-807f-38c8ce47baed",
    teamId: XXX  // Replace with Chalon's team ID from Step 1
  })
}).then(r => r.json()).then(console.log)
```

**Expected result:** "Success! Fetched 20-30 games"

### Step 5: Restart Dev Server

```bash
# Ctrl+C to stop
npm run dev
```

### Step 6: Verify Everything Works

1. **Pokusevski:** `http://localhost:3000/?prospect=Aleksej+Pokusevski`
   - Should see 50+ EuroLeague + ABA League games
   - NO Brisbane Bullets, Melbourne United, etc.
   - High-quality Partizan logo
   - High-quality opponent logos (Monaco, Barcelona, etc.)

2. **Nadolny:** `http://localhost:3000/?prospect=Clarence+Nadolny`
   - Should see 20-30 French LNB Pro A games
   - Chalon/Saone games only
   - High-quality team logos

## Quick Reference

### Database Migration (Already Applied)
```sql
ALTER TABLE prospect_games
ADD COLUMN IF NOT EXISTS home_team_id INTEGER,
ADD COLUMN IF NOT EXISTS away_team_id INTEGER,
ADD COLUMN IF NOT EXISTS home_team_logo TEXT,
ADD COLUMN IF NOT EXISTS away_team_logo TEXT;
```

### Key Files Modified
- ✅ `lib/loadSchedules.ts` - League filtering
- ✅ `lib/loadSchedulesFromApiBasketball.ts` - Partizan mapping, bug fix
- ✅ `lib/fetchInternationalProspectGames.ts` - Logo storage
- ✅ `supabase/migrations/20250123_add_team_ids_to_prospect_games.sql` - Schema

### API Endpoints Created
- `/api/admin/fix-pokusevski-complete` - One-click fix
- `/api/admin/search-team-id?name=X` - Find team IDs
- `/api/admin/set-team-id` - Manually set team ID
- `/api/admin/check-player?name=X` - Debug player data
- `/api/admin/update-pokusevski` - Set Partizan team ID

## Troubleshooting

**If games still don't show after fetch:**
1. Check browser console (F12) for errors
2. Run `/api/admin/check-poku-games` to see DB contents
3. Verify server was restarted after adding team mappings

**If NBL games still appear:**
1. Check prospect's `league` field in database
2. Ensure it contains "euroleague", "super league", or "adriatic"
3. The filtering logic is in `lib/loadSchedules.ts` line ~2428

**If logos are missing:**
1. Check `prospect_games` table has `home_team_logo` populated
2. Logos are cached automatically when games are fetched
3. Can manually fetch: `/api/admin/fetch-partizan-logos`

## Expected Timeline

- **Tonight (after midnight UTC):** API limit resets
- **Tomorrow morning:** Follow steps 1-6 above (~15 minutes)
- **Result:** Pokusevski and Nadolny both show correct games with logos

## Notes

- Free tier: 100 requests/day
- Each game fetch uses ~5-10 requests (roster + games for multiple leagues)
- Be conservative with API calls during testing
- Consider upgrading if you'll be adding many international players

## Success Criteria

✅ Pokusevski shows 50+ games (EuroLeague + ABA)  
✅ NO NBL teams in his schedule  
✅ All logos are high-quality (not placeholders)  
✅ Nadolny shows 20-30 games (French LNB)  
✅ Team names match actual teams  
✅ No JavaScript errors  

---

**All the hard work is done!** Just need to wait for the API limit to reset, then 15 minutes to complete the setup. 🎉




