# API-Basketball Integration Guide

This guide explains how to use the API-Basketball Pro plan to fetch schedules for international prospects.

## Overview

The API-Basketball integration allows you to fetch game schedules for prospects playing in international leagues like:
- **EuroLeague** (league ID: 120)
- **Liga ACB** (Spanish league, league ID: 117)
- **LNB Pro A** (French league, league ID: 118)
- **Basketball Champions League** (league ID: 119)

## Setup

### 1. Get Your API Key

You already have a Pro plan subscription with API-Basketball. Your API key is:
```
137753bdbaae2a23471e3aad86e92c73
```

### 2. Configure Environment Variable (Optional)

For production, set the API key as an environment variable:

```bash
# .env.local
RAPIDAPI_BASKETBALL_KEY=137753bdbaae2a23471e3aad86e92c73
```

If not set, it will default to the key above.

## How It Works

### Team Mapping

The integration uses a mapping system to match prospect team names to API-Basketball team IDs. Currently mapped teams:

| Prospect Team Name | API-Basketball Team ID | League |
|-------------------|----------------------|--------|
| Valencia Basket | 2341 | EuroLeague (120) |
| ASVEL / LDLC ASVEL | 26 | EuroLeague (120) |
| Paris Basketball | 108 | EuroLeague (120) |
| Joventut Badalona | 2334 | Liga ACB (117) |

### Adding New Teams

To add support for a new team:

1. **Find the team ID** using the test script:
   ```bash
   node test-api-basketball-integration.js
   ```

2. **Update the mapping** in `lib/loadSchedulesFromApiBasketball.ts`:
   ```typescript
   const TEAM_ID_MAPPINGS: Record<string, { teamId: number; leagueId?: number; leagueName?: string }> = {
     // Add your new team
     'yourteamname': { teamId: 1234, leagueId: 120, leagueName: 'Euroleague' },
   };
   ```

3. **Update the detection function** if needed:
   ```typescript
   export function canUseApiBasketball(prospect: Prospect): boolean {
     // Add your team name to the check
   }
   ```

## Testing

Run the test script to verify the integration:

```bash
node test-api-basketball-integration.js
```

This will:
1. Search for known teams
2. Fetch their schedules
3. Display sample game data

## Integration Points

The integration is automatically used when:

1. A prospect's team matches a known API-Basketball team
2. The `canUseApiBasketball()` function returns `true`
3. The schedule loading system prioritizes API-Basketball over scrapers

### Priority Order

1. **College Basketball** (ESPN API)
2. **NBL** (ESPN API)
3. **API-Basketball** (for international leagues) ⭐ **NEW**
4. **Scrapers** (fallback for unsupported teams)
5. **Text Files** (legacy/manual schedules)

## API Endpoints Used

- **Team Search**: `GET /teams?search={teamName}`
- **Team Games**: `GET /games?team={teamId}&season={year}&league={leagueId}`
- **Date Range**: `GET /games?date={date}`

## Rate Limits

Your Pro plan includes:
- **7,500 requests per day**
- All endpoints and competitions

The integration batches requests (3 prospects at a time) to avoid hitting rate limits.

## Troubleshooting

### No games found for a team

1. **Verify team ID**: Use the test script to confirm the team ID
2. **Check season**: Make sure you're querying the correct season year
3. **Check league**: Some teams play in multiple leagues - try without league filter
4. **Check date range**: Games might be outside the current season

### Team not found

1. **Search manually**: Use the API-Basketball dashboard to find the team
2. **Add mapping**: Update `TEAM_ID_MAPPINGS` with the correct team ID
3. **Check spelling**: Team names must match exactly (case-insensitive, normalized)

### API errors

1. **Check API key**: Verify your key is correct and active
2. **Check subscription**: Ensure Pro plan is active
3. **Check rate limits**: You might have hit the daily limit
4. **Check network**: Ensure server can reach RapidAPI

## Example Usage

The integration is automatic - no code changes needed! Just ensure:

1. Your prospects have the correct team names
2. Team mappings are configured
3. API key is set (or using default)

Example prospect that will use API-Basketball:
```typescript
{
  name: "Sergio de Larrea",
  team: "Valencia Basket",
  rank: 31
}
```

This will automatically fetch schedules from API-Basketball because "Valencia Basket" is mapped to team ID 2341.

## Next Steps

1. ✅ Test the integration with `test-api-basketball-integration.js`
2. ✅ Add more team mappings as needed
3. ✅ Monitor API usage in RapidAPI dashboard
4. ✅ Verify schedules are loading correctly in your app

## Support

- **API Documentation**: https://rapidapi.com/api-sports/api/api-basketball
- **RapidAPI Dashboard**: Check your usage and limits
- **Test Script**: `test-api-basketball-integration.js` for debugging





