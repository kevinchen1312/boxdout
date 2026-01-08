import { NextRequest, NextResponse } from 'next/server';
import { loadAllSchedules } from '@/lib/loadSchedules';
import type { RankingSource } from '@/lib/loadProspects';
import { auth } from '@clerk/nextjs/server';
import { getCachedGames, setCachedGames } from '@/lib/supabase';
import { enrichWithLiveScores } from '@/lib/loadSchedulesFromScoreboard';
import { localYMD } from '@/app/utils/dateKey';
import { getBigBoardAndWatchlistProspects } from '@/lib/loadProspects';
import { buildTrackedPlayersMap, decorateGamesWithTrackedPlayers } from '@/lib/trackedPlayers';

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
    const cacheKey = `all_games_${source}`;
    
    // Check for force reload parameter (for testing/debugging)
    const forceReload = searchParams.get('forceReload') === 'true';
    
    // For ESPN source: Use cache aggressively for fast loading
    // For myboard source: Try to use ESPN cache as base, then apply user rankings
    // This is much faster than loading all schedules from scratch
    
    // Get userId for authentication
    let clerkUserId: string | undefined;
    if (source === 'myboard') {
      const { userId } = await auth();
      clerkUserId = userId || undefined;
      console.log(`[API/All] Auth check - userId: ${clerkUserId ? clerkUserId.substring(0, 10) + '...' : 'NOT LOGGED IN'}, source: ${source}`);
    }
    
    // OPTIMIZATION: For myboard, try to use ESPN cache as base and just apply user rankings
    // This is MUCH faster than loading all schedules from scratch
    if (source === 'myboard' && clerkUserId && !forceReload) {
      console.time('[API/All] Fast myboard path');
      const espnCacheKey = 'all_games_espn';
      const espnCached = await getCachedGames(espnCacheKey, false);
      
      if (espnCached && espnCached.games && Object.keys(espnCached.games).length > 0) {
        console.log('[API/All] Using ESPN cache as base for myboard - applying user rankings');
        
        try {
          // Get user's rankings and apply them to ESPN cached games
          const { bigBoard, watchlist } = await getBigBoardAndWatchlistProspects(source, clerkUserId);
          console.log(`[API/All] Fast path: ${bigBoard.length} big board, ${watchlist.length} watchlist`);
          
          const trackedMap = buildTrackedPlayersMap(bigBoard, watchlist);
          
          // Decorate ESPN cached games with user's tracked players
          const userGamesByDate: Record<string, typeof espnCached.games[string]> = {};
          for (const [dateKey, games] of Object.entries(espnCached.games)) {
            userGamesByDate[dateKey] = decorateGamesWithTrackedPlayers(games, trackedMap);
          }
          
          console.timeEnd('[API/All] Fast myboard path');
          console.log('[API/All] ✓ Fast path complete - returning user-ranked games from ESPN cache');
          
          return NextResponse.json(
            { games: userGamesByDate, source },
            {
              headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'X-Cache-Status': 'FAST_PATH',
                'X-Generated-At': new Date().toISOString(),
              },
            }
          );
        } catch (err) {
          console.error('[API/All] Fast path failed, falling back to full load:', err);
          // Fall through to full load below
        }
      }
    }
    
    const shouldBypassCache = forceReload || source === 'myboard';
    
    // Try cache first (only if no user logged in and not forcing reload)
    let cachedData = null;
    if (!shouldBypassCache) {
      console.time(`[API/All] Cache lookup for ${cacheKey}`);
      cachedData = await getCachedGames(cacheKey, false);
      console.timeEnd(`[API/All] Cache lookup for ${cacheKey}`);
    }
    
    if (cachedData && !shouldBypassCache) {
      console.log(`[API/All] Returning from cache for ${source} (no user logged in)`);
      
      // Return games immediately with prospect rankings
      const todayKey = localYMD(new Date());
      const allGames = { ...cachedData.games };
      
      // Decorate cached games with tracked players if user is logged in
      // (Even though we bypass cache when logged in, this handles edge cases)
      if (clerkUserId) {
        try {
          const { bigBoard, watchlist } = await getBigBoardAndWatchlistProspects(source, clerkUserId);
          const trackedMap = buildTrackedPlayersMap(bigBoard, watchlist);
          
          // Decorate all cached games
          for (const [dateKey, games] of Object.entries(allGames)) {
            allGames[dateKey] = decorateGamesWithTrackedPlayers(games, trackedMap);
          }
        } catch (err) {
          console.error('[API/All] Failed to decorate cached games with tracked players:', err);
        }
      }
      
      // Enrich with live scores in background (fire-and-forget)
      // This allows prospect rankings to appear immediately
      if (allGames[todayKey] && allGames[todayKey].length > 0) {
        enrichWithLiveScores(allGames[todayKey]).catch(err => 
          console.error('[API/All] Background score enrichment failed:', err)
        );
      }
      
      return NextResponse.json(
        { games: allGames, source },
        {
          headers: {
            'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600',
            'X-Cache-Status': 'HIT',
            'X-Generated-At': new Date().toISOString(),
          },
        }
      );
    }
    
    // Cache miss or user logged in - load fresh data (includes watchlist games if user logged in)
    const reason = forceReload ? 'Force reload' : (clerkUserId ? 'User logged in (watchlist games)' : 'Cache miss');
    console.log(`[API/All] ${reason} for ${source}, loading fresh data`);
    console.time(`[API/All] loadAllSchedules-${source}`);
    const { gamesByDate } = await loadAllSchedules(source, forceReload, clerkUserId);
    console.timeEnd(`[API/All] loadAllSchedules-${source}`);
    
    // Decorate games with tracked players (big board + watchlist)
    // This ensures all tracked players appear on both sides of games
    if (clerkUserId) {
      console.time(`[API/All] Decorate games with tracked players`);
      try {
        console.log(`[API/All] Building tracked players map for source=${source}, userId=${clerkUserId}`);
        const { bigBoard, watchlist } = await getBigBoardAndWatchlistProspects(source, clerkUserId);
        console.log(`[API/All] Loaded ${bigBoard.length} big board prospects, ${watchlist.length} watchlist prospects`);
        
        // Debug: Check specific players to verify correct separation
        const dashInBigBoard = bigBoard.find(p => p.name?.toLowerCase().includes('dash'));
        const dashInWatchlist = watchlist.find(p => p.name?.toLowerCase().includes('dash'));
        const jaydenInBigBoard = bigBoard.find(p => p.name?.toLowerCase().includes('jayden') && p.name?.toLowerCase().includes('quaintance'));
        console.log(`[API/All] DEBUG - Dash Daniels in bigBoard: ${dashInBigBoard ? `YES rank=${dashInBigBoard.rank}` : 'NO'}`);
        console.log(`[API/All] DEBUG - Dash Daniels in watchlist: ${dashInWatchlist ? `YES isWatchlist=${dashInWatchlist.isWatchlist}` : 'NO'}`);
        console.log(`[API/All] DEBUG - Jayden Quaintance in bigBoard: ${jaydenInBigBoard ? `YES rank=${jaydenInBigBoard.rank}` : 'NO'}`);
        console.log(`[API/All] DEBUG - Big board top 5:`, bigBoard.slice(0, 5).map(p => `${p.rank}. ${p.name}`));
        console.log(`[API/All] DEBUG - Watchlist first 5:`, watchlist.slice(0, 5).map(p => `${p.name} (isWatchlist=${p.isWatchlist})`));
        
        const trackedMap = buildTrackedPlayersMap(bigBoard, watchlist);
        console.log(`[API/All] Built tracked map with ${Object.keys(trackedMap).length} entries`);
        
        // Decorate all games with tracked players
        const decoratedGamesByDate: Record<string, typeof gamesByDate[string]> = {};
        let totalGames = 0;
        for (const [dateKey, games] of Object.entries(gamesByDate)) {
          totalGames += games.length;
          decoratedGamesByDate[dateKey] = decorateGamesWithTrackedPlayers(games, trackedMap);
        }
        console.log(`[API/All] Decorated ${totalGames} total games across ${Object.keys(gamesByDate).length} dates`);
        
        // Replace gamesByDate with decorated version
        Object.assign(gamesByDate, decoratedGamesByDate);
        console.timeEnd(`[API/All] Decorate games with tracked players`);
        
        // FINAL SUMMARY LOG (at the very end, so it appears at bottom of terminal)
        // Check for Dayton vs Virginia on 12/6
        const dec6Games = gamesByDate['2025-12-06'] || [];
        const daytonVirginiaGame = dec6Games.find(g => {
          const homeName = (g.homeTeam?.displayName || g.homeTeam?.name || '').toLowerCase();
          const awayName = (g.awayTeam?.displayName || g.awayTeam?.name || '').toLowerCase();
          return (homeName.includes('dayton') && awayName.includes('virginia')) ||
                 (homeName.includes('virginia') && awayName.includes('dayton'));
        });
        
        if (daytonVirginiaGame) {
          console.log(`\n\n[API/All] ========== FINAL SUMMARY: Dayton vs Virginia on 12/6 ==========`);
          console.log(`[API/All] Game ID: ${daytonVirginiaGame.id}`);
          console.log(`[API/All] Home Team: name="${daytonVirginiaGame.homeTeam?.displayName || daytonVirginiaGame.homeTeam?.name}", id=${daytonVirginiaGame.homeTeam?.id}, logo=${daytonVirginiaGame.homeTeam?.logo}`);
          console.log(`[API/All] Away Team: name="${daytonVirginiaGame.awayTeam?.displayName || daytonVirginiaGame.awayTeam?.name}", id=${daytonVirginiaGame.awayTeam?.id}, logo=${daytonVirginiaGame.awayTeam?.logo}`);
          console.log(`[API/All] Home Prospects: ${(daytonVirginiaGame.homeProspects || []).map(p => `${p.name} (teamId=${p.teamId})`).join(', ')}`);
          console.log(`[API/All] Away Prospects: ${(daytonVirginiaGame.awayProspects || []).map(p => `${p.name} (teamId=${p.teamId})`).join(', ')}`);
          console.log(`[API/All] Home Tracked Players: ${(daytonVirginiaGame.homeTrackedPlayers || []).map(p => `${p.playerName} (teamId=${p.teamId})`).join(', ')}`);
          console.log(`[API/All] Away Tracked Players: ${(daytonVirginiaGame.awayTrackedPlayers || []).map(p => `${p.playerName} (teamId=${p.teamId})`).join(', ')}`);
          console.log(`[API/All] ================================================================\n\n`);
          
          // CRITICAL: Add debug logs AFTER FINAL SUMMARY (so they appear at very bottom)
          // These logs will help diagnose where the swap is happening
          console.log(`\n\n[API/All] ========== DEBUG LOGS FOR DAYTON/VIRGINIA (AFTER FINAL SUMMARY) ==========`);
          console.log(`[API/All] NOTE: Check server logs above for merge/swap detection logs during game processing.`);
          console.log(`[API/All] This section appears at the very bottom to ensure visibility.`);
          console.log(`[API/All] Final game state:`);
          console.log(`[API/All]   - Home team name: "${daytonVirginiaGame.homeTeam?.displayName || daytonVirginiaGame.homeTeam?.name}"`);
          console.log(`[API/All]   - Home team ID: ${daytonVirginiaGame.homeTeam?.id}`);
          console.log(`[API/All]   - Away team name: "${daytonVirginiaGame.awayTeam?.displayName || daytonVirginiaGame.awayTeam?.name}"`);
          console.log(`[API/All]   - Away team ID: ${daytonVirginiaGame.awayTeam?.id}`);
          console.log(`[API/All] Expected: Virginia (home, id=2168) vs Dayton (away, id=258)`);
          console.log(`[API/All] Actual: ${daytonVirginiaGame.homeTeam?.displayName || daytonVirginiaGame.homeTeam?.name} (home, id=${daytonVirginiaGame.homeTeam?.id}) vs ${daytonVirginiaGame.awayTeam?.displayName || daytonVirginiaGame.awayTeam?.name} (away, id=${daytonVirginiaGame.awayTeam?.id})`);
          console.log(`[API/All] ====================================================================\n\n`);
        }
      } catch (err) {
        console.error('[API/All] Failed to decorate games with tracked players:', err);
        console.error('[API/All] Error details:', err instanceof Error ? err.stack : err);
        // Continue without decoration - games will still work with existing prospects arrays
      }
    } else {
      console.log('[API/All] Skipping decoration - no userId (user not logged in)');
    }
    
    // Return games immediately with prospect rankings
    // Enrich today's games with live scores in background (fire-and-forget)
    const todayKey = localYMD(new Date());
    if (gamesByDate[todayKey] && gamesByDate[todayKey].length > 0) {
      // Start enrichment but don't await - return response immediately
      enrichWithLiveScores(gamesByDate[todayKey]).then(enrichedGames => {
        // Update cache with enriched games in background
        if (source === 'espn') {
          const enrichedGamesByDate = { ...gamesByDate, [todayKey]: enrichedGames };
          setCachedGames(cacheKey, {
            games: enrichedGamesByDate,
            source,
            date: new Date().toISOString().split('T')[0],
          }).catch(err => console.error('[API/All] Failed to write enriched cache:', err));
        }
      }).catch(err => console.error('[API/All] Background score enrichment failed:', err));
    }
    
    // Cache the result (fire and forget for ESPN, skip for myboard as it's user-specific)
    if (source === 'espn') {
      setCachedGames(cacheKey, {
        games: gamesByDate,
        source,
        date: new Date().toISOString().split('T')[0],
      }).catch(err => console.error('[API/All] Failed to write cache:', err));
    }

    // For myboard source, never cache (user-specific rankings)
    // For ESPN source, cache for performance
    const cacheHeaders: HeadersInit = source === 'myboard' 
      ? {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Cache-Status': 'MISS',
          'X-Generated-At': new Date().toISOString(),
        }
      : {
          'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600',
          'X-Cache-Status': 'MISS',
          'X-Generated-At': new Date().toISOString(),
        };
    
    // CRITICAL: Debug logs at the VERY END (after everything, so they appear at bottom of terminal)
    if (clerkUserId) {
      const dec6Games = gamesByDate['2025-12-06'] || [];
      const daytonVirginiaGame = dec6Games.find(g => {
        const homeName = (g.homeTeam?.displayName || g.homeTeam?.name || '').toLowerCase();
        const awayName = (g.awayTeam?.displayName || g.awayTeam?.name || '').toLowerCase();
        return (homeName.includes('dayton') && awayName.includes('virginia')) ||
               (homeName.includes('virginia') && awayName.includes('dayton'));
      });
      
      if (daytonVirginiaGame) {
        console.log(`\n\n[API/All] ========== FINAL DEBUG LOGS (AT VERY BOTTOM) ==========`);
        console.log(`[API/All] Dayton vs Virginia game state at END of API route:`);
        console.log(`[API/All]   Home Team: name="${daytonVirginiaGame.homeTeam?.displayName || daytonVirginiaGame.homeTeam?.name}", id=${daytonVirginiaGame.homeTeam?.id}`);
        console.log(`[API/All]   Away Team: name="${daytonVirginiaGame.awayTeam?.displayName || daytonVirginiaGame.awayTeam?.name}", id=${daytonVirginiaGame.awayTeam?.id}`);
        console.log(`[API/All]   Expected: Virginia (home, id=2168) vs Dayton (away, id=258)`);
        console.log(`[API/All]   Actual: ${daytonVirginiaGame.homeTeam?.displayName || daytonVirginiaGame.homeTeam?.name} (home, id=${daytonVirginiaGame.homeTeam?.id}) vs ${daytonVirginiaGame.awayTeam?.displayName || daytonVirginiaGame.awayTeam?.name} (away, id=${daytonVirginiaGame.awayTeam?.id})`);
        console.log(`[API/All] NOTE: Check logs above for [Schedule] merge/swap detection logs during game processing.`);
        console.log(`[API/All] ============================================================\n\n`);
      }
    }
    
    return NextResponse.json(
      { games: gamesByDate, source },
      { headers: cacheHeaders }
    );
  } catch (error) {
    console.error('Error fetching all schedules:', error);
    return NextResponse.json(
      { error: 'Failed to load prospect schedules', games: {} },
      { status: 500 }
    );
  }
}
