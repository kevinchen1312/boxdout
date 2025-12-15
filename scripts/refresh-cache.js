#!/usr/bin/env node

/**
 * Manual cache refresh script
 * 
 * This script manually triggers the cache refresh endpoint to populate
 * the Supabase cache with today's games.
 * 
 * Usage:
 *   node scripts/refresh-cache.js
 * 
 * Or set up as a local cron job:
 *   * * * * * cd /path/to/prospectcal && node scripts/refresh-cache.js >> /var/log/cache-refresh.log 2>&1
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;

async function refreshCache() {
  const url = new URL('/api/cron/refresh-today', BASE_URL);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;
  
  const options = {
    method: 'POST',
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  // Add authorization header if CRON_SECRET is set
  if (CRON_SECRET) {
    options.headers['Authorization'] = `Bearer ${CRON_SECRET}`;
  }
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const duration = Date.now() - startTime;
        
        try {
          const result = JSON.parse(data);
          
          if (res.statusCode === 200) {
            console.log(`✓ Cache refresh successful (${duration}ms)`);
            console.log(`  Date: ${result.date}`);
            console.log(`  Total games: ${result.totalGames}`);
            
            if (result.results) {
              result.results.forEach(r => {
                console.log(`  ${r.source}: ${r.success ? '✓' : '✗'} ${r.games} games in ${r.timeMs.toFixed(0)}ms`);
              });
            }
            
            resolve(result);
          } else {
            console.error(`✗ Cache refresh failed (${res.statusCode})`);
            console.error(`  Response: ${data}`);
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (err) {
          console.error(`✗ Failed to parse response: ${err.message}`);
          console.error(`  Response: ${data}`);
          reject(err);
        }
      });
    });
    
    req.on('error', (err) => {
      console.error(`✗ Request failed: ${err.message}`);
      reject(err);
    });
    
    req.end();
  });
}

// Run the refresh
console.log(`[${new Date().toISOString()}] Starting cache refresh...`);
console.log(`  Target: ${BASE_URL}/api/cron/refresh-today`);
console.log(`  Auth: ${CRON_SECRET ? 'Yes' : 'No (using local development mode)'}`);
console.log('');

refreshCache()
  .then(() => {
    console.log('');
    console.log('Cache refresh complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('');
    console.error('Cache refresh failed:', err.message);
    process.exit(1);
  });






