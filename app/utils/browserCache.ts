/**
 * Browser-side caching utility for API responses
 * Uses localStorage for simple, fast caching
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

const CACHE_PREFIX = 'prospectcal_cache_';

/**
 * Get data from cache if it exists and is not expired
 */
export function getCachedData<T>(key: string): T | null {
  try {
    const cacheKey = CACHE_PREFIX + key;
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    const entry: CacheEntry<T> = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache has expired
    if (now > entry.expiresAt) {
      // Don't remove expired cache - we'll use it as stale data
      console.log(`[Cache] Expired for ${key}, age: ${Math.round((now - entry.timestamp) / 1000)}s (but keeping for stale display)`);
      return entry.data; // Return stale data instead of null
    }
    
    console.log(`[Cache] Hit for ${key}, age: ${Math.round((now - entry.timestamp) / 1000)}s`);
    return entry.data;
  } catch (error) {
    console.error('[Cache] Error reading from cache:', error);
    return null;
  }
}

/**
 * Get stale cache data even if expired (for immediate display while fresh data loads)
 */
export function getStaleCachedData<T>(key: string): T | null {
  try {
    const cacheKey = CACHE_PREFIX + key;
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    const entry: CacheEntry<T> = JSON.parse(cached);
    const now = Date.now();
    const age = Math.round((now - entry.timestamp) / 1000);
    
    if (now > entry.expiresAt) {
      console.log(`[Cache] Using stale data for ${key}, age: ${age}s`);
    } else {
      console.log(`[Cache] Using fresh data for ${key}, age: ${age}s`);
    }
    
    return entry.data;
  } catch (error) {
    console.error('[Cache] Error reading stale cache:', error);
    return null;
  }
}

/**
 * Store data in cache with expiration time
 */
export function setCachedData<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): void {
  try {
    const cacheKey = CACHE_PREFIX + key;
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(entry));
    console.log(`[Cache] Stored ${key}, TTL: ${Math.round(ttlMs / 1000)}s`);
  } catch (error) {
    // localStorage might be full or disabled
    console.error('[Cache] Error writing to cache:', error);
    
    // Try to clear old entries if storage is full
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      clearOldCache();
      // Try once more
      try {
        const cacheKey = CACHE_PREFIX + key;
        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          expiresAt: Date.now() + ttlMs,
        };
        localStorage.setItem(cacheKey, JSON.stringify(entry));
      } catch {
        // Give up if still failing
      }
    }
  }
}

/**
 * Clear expired cache entries
 */
export function clearExpiredCache(): void {
  try {
    const now = Date.now();
    const keys = Object.keys(localStorage);
    let cleared = 0;
    
    for (const key of keys) {
      if (!key.startsWith(CACHE_PREFIX)) continue;
      
      try {
        const cached = localStorage.getItem(key);
        if (!cached) continue;
        
        const entry: CacheEntry<unknown> = JSON.parse(cached);
        if (now > entry.expiresAt) {
          localStorage.removeItem(key);
          cleared++;
        }
      } catch {
        // Invalid entry, remove it
        localStorage.removeItem(key);
        cleared++;
      }
    }
    
    if (cleared > 0) {
      console.log(`[Cache] Cleared ${cleared} expired entries`);
    }
  } catch (error) {
    console.error('[Cache] Error clearing expired cache:', error);
  }
}

/**
 * Clear old cache entries (oldest first) to free up space
 */
export function clearOldCache(keepCount: number = 5): void {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    
    // Parse all entries with timestamps
    const entries: Array<{ key: string; timestamp: number }> = [];
    for (const key of keys) {
      try {
        const cached = localStorage.getItem(key);
        if (!cached) continue;
        const entry: CacheEntry<unknown> = JSON.parse(cached);
        entries.push({ key, timestamp: entry.timestamp });
      } catch {
        // Invalid entry, we'll remove it
        localStorage.removeItem(key);
      }
    }
    
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a.timestamp - b.timestamp);
    
    // Remove oldest entries, keeping only `keepCount` newest
    const toRemove = entries.slice(0, -keepCount);
    for (const { key } of toRemove) {
      localStorage.removeItem(key);
    }
    
    if (toRemove.length > 0) {
      console.log(`[Cache] Cleared ${toRemove.length} old entries`);
    }
  } catch (error) {
    console.error('[Cache] Error clearing old cache:', error);
  }
}

/**
 * Clear a specific cache entry by key (without prefix)
 */
export function clearCacheByKey(key: string): void {
  try {
    const cacheKey = CACHE_PREFIX + key;
    localStorage.removeItem(cacheKey);
    console.log(`[Cache] Cleared cache entry: ${key}`);
  } catch (error) {
    console.error('[Cache] Error clearing cache by key:', error);
  }
}

/**
 * Clear all cache entries
 */
export function clearAllCache(): void {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    for (const key of keys) {
      localStorage.removeItem(key);
    }
    console.log(`[Cache] Cleared all ${keys.length} cache entries`);
  } catch (error) {
    console.error('[Cache] Error clearing all cache:', error);
  }
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats(): { count: number; size: number; entries: Array<{ key: string; age: number; size: number }> } {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
  const now = Date.now();
  const entries = [];
  let totalSize = 0;
  
  for (const key of keys) {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) continue;
      
      const entry: CacheEntry<unknown> = JSON.parse(cached);
      const size = cached.length;
      totalSize += size;
      
      entries.push({
        key: key.replace(CACHE_PREFIX, ''),
        age: Math.round((now - entry.timestamp) / 1000),
        size,
      });
    } catch {
      // Skip invalid entries
    }
  }
  
  return {
    count: entries.length,
    size: totalSize,
    entries: entries.sort((a, b) => b.size - a.size),
  };
}






