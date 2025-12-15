# Performance Optimization Plan for ProspectCal

## Current Issues
- **Loading Time**: 2-5+ seconds to load calendar entries
- **Data Volume**: 100 schedule files, ~multiple MB of data
- **Processing**: Heavy computation on every page load
- **No Caching**: Neither HTTP nor browser caching implemented

## Optimization Strategies (Prioritized)

### 🔴 **Critical - Immediate Impact (Implement First)**

#### 1. **Add HTTP Cache Headers to API Routes**
**Impact**: 90% reduction in load time for repeat visits
**Effort**: Low (30 minutes)

Add cache headers to `/api/games/all`:
```typescript
// Cache for 5 minutes (300 seconds)
return NextResponse.json(
  { games: gamesByDate, source },
  {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  }
);
```

#### 2. **Implement Browser-Side Caching with IndexedDB**
**Impact**: Instant loading for repeat visits
**Effort**: Medium (2-3 hours)

Store fetched data in IndexedDB with timestamp:
- Cache valid for 5-10 minutes
- Serve instantly from cache while revalidating in background
- Only fetch when cache is stale

#### 3. **Use Next.js Static Generation for Initial Data**
**Impact**: Near-instant initial load
**Effort**: Medium (2-3 hours)

Pre-generate game data at build time:
```typescript
// Generate static JSON file at build time
// Serve directly, update periodically
```

### 🟡 **High Priority - Significant Impact**

#### 4. **Implement On-Demand Loading (Lazy Loading)**
**Impact**: 80% reduction in initial payload
**Effort**: Medium (3-4 hours)

Instead of loading ALL games:
- Load only current week/month initially
- Load additional data as user navigates
- Use `/api/games/range?start=YYYY-MM-DD&end=YYYY-MM-DD`

#### 5. **Add Server-Side Redis/File Cache**
**Impact**: 95% reduction in processing time
**Effort**: Medium-High (4-6 hours)

Cache processed data in Redis or filesystem:
- Cache key: `schedules:${source}:${timestamp}`
- Invalidate every 5-10 minutes
- Share cache across all requests

#### 6. **Optimize loadSchedules Function**
**Impact**: 50% reduction in processing time
**Effort**: Medium (2-3 hours)

Optimizations:
- Parallel file reading with `Promise.all()`
- Reduce external API calls (batch requests)
- Stream processing instead of loading all into memory
- Remove unnecessary enrichment calls

### 🟢 **Medium Priority - Incremental Improvements**

#### 7. **Use Streaming/Progressive Loading**
**Impact**: Perceived load time reduction
**Effort**: High (6-8 hours)

Stream data to client as it's processed:
- Send games day-by-day
- Client renders progressively
- Better perceived performance

#### 8. **Implement Service Worker Cache**
**Impact**: Offline support + instant loads
**Effort**: High (6-8 hours)

Cache API responses in service worker:
- Instant repeat loads
- Background updates
- Offline capability

#### 9. **Pre-compute and Store Game Data**
**Impact**: Eliminate processing entirely
**Effort**: High (8+ hours)

Generate static JSON files:
- Run processing script periodically (cron job)
- Store results in public folder or database
- API serves pre-computed data only

### 🔵 **Low Priority - Nice to Have**

#### 10. **Add Database Layer**
**Impact**: Professional scalability
**Effort**: Very High (12+ hours)

Replace file-based storage:
- PostgreSQL/MongoDB for schedules
- Proper indexing for fast queries
- Real-time updates

#### 11. **Implement GraphQL with DataLoader**
**Impact**: Optimized queries
**Effort**: Very High (16+ hours)

- Client requests only needed fields
- Automatic batching and deduplication
- Better API design

## **Recommended Implementation Order**

### Phase 1: Quick Wins (Day 1)
1. Add HTTP cache headers ✅
2. Optimize file loading with parallel processing ✅
3. Implement browser-side caching (localStorage/IndexedDB) ✅

**Expected Result**: Load time reduced from 3-5s to 0.1-0.5s

### Phase 2: Smart Loading (Day 2-3)
4. Implement lazy loading by date range ✅
5. Add loading skeleton/progressive rendering ✅

**Expected Result**: Initial load < 200ms, perceived instant

### Phase 3: Production Ready (Week 2)
6. Add Redis/file-based cache ✅
7. Implement service worker ✅
8. Set up automatic cache invalidation ✅

**Expected Result**: Production-grade performance

## Technical Implementation Details

### HTTP Caching Strategy
```typescript
// Aggressive caching for static data
'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600'

// Explanation:
// - public: Can be cached by CDN and browsers
// - max-age=300: Browser caches for 5 minutes
// - s-maxage=300: CDN caches for 5 minutes
// - stale-while-revalidate=600: Serve stale content for 10 min while revalidating
```

### IndexedDB Schema
```typescript
interface CachedData {
  source: 'espn' | 'myboard';
  timestamp: number;
  games: GamesByDate;
  expiresAt: number;
}
```

### Lazy Loading Strategy
```typescript
// Instead of: fetch('/api/games/all')
// Use: fetch('/api/games/range?start=2024-11-01&end=2024-11-30')

// Load current month initially
// Load adjacent months on scroll/navigation
// Prefetch visible date ranges
```

## Metrics to Track

### Before Optimization
- Initial load: 3-5 seconds
- Payload size: ~2-5 MB
- Server processing: 2-4 seconds
- Repeat visits: Same as initial

### Target After Optimization
- Initial load: < 200ms
- Payload size: < 100 KB (lazy loaded)
- Server processing: < 50ms (cached)
- Repeat visits: < 50ms (browser cache)

## Testing Checklist

- [ ] Test with cold cache
- [ ] Test with warm cache
- [ ] Test with slow 3G network
- [ ] Test cache invalidation
- [ ] Test concurrent requests
- [ ] Monitor memory usage
- [ ] Test across different browsers
- [ ] Verify data freshness

## Monitoring

Add performance monitoring:
```typescript
// Track API response times
console.time('loadSchedules');
const result = await loadAllSchedules();
console.timeEnd('loadSchedules');

// Track client-side rendering
performance.mark('games-fetch-start');
// ... fetch games
performance.mark('games-fetch-end');
performance.measure('games-fetch', 'games-fetch-start', 'games-fetch-end');
```

## Notes

- **Cache Invalidation**: Currently based on file modification times. Consider:
  - Time-based (every 5 minutes)
  - Event-based (when schedules update)
  - Manual trigger via API endpoint
  
- **Data Freshness**: Balance between performance and freshness
  - Game schedules don't change frequently
  - 5-10 minute cache is acceptable
  - Live scores would need different strategy

- **CDN Integration**: If deployed to Vercel/Netlify:
  - Leverage edge caching
  - Use ISR (Incremental Static Regeneration)
  - Revalidate every 5 minutes







