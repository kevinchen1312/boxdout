# Cron Setup for Self-Hosted Deployment

This guide explains how to set up the automatic cache refresh for today's games when self-hosting the application.

## Overview

The application uses a cron job to refresh today's game schedule every minute, ensuring users see data in <1 second on first visit. On Vercel, this is configured automatically via `vercel.json`. For self-hosted deployments, you need to set up a cron job manually.

## Quick Setup

### 1. Set Environment Variable

Add this to your `.env.local` file:

```bash
CRON_SECRET=your_random_secure_secret_here
```

Generate a secure secret:
```bash
# On Linux/Mac:
openssl rand -base64 32

# Or use any random string generator
```

### 2. Configure Cron Job

#### Option A: Using system crontab (Linux/Mac)

Open crontab:
```bash
crontab -e
```

Add this line (replace `YOUR_DOMAIN` and `YOUR_SECRET`):
```bash
* * * * * curl -X POST https://YOUR_DOMAIN.com/api/cron/refresh-today -H "Authorization: Bearer YOUR_SECRET" >> /var/log/prospectcal-cron.log 2>&1
```

This will:
- Run every minute (`* * * * *`)
- Call the cache refresh endpoint
- Log output to `/var/log/prospectcal-cron.log`

#### Option B: Using a cron service (e.g., cron-job.org, EasyCron)

1. Sign up for a cron service
2. Create a new cron job with:
   - **URL**: `https://YOUR_DOMAIN.com/api/cron/refresh-today`
   - **Method**: `POST`
   - **Schedule**: Every 1 minute
   - **Headers**: 
     - `Authorization: Bearer YOUR_SECRET`
3. Save and activate

#### Option C: Using GitHub Actions (if hosted on a VPS)

Create `.github/workflows/cache-refresh.yml`:

```yaml
name: Refresh Today's Games Cache

on:
  schedule:
    # Run every minute
    - cron: '* * * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - name: Call cache refresh endpoint
        run: |
          curl -X POST https://YOUR_DOMAIN.com/api/cron/refresh-today \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

Add `CRON_SECRET` to your GitHub repository secrets.

#### Option D: Using PM2 (if using Node.js process manager)

Create a separate script `scripts/refresh-cache.js`:

```javascript
const fetch = require('node-fetch');

const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function refreshCache() {
  try {
    const response = await fetch(`${BASE_URL}/api/cron/refresh-today`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
      },
    });
    
    const data = await response.json();
    console.log('[Refresh]', new Date().toISOString(), data);
  } catch (error) {
    console.error('[Refresh] Error:', error);
  }
}

refreshCache();
```

Add to PM2 ecosystem file:

```javascript
module.exports = {
  apps: [
    {
      name: 'prospectcal',
      script: 'npm',
      args: 'start',
    },
    {
      name: 'cache-refresh',
      script: 'node',
      args: 'scripts/refresh-cache.js',
      cron_restart: '*/1 * * * *', // Every minute
      autorestart: false,
    },
  ],
};
```

## Verification

### Test the endpoint manually:

```bash
curl -X POST http://localhost:3000/api/cron/refresh-today \
  -H "Authorization: Bearer YOUR_SECRET" \
  -v
```

Expected response:
```json
{
  "success": true,
  "timestamp": "2025-01-20T12:00:00.000Z",
  "date": "2025-01-20",
  "results": [
    {
      "source": "espn",
      "success": true,
      "games": 15,
      "timeMs": 2500
    }
  ],
  "totalGames": 15
}
```

### Check if cache is working:

```bash
# First request (cache miss - slower)
time curl http://localhost:3000/api/games/today?source=espn

# Second request (cache hit - fast)
time curl http://localhost:3000/api/games/today?source=espn
```

The second request should be significantly faster (<100ms).

### Monitor cron execution:

```bash
# View cron logs
tail -f /var/log/prospectcal-cron.log

# Or check server logs
pm2 logs prospectcal
```

## Troubleshooting

### Cron job not running

1. Check cron service is running:
   ```bash
   sudo systemctl status cron
   ```

2. Verify crontab entry:
   ```bash
   crontab -l
   ```

3. Check cron logs:
   ```bash
   grep CRON /var/log/syslog
   ```

### 401 Unauthorized errors

- Verify `CRON_SECRET` is set in `.env.local`
- Check the Authorization header matches the secret
- Restart the server after changing `.env.local`

### Cache not being used

1. Check Supabase connection:
   ```bash
   # Test in Node.js console
   const { supabaseAdmin } = require('./lib/supabase');
   await supabaseAdmin.from('game_cache').select('*').limit(1);
   ```

2. Verify table exists:
   - Log into Supabase dashboard
   - Check if `game_cache` table exists
   - Run the migration: `supabase/migrations/20250120_create_game_cache.sql`

3. Check server logs for cache errors:
   ```bash
   grep "\[Cache\]" logs/server.log
   ```

## Performance Expectations

With cron configured:
- **First visit**: <100ms (reads from pre-computed cache)
- **Cache refresh**: Runs in background every minute
- **Cache freshness**: Always <1 minute old
- **Fallback**: If cache fails, falls back to live fetch

## Environment Variables

Required:
- `CRON_SECRET` - Secret token to protect cron endpoint
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for admin operations)

Optional:
- `BASE_URL` - Base URL for cron scripts (default: http://localhost:3000)

## Notes

- The cron job only refreshes the 'espn' source
- Users with custom boards ('myboard' source) will use live fetch or client-side cache
- On Vercel, cron is configured automatically via `vercel.json`
- Cache is stored in Supabase, so it persists across server restarts





