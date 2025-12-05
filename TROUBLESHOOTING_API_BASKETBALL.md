# Troubleshooting API-Basketball Integration

## Issue 1: International Games Not Showing

### Symptoms
- Added `RAPIDAPI_BASKETBALL_KEY` to `.env.local`
- Joventut Badalona and ASVEL games not appearing
- Games that happened earlier today are missing

### Solutions

#### 1. **RESTART YOUR DEV SERVER** ⚠️ CRITICAL
Next.js only reads `.env.local` when the server starts. After adding the environment variable:

```bash
# Stop your dev server (Ctrl+C)
# Then restart it
npm run dev
```

#### 2. Check Server Logs
Look for these log messages when schedules load:
```
[API-Basketball] Using API key from environment: 137753bd...
[API-Basketball] Matched "joventut badalona" to known mapping
[API-Basketball] Fetching schedule for [Prospect Name] (team: "Joventut Badalona")
[API-Basketball] Successfully fetched X games for team 2334
```

If you don't see these logs, the integration isn't being triggered.

#### 3. Verify Team Names Match
The system checks prospect team names. Run this debug script:

```bash
node debug-api-basketball.js
```

This will:
- Check if API key is being read
- Test API calls for Joventut and ASVEL
- Show what games are available for today

#### 4. Check Prospect Team Names
The integration matches these team name variations:
- "Joventut Badalona" ✅
- "Joventut" ✅
- "ASVEL" ✅
- "LDLC ASVEL" ✅
- "ASVEL Basket" ✅

If your prospect data has different team names, you may need to update the mappings.

#### 5. Date Range Issue (FIXED)
The integration now fetches games from:
- **Past 30 days** (to catch games that happened today)
- **Future 180 days** (to catch upcoming games)

This ensures today's games are included even if they've already been played.

## Issue 2: Games Disappearing (Middle Tennessee vs Michigan)

### Possible Causes

1. **Schedule Update from ESPN**
   - ESPN may have updated/cancelled/rescheduled the game
   - Check ESPN's website to verify the game still exists
   - The game might have been moved to a different time/date

2. **Game Status Changed**
   - If a game is marked as "completed" or "cancelled", it might be filtered out
   - Check the game status in ESPN's API

3. **Date/Time Parsing Issue**
   - The game might have been rescheduled to a different time
   - Check server logs for parsing errors

### How to Debug

1. **Check Server Logs**
   Look for:
   ```
   [Schedule] Fetched X game entries for team [Team ID]
   ```

2. **Check ESPN API Directly**
   The game might have been removed from ESPN's schedule

3. **Check Game Status**
   Games with status "COMPLETED" or "CANCELLED" might be filtered

## Quick Fix Checklist

- [ ] **RESTARTED dev server** after adding `.env.local`
- [ ] Verified API key in `.env.local`: `RAPIDAPI_BASKETBALL_KEY=137753bdbaae2a23471e3aad86e92c73`
- [ ] Checked server logs for `[API-Basketball]` messages
- [ ] Ran `node debug-api-basketball.js` to test API
- [ ] Verified prospect team names match expected values
- [ ] Checked ESPN website for Middle Tennessee vs Michigan game status

## Testing the Integration

1. **Run the debug script:**
   ```bash
   node debug-api-basketball.js
   ```

2. **Check server logs** when loading schedules:
   - Look for `[API-Basketball]` prefixed messages
   - Should see team matching and game fetching logs

3. **Check the browser console:**
   - Look for any errors related to schedule loading
   - Check network tab for API calls

## Common Issues

### "No team ID found"
- **Cause**: Team name doesn't match any mappings
- **Fix**: Add the team to `TEAM_ID_MAPPINGS` in `lib/loadSchedulesFromApiBasketball.ts`

### "No games found"
- **Cause**: API returned empty results
- **Fix**: 
  - Check if games exist in API-Basketball dashboard
  - Verify date range (games might be outside the range)
  - Check if league ID filter is too restrictive

### "API key not working"
- **Cause**: Environment variable not loaded
- **Fix**: Restart dev server after adding to `.env.local`

## Still Not Working?

1. Check the debug script output
2. Check server logs for errors
3. Verify API key is active in RapidAPI dashboard
4. Test API directly using the test script
5. Check if games exist in API-Basketball for today's date





