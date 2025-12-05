# Testing Score Extraction

## Current Status

**Problem**: Live games show no scores even though ESPN API has them

**Root Cause**: Stale cached data + score extraction may not be running

## To Fix Immediately

### Option 1: Wait for Auto-Refresh (Easiest)
1. The auto-refresh runs every 30 seconds for live games
2. Wait 30-60 seconds
3. Scores should update automatically
4. Check browser console for `[useGames] Auto-refreshing` messages

### Option 2: Manual Supabase Cache Clear (Most Effective)
1. Open Supabase SQL Editor
2. Run:
   ```sql
   DELETE FROM game_cache;
   ```
3. Refresh your browser
4. Scores will load fresh from ESPN

### Option 3: Hard Browser Refresh
1. Press `Ctrl+Shift+Delete` (or `Cmd+Shift+Delete`)
2. Clear cache and cookies
3. Close and reopen browser
4. Visit site again

## Verification

After fixing, check:
- ✅ Michigan vs Middle Tennessee should show "86-61 Final"
- ✅ Arizona vs UConn should show current live score
- ✅ Other games should have scores too

## Debug Information

I've added extensive debugging to `lib/loadSchedulesFromESPN.ts`. When the schedule loads, you should see in server logs:

```
[ESPN API] ========== PROCESSING GAME ==========
[ESPN API] Game: Middle Tennessee @ Michigan  
[ESPN API] State: post, isCompleted: true, isLive: false
[ESPN API] homeComp.score raw: {"value":86,"displayValue":"86"}
[ESPN API] awayComp.score raw: {"value":61,"displayValue":"61"}
[ESPN API] Extracted scores - home: '86', away: '61'
```

If you see `Missing scores!` warnings, that indicates the extraction is failing.

## Why This Happened

1. **Schedule files** are pre-generated and don't have live scores
2. **ESPN API** is called to enrich them with live data
3. **Caching** stores the enriched data
4. **Problem**: Cache had old data without scores
5. **Solution**: Clear cache to force fresh ESPN API calls

## Next Steps

Since PowerShell is having issues running commands, please manually:

1. **Clear Supabase cache** (fastest):
   - Go to Supabase dashboard
   - SQL Editor
   - Run: `DELETE FROM game_cache;`

2. **Refresh browser** hard (`Ctrl+Shift+R`)

3. **Check if scores appear**

4. **If still no scores**, check server console for the `[ESP API]` debug messages I added - they'll show exactly what's being extracted

The auto-refresh should also kick in after 30 seconds if there are live games, so scores should start updating automatically once the cache is fresh.





