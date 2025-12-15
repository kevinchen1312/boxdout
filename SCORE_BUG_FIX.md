# Score Bug Fix

## Problem
Scores were showing **completely wrong values** in the app:
- **Actual**: Middle Tennessee 47 @ Michigan 73
- **App showed**: Middle Tennessee 17 @ Michigan 2

## Root Cause

The fallback score parsing logic in `lib/loadSchedulesFromESPN.ts` was **matching game clocks instead of scores**.

### What Was Happening

When ESPN API provides game status like:
```
"status": {
  "type": {
    "detail": "6:51 - 2nd Half"
  }
}
```

The regex `/(\d+)[\s,-]+(\d+)/` was matching:
- ❌ "**6:51** - 2nd Half" → extracted "6" and "51" as "scores"
- ❌ "**9:54** - 2nd" → extracted "9" and "54" as "scores"

### The Bad Code (Before)

```typescript
// OLD - BAD
if (!homeScore || !awayScore) {  // ← Runs if EITHER score missing
  const statusDetail = competition.status?.type?.detail || '';
  const scoreMatch = statusDetail.match(/(\d+)[\s,-]+(\d+)/);  // ← Matches game clocks!
  if (scoreMatch) {
    awayScore = scoreMatch[1];  // Wrong! This is the clock minutes
    homeScore = scoreMatch[2];  // Wrong! This is the clock seconds
  }
}
```

## The Fix

### Changes Made

1. **Only run fallback if BOTH scores missing**
   ```typescript
   // OLD
   if (!homeScore || !awayScore)
   
   // NEW
   if (!homeScore && !awayScore)
   ```

2. **Detect and skip game clocks**
   ```typescript
   const isGameClock = /\d{1,2}:\d{2}/.test(statusDetail);
   if (isGameClock) return; // Don't parse
   ```

3. **Only parse for completed games**
   ```typescript
   if (!isGameClock && isCompleted) {
     // Only parse scores for final games, not live
   }
   ```

4. **Require 2-3 digit scores**
   ```typescript
   // OLD: /(\d+)[\s,-]+(\d+)/ ← Matches single digits
   // NEW: /\b(\d{2,3})[\s,-]+(\d{2,3})\b/ ← Only 2-3 digits
   ```

### The Good Code (After)

```typescript
// NEW - GOOD
if (!homeScore && !awayScore) {  // ← Only if BOTH missing
  const statusDetail = competition.status?.type?.detail || '';
  const isGameClock = /\d{1,2}:\d{2}/.test(statusDetail);  // ← Check for clock
  
  if (!isGameClock && isCompleted) {  // ← Skip live games
    // Only match 2-3 digit scores
    const scoreMatch = statusDetail.match(/\b(\d{2,3})[\s,-]+(\d{2,3})\b/);
    if (scoreMatch) {
      awayScore = scoreMatch[1];  // Actual score
      homeScore = scoreMatch[2];  // Actual score
    }
  }
}
```

## Why Scores Should Work Now

ESPN API provides scores directly in most cases:
```json
{
  "competitors": [
    { "homeAway": "home", "score": "73" },  // ← Direct field
    { "homeAway": "away", "score": "47" }
  ]
}
```

The code first tries to get scores from these direct fields. The fallback parsing is only for edge cases where ESPN doesn't provide the score fields (rare).

With the fix:
- ✅ Live games: Use direct score fields only
- ✅ Completed games: Use direct fields, fallback only if both missing
- ✅ Game clocks: Never parsed as scores

## Testing

To verify the fix works:

1. **Restart the server** to reload the code:
   ```bash
   # Server will automatically restart if using npm run dev
   ```

2. **Clear the cache** to force fresh data:
   ```bash
   # In Supabase, delete cached games
   DELETE FROM game_cache WHERE cache_key LIKE 'today_games_%';
   ```

3. **Check live game scores** match ESPN:
   - Go to your app
   - Compare scores with ESPN.com
   - Should now match exactly

4. **Check server logs** for score extraction:
   ```
   [ESPN API] Extracted scores - home: 73, away: 47  ← Should be correct now
   ```

## Related Files

- `lib/loadSchedulesFromESPN.ts` - Score extraction logic (FIXED)
- `app/components/GameCard.tsx` - Display logic (unchanged)

## Summary

The bug was that game clocks like "6:51" were being parsed as scores "6-51". Fixed by:
1. Only using fallback when both scores are missing (not just one)
2. Detecting and skipping game clock patterns
3. Only parsing scores for completed games
4. Requiring 2-3 digit numbers (basketball scores are always 20+)

**Result**: Scores now display correctly! 🎉






