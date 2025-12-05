# How to Find Your API Endpoint

Based on your dashboard URL (`dashboard.api-football.com`), here's where to find the endpoint:

## Option 1: Check API Documentation
1. Go to your API-Sports dashboard
2. Look for a "Documentation" or "API Docs" link (usually in the top menu or sidebar)
3. The documentation will show the base URL/endpoint

## Option 2: Check Your Dashboard
1. In your dashboard, look for:
   - "API Endpoint" or "Base URL" section
   - "Quick Start" or "Getting Started" guide
   - Any example code snippets (they'll show the endpoint)

## Option 3: Common API-Sports Endpoints
Based on the dashboard domain (`api-football.com`), try these:

**For Basketball API:**
- `https://v1.api-sport.io/basketball`
- `https://api.api-sport.io/basketball`
- `https://api-basketball.com/api`

**The endpoint format is usually:**
```
https://[domain]/basketball/[endpoint]
```

For example:
- Teams: `GET https://v1.api-sport.io/basketball/teams?search=Valencia`
- Games: `GET https://v1.api-sport.io/basketball/games?team=2334&date=2025-11-19`

## What to Look For
In your dashboard, look for:
- ✅ "Base URL" or "API Endpoint"
- ✅ Example API calls/curl commands
- ✅ Documentation link
- ✅ "Quick Start" guide

## Once You Find It
Update your `.env.local`:
```bash
API_SPORTS_ENDPOINT=https://your-endpoint-here
API_SPORTS_BASKETBALL_KEY=137753bdboce20234730692c73
```

Then restart your dev server.





