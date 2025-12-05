import { NextRequest, NextResponse } from 'next/server';
import { getGamesForDate } from '@/lib/loadSchedules';
import { getCachedGames, setCachedGames } from '@/lib/supabase';
import type { RankingSource } from '@/lib/loadProspects';
import { auth } from '@clerk/nextjs/server';
import { localYMD } from '@/app/utils/dateKey';
import { enrichWithLiveScores } from '@/lib/loadSchedulesFromScoreboard';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sourceParam = searchParams.get('source') || 'espn';
    
    // Validate source parameter
    if (sourceParam !== 'espn' && sourceParam !== 'myboard') {
      return NextResponse.json(
        { error: 'Invalid source. Must be "espn" or "myboard"', games: {} },
        { status: 400 }
      );
    }
    
    const source = sourceParam as RankingSource;
    const todayKey = localYMD(new Date());
    const cacheKey = `today_games_${source}_${todayKey}`;
    
    // Get userId if source is 'myboard' (needed for custom players)
    let clerkUserId: string | undefined;
    const shouldBypassCache = source === 'myboard';
    if (source === 'myboard') {
      const { userId } = await auth();
      clerkUserId = userId || undefined;
    }
    
    // PHASE 1: Try to read from Supabase cache (should be <100ms)
    // Skip cache for myboard source to ensure fresh rankings
    let cachedData = null;
    if (!shouldBypassCache) {
      console.time(`[API/Today] Cache lookup for ${cacheKey}`);
      cachedData = await getCachedGames(cacheKey);
      console.timeEnd(`[API/Today] Cache lookup for ${cacheKey}`);
    }
    
    // PHASE 1.5: If today's cache miss, try getting from full schedule cache (fallback)
    // Skip this for myboard source as well
    if (!cachedData && !shouldBypassCache) {
      console.time(`[API/Today] Fallback to all games cache`);
      const allGamesCacheKey = `all_games_${source}`;
      const allGamesCache = await getCachedGames(allGamesCacheKey, true); // Allow stale data
      console.timeEnd(`[API/Today] Fallback to all games cache`);
      
      if (allGamesCache && allGamesCache.games) {
        const todayGames = allGamesCache.games[todayKey];
        if (todayGames && todayGames.length > 0) {
          cachedData = {
            games: { [todayKey]: todayGames },
            source,
            date: todayKey,
          };
          console.log(`[API/Today] Found ${todayGames.length} games in full schedule cache`);
        }
      }
    }
    
    if (cachedData) {
      // Cache hit! Return immediately with prospect rankings
      // Enrich with live scores in background (fire-and-forget)
      console.log(`[API/Today] Cache HIT for ${source}, returning immediately`);
      
      const cachedGames = cachedData.games[todayKey] || [];
      
      // Enrich in background without blocking response
      enrichWithLiveScores(cachedGames).then(enrichedGames => {
        // Update cache with enriched games in background
        const enrichedData = {
          ...cachedData,
          games: { [todayKey]: enrichedGames },
        };
        setCachedGames(cacheKey, enrichedData).catch(err => 
          console.error('[API/Today] Failed to write enriched cache:', err)
        );
      }).catch(err => console.error('[API/Today] Background score enrichment failed:', err));
      
      // For myboard source, never cache (user-specific rankings)
      const cacheHeaders: HeadersInit = source === 'myboard'
        ? {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Cache-Status': 'HIT',
            'X-Generated-At': new Date().toISOString(),
          }
        : {
            'Cache-Control': 'public, max-age=30, s-maxage=30, stale-while-revalidate=60',
            'X-Cache-Status': 'HIT',
            'X-Generated-At': new Date().toISOString(),
          };
      
      return NextResponse.json(
        cachedData,
        { headers: cacheHeaders }
      );
    }
    
    // PHASE 2: Cache miss - fall back to live fetch
    console.log(`[API/Today] Cache miss for ${source}, fetching live data`);
    console.time(`[API/Today] Live fetch for ${source}`);
    
    let todayGames = await getGamesForDate(todayKey, source, clerkUserId);
    console.timeEnd(`[API/Today] Live fetch for ${source}`);
    
    // Return games immediately with prospect rankings
    // Enrich with live scores in background (fire-and-forget)
    const responseData = {
      games: { [todayKey]: todayGames },
      source,
      date: todayKey,
    };
    
    // Store in cache for next request (fire and forget) - skip for myboard source
    if (source !== 'myboard') {
      setCachedGames(cacheKey, responseData).catch(err => 
        console.error('[API/Today] Failed to write cache:', err)
      );
      
      // Enrich with scores in background and update cache
      enrichWithLiveScores(todayGames).then(enrichedGames => {
        const enrichedData = {
          games: { [todayKey]: enrichedGames },
          source,
          date: todayKey,
        };
        setCachedGames(cacheKey, enrichedData).catch(err => 
          console.error('[API/Today] Failed to write enriched cache:', err)
        );
      }).catch(err => console.error('[API/Today] Background score enrichment failed:', err));
    }
    
    // For myboard source, never cache (user-specific rankings)
    const cacheHeaders: HeadersInit = source === 'myboard'
      ? {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Cache-Status': 'MISS',
          'X-Generated-At': new Date().toISOString(),
        }
      : {
          'Cache-Control': 'public, max-age=60, s-maxage=60',
          'X-Cache-Status': 'MISS',
          'X-Generated-At': new Date().toISOString(),
        };
    
    return NextResponse.json(
      responseData,
      { headers: cacheHeaders }
    );
  } catch (error) {
    console.error('[API/Today] Error fetching today\'s schedules:', error);
    return NextResponse.json(
      { error: 'Failed to load today\'s schedules', games: {} },
      { status: 500 }
    );
  }
}

