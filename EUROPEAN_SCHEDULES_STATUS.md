# European Game Schedule Verification Status

## Summary

The European player schedules currently have times populated, but these came from RealGM which you identified as an unreliable source. Official league website scraping has proven challenging due to:

1. **Heavy JavaScript rendering** - Sites load dynamically and require complex browser automation
2. **Frequent layout changes** - Selectors break between seasons
3. **JavaScript errors** - Some pages fail to load properly (e.g., "Application error: a client-side exception has occurred")

## Current Players & Leagues

### 1. **Adam Atamna** (ASVEL)
- **Leagues**: EuroLeague + LNB Pro A (French)
- **Status**: ⚠️ Schedule shows "EUROLEAGUE" but RealGM source says EuroCup
- **Games with times**: 39 EuroLeague games, 24 LNB Pro A games
- **Typical times**: 2:00 PM ET, 2:30 PM ET, 2:45 PM ET
- **Official sources**:
  - EuroLeague: https://www.euroleaguebasketball.net/euroleague/teams/asvel/schedule/
  - LNB: https://www.lnb.fr/

### 2. **Sergio de Larrea** (Valencia Basket)
- **Leagues**: EuroLeague + Liga ACB (Spanish)
- **Status**: ✅ Correct leagues identified
- **Games with times**: 38 EuroLeague games, 34 ACB games
- **Typical times**: 2:00 PM ET, 2:30 PM ET, 2:45 PM ET (EuroLeague), 6:30 AM - 2:00 PM ET (ACB)
- **Official sources**:
  - EuroLeague: https://www.euroleaguebasketball.net/euroleague/teams/valencia/schedule/
  - ACB: https://www.acb.com/club/valencia-basket/calendario

### 3. **Mouhamed Faye** (Paris Basketball)
- **Leagues**: EuroLeague + LNB Pro A (French)
- **Status**: ✅ Correct leagues identified
- **Games with times**: 38 EuroLeague games, 22 LNB Pro A games
- **Typical times**: 2:45 PM ET (Paris home), 2:00-2:30 PM ET (away), various LNB times
- **Official sources**:
  - EuroLeague: https://www.euroleaguebasketball.net/euroleague/teams/paris-basketball/schedule/
  - LNB: https://www.lnb.fr/

### 4. **Michael Ruzic** (Joventut Badalona)
- **Leagues**: Basketball Champions League (BCL) + Liga ACB (Spanish)
- **Status**: ⚠️ Schedule incorrectly labeled "EUROCUP" - actually BCL
- **Games with times**: 6 BCL games, 34 ACB games
- **Typical times**: Various (BCL has different schedule than EuroLeague/EuroCup)
- **Official sources**:
  - BCL: https://www.championsleague.basketball/
  - ACB: https://www.acb.com/club/joventut-badalona/calendario

## Issues Found

1. **Adam Atamna**: Source says EuroCup but schedule shows EuroLeague games. Need to verify which league ASVEL is actually in for 2025-26.

2. **Michael Ruzic**: Labeled as "EUROCUP" but is actually in Basketball Champions League (completely different competition).

3. **No BCL scraper**: The TypeScript fetch scripts don't have a Basketball Champions League scraper yet.

## Time Patterns Observed

Based on the current schedules (from RealGM):

### EuroLeague Games
- **Most common**: 2:00 PM ET, 2:30 PM ET, 2:45 PM ET
- **Reasoning**: European games typically start 18:00-21:00 local time (CET/CEST)
  - 18:00 CET = 12:00 PM ET
  - 19:00 CET = 1:00 PM ET
  - 20:00 CET = 2:00 PM ET
  - 20:30 CET = 2:30 PM ET
  - 20:45 CET = 2:45 PM ET

### Liga ACB Games
- **Range**: 6:30 AM ET (12:30 PM local) to 2:00 PM ET (8:00 PM local)
- **Most common**: 11:00 AM - 2:00 PM ET

### LNB Pro A Games
- **Range**: 10:30 AM ET to 3:00 PM ET
- **Most common**: 2:00 PM ET, 2:30 PM ET

## Recommended Next Steps

### Option 1: Manual Spot-Check Verification
Instead of fully automated scraping, manually verify a sample of upcoming games:
1. Check 3-5 upcoming games for each player on their official team website
2. Update the patterns if they differ significantly
3. Use the pattern to validate the rest

### Option 2: Alternative Data Sources
- **FlashScore API**: More reliable, less prone to breaking
- **SofaScore API**: Good for European basketball
- **Official EuroLeague API** (if available): Direct data feed

### Option 3: Fix the TypeScript Scrapers
- Debug the EuroLeague scraper to handle the new website structure
- Add proper error handling for JavaScript-heavy pages
- Add BCL scraper for Michael Ruzic

### Option 4: ESPN International
- Check if ESPN has international game times
- Their API might be more stable than scraping league sites

## Quick Validation

To quickly check if current times are reasonable:
- European evening games (7-9 PM local) → 1-3 PM ET (winter) / 12-2 PM ET (summer)
- Weekend matinees (12-2 PM local) → 6-8 AM ET (winter) / 5-7 AM ET (summer)

The current times in the schedules follow these patterns, suggesting they may be approximately correct despite coming from RealGM.

