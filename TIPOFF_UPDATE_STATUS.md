# Tipoff Time Update Script - Status

## What's Been Created

1. **`update_tipoff_times.py`** - Main script with complete structure:
   - Parses schedule files and extracts game info
   - Fetches schedules from official sources (structure ready, needs site-specific parsing)
   - Matches games by date/opponent with fuzzy matching
   - Converts local times to ET
   - Updates only time portions in files
   - Logs unmatched games

2. **`test_parsing.py`** - Test script to verify parsing logic works

3. **`requirements.txt`** - Python dependencies

4. **`README_TIPOFF_UPDATE.md`** - Usage instructions

## Current Status

✅ **Complete:**
- File parsing and game extraction logic
- Date/time parsing and formatting
- Timezone conversion (local → ET)
- Fuzzy team name matching
- File update logic (preserves format, updates only times)
- Error handling and logging structure

⚠️ **Needs Enhancement:**
- Actual HTML parsing for each official site:
  - EuroLeague (euroleaguebasketball.net) - JavaScript-heavy, needs Playwright
  - EuroCup (euroleaguebasketball.net/eurocup) - Similar structure
  - Liga ACB (acb.com) - Need to inspect HTML structure
  - LNB Pro A (lnb.fr) - Need to inspect HTML structure

## Next Steps

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   playwright install chromium
   ```

2. **Test parsing logic:**
   ```bash
   python test_parsing.py
   ```

3. **Enhance scraping functions:**
   - Inspect each official site's HTML structure
   - Add site-specific parsing logic in:
     - `fetch_euroleague_schedule_web()`
     - `fetch_eurocup_schedule_web()`
     - `fetch_acb_schedule_web()`
     - `fetch_lnb_schedule_web()`
   
   Or use aggregator sites (SofaScore/FlashScore) which may be easier to parse.

4. **Run the script:**
   ```bash
   python update_tipoff_times.py
   ```

## Site-Specific Parsing Notes

The script uses Playwright for JavaScript-heavy sites. Each fetch function needs to:
1. Navigate to the schedule page
2. Wait for content to load
3. Extract game data (date, opponent, time, home/away)
4. Parse times and convert to datetime objects
5. Return list of `OfficialGame` objects

Example structure needed:
```python
def fetch_euroleague_schedule_web(team_slug, team_tz, team_name):
    games = []
    # Use Playwright to load page
    # Parse HTML/JSON to extract games
    # Convert to OfficialGame objects
    return games
```

## Testing Approach

1. Start with one team/league to verify the flow works
2. Test matching logic with known games
3. Verify timezone conversion is correct
4. Then expand to all teams/leagues







