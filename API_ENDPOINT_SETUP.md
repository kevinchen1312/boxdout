# API-Sports Endpoint Setup

## Issue
The code is currently trying to connect to API-Sports but the endpoint format needs to be verified.

## What We Need From You

1. **Check your API-Sports dashboard** and find:
   - The exact API endpoint/base URL
   - Any documentation links
   - Example API calls or curl commands

2. **Verify your API key** in `.env.local`:
   - Make sure it matches the one shown in your dashboard
   - The key should be: `137753bd...` (check first 8 chars match)

## Common API-Sports Endpoint Formats

The API might use one of these formats:
- `https://v1.api-sport.io/basketball`
- `https://api.api-sport.io/basketball`
- `https://api.api-sport.io/basketball/v1`
- A different format entirely

## Next Steps

Once you provide the correct endpoint, I'll update the code to use it. You can also set it manually in `.env.local`:

```bash
API_SPORTS_ENDPOINT=https://your-actual-endpoint-here
API_SPORTS_BASKETBALL_KEY=your-api-key-here
```

Then restart your dev server.





