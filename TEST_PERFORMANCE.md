# Performance Testing Guide

## How to Test the Performance Improvements

### 1. Start the Development Server

```bash
npm run dev
```

### 2. Test Cold Cache (First Load)

1. Open browser DevTools (F12)
2. Go to Application > Storage > Clear site data (or localStorage)
3. Go to Network tab
4. Navigate to http://localhost:3000
5. Observe:
   - Network request to `/api/games/all`
   - Console logs showing timing:
     ```
     [useGames] Total load time: 2345.678ms
     [API] loadAllSchedules-espn: 1234.567ms
     [Schedule] buildSchedules total: 1234.567ms
     [Schedule] parseScheduleFiles (parallel): 456.789ms
     ```

### 3. Test Warm Cache (Second Load - within 5 minutes)

1. Keep browser open
2. Refresh the page (F5)
3. Observe in Console:
   ```
   [Cache] Hit for games_all_espn, age: 23s
   [useGames] Loaded from cache
   [useGames] Total load time: 12.345ms
   ```
4. Check Network tab:
   - May see a request to `/api/games/all` with status 304 (Not Modified)
   - Or may see no request at all (served from browser cache)

### 4. Test Stale Cache (5-10 minutes later)

1. Wait 5-6 minutes after loading
2. Refresh the page
3. Observe:
   - Page loads instantly from stale cache
   - Background revalidation happens
   - New data silently replaces old data

### 5. Check Cache Headers

```bash
curl -I http://localhost:3000/api/games/all
```

Should see:
```
HTTP/1.1 200 OK
Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=600
X-Generated-At: 2024-11-13T12:34:56.789Z
...
```

### 6. Monitor Server Performance

In the terminal where `npm run dev` is running, watch for:

```
[Schedule] Found 100 schedule files
[Schedule] parseScheduleFiles (parallel): 456.789ms
[Schedule] aggregateGames: 123.456ms
[Schedule] enrichWithBroadcasts: 234.567ms
[Schedule] buildSchedules total: 1234.567ms
[API] loadAllSchedules-espn: 1234.567ms
```

Compare parallel vs sequential:
- **Before** (sequential): ~2-4 seconds
- **After** (parallel): ~1-2 seconds (50% improvement)

## Performance Benchmarks

### Expected Timing Breakdown

#### First Load (Cold Cache)
```
Total: 2-4 seconds
├── API Request: 100-300ms (network)
├── Server Processing: 1-2s
│   ├── Team Directory: 200-400ms
│   ├── Jersey Data: 300-500ms
│   ├── Parse Files (parallel): 400-600ms
│   ├── Aggregate Games: 100-200ms
│   └── Enrich Broadcasts: 200-400ms
├── Network Transfer: 200-500ms (2-5 MB)
└── JSON Parse: 100-200ms
```

#### Second Load (Warm Cache)
```
Total: < 50ms
├── localStorage read: 5-10ms
├── JSON parse: 10-20ms
├── React render: 10-20ms
└── Background revalidation: async (doesn't block)
```

#### Subsequent Loads (HTTP Cache)
```
Total: 100-300ms
├── API Request (304): 50-100ms
├── Cache validation: 10-20ms
└── React render: 40-80ms
```

## Cache Debugging

### Check Cache Status

In browser console:
```javascript
// See what's cached
Object.keys(localStorage).filter(k => k.startsWith('prospectcal_cache_'))

// Get cache stats
import { getCacheStats } from './app/utils/browserCache';
console.log(getCacheStats());
```

### Clear Cache

```javascript
// Clear all cache
localStorage.clear();

// Or specific entry
localStorage.removeItem('prospectcal_cache_games_all_espn');
```

### Force Fresh Load

```
http://localhost:3000?nocache=true
```
(Note: This parameter isn't implemented yet, just showing the pattern)

## Common Issues & Solutions

### Issue: Cache not working

**Symptoms**: Every load takes 2-4 seconds

**Solutions**:
1. Check if localStorage is enabled:
   ```javascript
   console.log(typeof localStorage); // should be 'object'
   ```
2. Check browser console for errors
3. Clear and retry:
   ```javascript
   localStorage.clear();
   location.reload();
   ```

### Issue: Stale data shown

**Symptoms**: Old games/prospects showing after updates

**Solutions**:
1. Clear cache: `localStorage.clear()`
2. Wait for automatic expiration (5 minutes)
3. Check if background revalidation is working

### Issue: Slow first load

**Symptoms**: > 5 seconds on first load

**Possible causes**:
1. Slow network connection
2. Server cold start
3. Many prospects/games to process
4. ESPN API slow to respond

**Solutions**:
1. Check Network tab for bottlenecks
2. Check server logs for slow operations
3. Consider increasing cache TTL
4. Implement pre-computed static data

## Performance Monitoring

### Add Custom Timing

```typescript
// In any component
performance.mark('start-operation');
// ... do work ...
performance.mark('end-operation');
performance.measure('operation-time', 'start-operation', 'end-operation');

const measures = performance.getEntriesByType('measure');
console.log(measures);
```

### Monitor Network Waterfall

1. Open DevTools > Network tab
2. Filter by "Fetch/XHR"
3. Look for `/api/games/all`
4. Check:
   - Request time
   - Response time
   - Transfer size
   - Cache status

### Monitor Memory Usage

1. Open DevTools > Memory tab
2. Take heap snapshot before load
3. Load the page
4. Take heap snapshot after load
5. Compare to check for leaks

## Production Testing

### Deploy to Vercel/Netlify

```bash
npm run build
npm start
```

### Test with Lighthouse

1. Open DevTools > Lighthouse
2. Run audit
3. Check:
   - First Contentful Paint (target: < 1s)
   - Time to Interactive (target: < 2s)
   - Speed Index (target: < 2s)

### Test with WebPageTest

1. Go to https://www.webpagetest.org/
2. Enter your deployed URL
3. Run test
4. Check:
   - First Byte Time
   - Start Render
   - Document Complete
   - Fully Loaded

## Expected Results

### Before Optimization
```
First Load:        3-5s
Repeat Load:       3-5s
Payload Size:      2-5 MB
Server Time:       2-4s
Cache Hit Rate:    0%
Lighthouse Score:  70-80
```

### After Optimization
```
First Load:        2-4s     (20% faster)
Repeat Load:       < 50ms   (99% faster)
Payload Size:      2-5 MB   (same, but cached)
Server Time:       1-2s     (50% faster)
Cache Hit Rate:    80-90%
Lighthouse Score:  85-95
```

## Next Steps

If performance is still not satisfactory:

1. **Implement lazy loading**: Load only current month
2. **Add Redis cache**: Share cache across instances
3. **Pre-compute data**: Generate static JSON files
4. **Optimize payload**: Send only needed fields
5. **Add compression**: Enable gzip/brotli
6. **Use CDN**: Serve from edge locations







