# Player Search System

## Overview

Fast, unified search for both college and international basketball players using a "warm cache" approach.

## Architecture

### Two Data Sources
1. **College Players (NCAA)** - Auto-cached from ESPN
2. **International Players** - Pre-populated database

### Search Flow

```
User searches "cooper flagg"
    ↓
1. Check database for cached college players
    ├─ If found → Return instantly (~20ms) ✅
    └─ If not found ↓
2. Search ESPN API (~300ms)
    ↓
3. Auto-save to database
    ↓
4. Return results (slower first time, instant thereafter)
```

### Performance

**First Search (not cached)**:
- ~200-500ms (ESPN API call + cache)

**Repeat Search (cached)**:
- ~20-50ms (database only) ⚡

**International Players**:
- Always ~20-50ms (pre-populated)

## Database Tables

### `prospects` - College Players
```sql
id              | UUID
espn_id         | TEXT (unique)
full_name       | TEXT
position        | TEXT
team_name       | TEXT
league          | TEXT
source          | TEXT ('espn')
created_at      | TIMESTAMP
```

**Indexes**:
- `idx_prospects_full_name_lower` - Fast name search
- `idx_prospects_team_name_lower` - Team search
- `idx_prospects_source` - Filter by source
- `idx_prospects_espn_id` - ESPN ID lookups

### `player_team_mappings` - International Players
```sql
id              | SERIAL
player_id       | INTEGER (unique per season)
player_name     | TEXT
team_id         | INTEGER
team_name       | TEXT
league_id       | INTEGER
league_name     | TEXT
season          | INTEGER
position        | TEXT
jersey_number   | TEXT
country         | TEXT
age             | INTEGER
last_updated    | TIMESTAMP
```

**Indexes**:
- `idx_player_name` - Fast name search
- `idx_team_id` - Team lookups

## API Endpoints

### `/api/draft-prospects/search-external`
- Searches college players (ESPN)
- Auto-caches results to database
- Returns: ESPN prospects with team info

### `/api/players/search`
- Searches international players
- Quality filtering (removes duplicates/low-info entries)
- Returns: International prospects with team/league info

### `/api/players/search-all` (Unified - Future)
- Searches both college and international
- Single database query
- Faster than separate endpoints

## How Auto-Caching Works

1. **User searches** for a college player
2. **Database check** - Is player already cached?
3. **ESPN API** - If not, fetch from ESPN (slower)
4. **Auto-save** - Save player to database
5. **Next search** - Player found in database (instant!)

### Benefits
✅ First search builds the cache automatically
✅ No manual sync jobs needed
✅ Database grows organically with actual searches
✅ Common players (frequently searched) are always fast

### Why Not Pre-Populate Everything?

- ESPN doesn't provide a full player list API
- Recruiting rankings API structure changed
- Auto-caching is simpler and more reliable
- Only caches players users actually care about

## Search Behavior

### College Players
```typescript
// First search
"cooper flagg" → ESPN API → 300ms → Save to DB

// Second search  
"cooper flagg" → Database → 20ms ⚡
```

### International Players
```typescript
// Always fast (pre-populated)
"paris lee" → Database → 20ms ⚡
```

### Combined Search
```typescript
// SearchImportPlayer component searches both in parallel
await Promise.all([
  fetch('/api/draft-prospects/search-external'), // College (20-300ms)
  fetch('/api/players/search'),                   // International (20ms)
])
```

## Maintenance

### College Players
- ✅ Auto-cached on first search
- ✅ No manual updates needed
- ✅ Fresh data from ESPN on each search

### International Players
- 🔄 Run scanner periodically to update
- 📅 Recommended: Weekly during season
- 🎯 Command: `node scripts/scan-international-rosters.mjs`

## Quality Filtering

### International Players
Automatically filters out low-quality duplicate entries:

**Scoring System**:
- ❌ -100 points: Generic "International" league
- ❌ -50 points: Youth/U21/U19 teams
- ✅ +50 points: Specific club team
- ✅ +30 points: League information
- ✅ +5 points: Position data
- ✅ +5 points: Jersey number
- ✅ +3 points: Country
- ✅ +3 points: Age

**Result**: Only best entry per player shown
- ✅ "Paris Lee · #3 · Lyon-Villeurbanne · French LNB"
- ❌ ~~"Lee Paris · International"~~ (filtered out)

## Future Enhancements

### Option 1: Unified Endpoint
Switch frontend to use `/api/players/search-all`:
- Single database query for both sources
- ~20-50ms for all searches
- Simpler frontend code

### Option 2: Full-Text Search
Add PostgreSQL full-text search:
```sql
CREATE INDEX idx_prospects_fulltext 
ON prospects USING gin(to_tsvector('english', full_name));
```
- Even faster fuzzy matching
- Typo tolerance
- Relevance ranking

### Option 3: Elasticsearch
For very large scale:
- Dedicated search engine
- Advanced features (autocomplete, suggestions)
- ~5-10ms queries

## Testing

### Test College Search (Auto-Cache)
```bash
# Search for a college player
curl "http://localhost:3000/api/draft-prospects/search-external?q=cooper+flagg"

# First time: ~300ms (ESPN + cache)
# Second time: ~20ms (database)
```

### Test International Search
```bash
# Search for international player
curl "http://localhost:3000/api/players/search?name=paris+lee"

# Always: ~20ms (database)
```

### Check Database
```sql
-- See cached college players
SELECT COUNT(*) FROM prospects WHERE source = 'espn';

-- See international players
SELECT COUNT(*) FROM player_team_mappings WHERE season = 2025;
```

## Troubleshooting

### Slow Searches
- **First search for player**: Normal (~300ms) - will be faster next time
- **All searches slow**: Check database indexes
- **Timeout errors**: ESPN API might be down

### Missing Players
- **College**: Search once to cache, or check ESPN availability
- **International**: Run scanner to update database

### Duplicate Results
- **International**: Quality filtering should remove (check scoring logic)
- **College**: Auto-caching creates one entry per ESPN ID

## Summary

✅ **College Players**: Auto-cached from ESPN (20-300ms)
✅ **International Players**: Pre-populated database (20ms)
✅ **No manual syncing** required for college players
✅ **Progressively faster** as more players are searched
✅ **Quality filtering** removes duplicate/low-info entries

The system automatically gets faster over time as users search for players! 🚀




