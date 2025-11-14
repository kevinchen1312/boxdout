# Basketball Schedule Tipoff Time Updater

This script updates tipoff times in schedule files by fetching correct times from official sources.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
playwright install chromium
```

2. Run the script:
```bash
python update_tipoff_times.py
```

## How It Works

The script:
1. Parses each schedule file to extract game information (date, opponent, home/away)
2. Fetches official schedules from:
   - EuroLeague official site (euroleaguebasketball.net)
   - EuroCup official site
   - Liga ACB official site (acb.com)
   - LNB Pro A official site (lnb.fr)
   - Fallback: SofaScore/FlashScore aggregators
3. Matches games by date and opponent (with fuzzy matching)
4. Converts local tipoff times to Eastern Time (ET)
5. Updates only the time portion in schedule files
6. Logs unmatched games to `*_unmatched.log` files

## Files Processed

- `adam_atamna_schedule.txt` (ASVEL - EuroLeague, LNB Pro A)
- `mouhamed_faye_schedule.txt` (Paris Basketball - EuroLeague, LNB Pro A)
- `sergio_de_larrea_schedule.txt` (Valencia Basket - EuroLeague, Liga ACB)
- `michael_ruzic_schedule.txt` (Joventut Badalona - EuroCup, Liga ACB)

## Notes

- The script preserves original date formats and opponent names
- Only the time portion is updated
- Games that can't be matched are logged but not modified
- Timezone conversion handles daylight saving time correctly

