'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { GameWithProspects } from '../utils/gameMatching';
import { getCachedData, getStaleCachedData, setCachedData, clearExpiredCache, clearCacheByKey } from '../utils/browserCache';
import { getGameKey, normalizeTeamNameForKey } from '../utils/gameKey';

export type GamesByDate = Record<string, GameWithProspects[]>;
export type RankingSource = 'espn' | 'myboard';

interface UseGamesOptions {
  source?: RankingSource;
  ready?: boolean; // If provided, wait until ready is true before loading
  initialGames?: GamesByDate; // Server-side pre-fetched games for instant display
  rankingsVersion?: string | null; // Version from server to invalidate cache when rankings change
}

export function useGames(options: UseGamesOptions = {}) {
  const { source = 'espn', ready = true, initialGames, rankingsVersion } = options;
  // Use initial games if provided, otherwise empty object
  const [games, setGames] = useState<GamesByDate>(initialGames || {});
  const [gamesVersion, setGamesVersion] = useState(0); // Version counter to force re-renders
  // If we have initial games, start with loading=false (no loading spinner needed)
  const [loading, setLoading] = useState(!initialGames || Object.keys(initialGames).length === 0);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('Loading schedules...');
  const [updating, setUpdating] = useState(false);
  const loadedSourceRef = useRef<RankingSource | null>(initialGames ? source : null);
  const refreshTriggerRef = useRef(0);
  const isMergingRef = useRef(false); // Flag to prevent reloads during merge operations
  const hasGamesRef = useRef(!!initialGames && Object.keys(initialGames).length > 0); // Track if we have games loaded
  
  // Keep hasGamesRef in sync with games state
  hasGamesRef.current = Object.keys(games).length > 0;

  // Function to load games data (extracted for reuse)
  const loadGamesData = useCallback(async (forceRefresh = false, signal?: AbortSignal) => {
    // CRITICAL: Don't reload if we're currently merging games
    if (isMergingRef.current) {
      console.log(`[useGames] loadGamesData BLOCKED: merge in progress`);
      return;
    }
    
    let alive = true;
    if (signal) {
      signal.addEventListener('abort', () => {
        alive = false;
      });
    }
    
    try {
      console.time('[useGames] Total load time');
      // Only set loading=true if we don't have any games yet
      // This prevents the loading skeleton from flashing during background refreshes
      if (!hasGamesRef.current) {
        setLoading(true);
        setLoadingMessage('Loading...');
      }
      
      // Clear expired cache entries on mount (async, non-blocking)
      setTimeout(() => clearExpiredCache(), 0);
      
      // If force refresh, clear cache first
      if (forceRefresh) {
        const cacheKey = `games_all_${source}`;
        clearCacheByKey(cacheKey);
      }
      
      // Try to get from cache first (with error handling for browsers that block localStorage)
      let cached: GamesByDate | null = null;
      const rankingsVersion = typeof window !== 'undefined' ? localStorage.getItem('rankingsVersion') : null;
      
      // Check if there's a pending rankings update - if so, we can use OLD cache + apply new rankings
      let pendingRankingsUpdate: { rankings: Array<{ name: string; team: string; rank: number; isWatchlist?: boolean }> } | null = null;
      if (source === 'myboard' && typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem('rankingsUpdated');
          if (stored) {
            const data = JSON.parse(stored);
            // Check if this is a recent update (within 30 seconds)
            if (data.timestamp && (Date.now() - data.timestamp) < 30000 && data.rankings) {
              pendingRankingsUpdate = data;
              console.log('[useGames] Found pending rankings update, will apply to cached games');
            }
          }
        } catch (err) {
          // Ignore
        }
      }
      
      // For myboard, include rankings version in cache key so it auto-invalidates when rankings change
      const cacheKey = source === 'myboard' && rankingsVersion 
        ? `games_all_${source}_v${rankingsVersion.substring(0, 10)}` // Use first 10 chars of version timestamp
        : `games_all_${source}`;
      
      if (!forceRefresh) {
        try {
          // First try current version cache
          cached = getCachedData<GamesByDate>(cacheKey);
          if (!cached) {
            cached = getStaleCachedData<GamesByDate>(cacheKey);
          }
          
          // For myboard source, also try to find ANY myboard cache (even without version)
          // This helps on first load when cache might exist from previous session
          if (!cached && source === 'myboard') {
            console.log('[useGames] No versioned cache, searching for any myboard cache...');
            const keys = Object.keys(localStorage);
            for (const key of keys) {
              if (key.includes('prospectcal_cache_games_all_myboard')) {
                try {
                  const foundCache = getStaleCachedData<GamesByDate>(key.replace('prospectcal_cache_', ''));
                  if (foundCache && Object.keys(foundCache).length > 5) {
                    cached = foundCache;
                    console.log('[useGames] Found myboard cache from previous session, using it');
                    break;
                  }
                } catch { /* ignore */ }
              }
            }
          }
          
          // For ESPN source, also try to find ANY ESPN cache (even if key doesn't match exactly)
          // This helps on first load when cache might exist from previous session
          if (!cached && source === 'espn') {
            console.log('[useGames] No exact cache match, searching for any ESPN cache...');
            const keys = Object.keys(localStorage);
            for (const key of keys) {
              if (key.includes('prospectcal_cache_games_all_espn')) {
                try {
                  const foundCache = getStaleCachedData<GamesByDate>(key.replace('prospectcal_cache_', ''));
                  if (foundCache && Object.keys(foundCache).length > 5) {
                    cached = foundCache;
                    console.log('[useGames] Found ESPN cache from previous session, using it');
                    break;
                  }
                } catch { /* ignore */ }
              }
            }
          }
          
          // If no cache found but we have pending rankings, try to find ANY myboard cache
          // We can apply the new rankings to it instead of fetching fresh
          if (!cached && pendingRankingsUpdate && source === 'myboard') {
            console.log('[useGames] No versioned cache, searching for any myboard cache to update...');
            // Try old cache keys (iterate localStorage)
            const keys = Object.keys(localStorage);
            for (const key of keys) {
              if (key.includes('games_all_myboard')) {
                try {
                  const oldCached = getStaleCachedData<GamesByDate>(key.replace('prospectcal_cache_', ''));
                  if (oldCached && Object.keys(oldCached).length > 5) {
                    cached = oldCached;
                    console.log('[useGames] Found old myboard cache, will apply new rankings');
                    break;
                  }
                } catch { /* ignore */ }
              }
            }
          }
          
          if (cached && source === 'myboard') {
            console.log(`[useGames] Using cached myboard data (version: ${rankingsVersion?.substring(0, 10)})`);
          }
        } catch (err) {
          console.warn('[useGames] Cache read failed (localStorage may be disabled):', err);
        }
      }
      
      // If we have cached data (fresh or stale), show it immediately
      // Only do background revalidation if cache seems incomplete
      if (cached && alive && Object.keys(cached).length > 0) {
        const cachedGamesCount = Object.values(cached).flat().length;
        const cachedDatesCount = Object.keys(cached).length;
        console.log(`[useGames] Showing cached games immediately: ${cachedGamesCount} games across ${cachedDatesCount} dates`);
        
        // Check if cache seems incomplete (very few games or only one date)
        // If so, trigger immediate refresh instead of using incomplete cache
        const seemsIncomplete = cachedGamesCount < 10 || cachedDatesCount === 1;
        if (seemsIncomplete) {
          console.warn(`[useGames] ⚠️ Cache seems incomplete (${cachedGamesCount} games, ${cachedDatesCount} dates). Triggering immediate refresh.`);
          // Clear cache and fetch fresh data
          try {
            const cacheKey = `games_all_${source}`;
            clearCacheByKey(cacheKey);
          } catch (err) {
            console.warn('[useGames] Failed to clear cache:', err);
          }
          // Continue to fetch fresh data below instead of returning
        } else {
          // Cache looks complete - show it and DON'T do background revalidation
          // Background revalidation causes full reload which is what we're trying to avoid
          
          // CRITICAL FIX: For myboard source, ALWAYS fetch and apply current rankings
          // This ensures cached games show correct rankings even on new devices or after cache expires
          let gamesToShow = cached;
          
          if (source === 'myboard' && !pendingRankingsUpdate) {
            console.log('[useGames] myboard source: Fetching current rankings to apply to cached games');
            try {
              // Quick fetch of just rankings (not full games data)
              const rankingsResponse = await fetch('/api/my-rankings?source=myboard&excludeWatchlist=false', {
                cache: 'no-store',
                credentials: 'include',
              });
              if (rankingsResponse.ok) {
                const rankingsData = await rankingsResponse.json();
                const prospects = rankingsData.prospects || [];
                if (prospects.length > 0) {
                  console.log(`[useGames] Applying ${prospects.length} current rankings to cached games`);
                  const rankingsMap = new Map<string, { rank: number; isWatchlist: boolean }>();
                  for (const r of prospects) {
                    const key = (r.name || '').toLowerCase().trim();
                    rankingsMap.set(key, { rank: r.rank, isWatchlist: !!r.isWatchlist });
                  }
                  
                  // Apply rankings to all cached games
                  gamesToShow = {};
                  for (const [dateKey, dateGames] of Object.entries(cached)) {
                    gamesToShow[dateKey] = dateGames.map(game => ({
                      ...game,
                      homeProspects: (game.homeProspects || []).map(p => {
                        const updated = rankingsMap.get((p.name || '').toLowerCase().trim());
                        if (updated) {
                          return { ...p, rank: updated.rank, isWatchlist: updated.isWatchlist };
                        }
                        return p;
                      }),
                      awayProspects: (game.awayProspects || []).map(p => {
                        const updated = rankingsMap.get((p.name || '').toLowerCase().trim());
                        if (updated) {
                          return { ...p, rank: updated.rank, isWatchlist: updated.isWatchlist };
                        }
                        return p;
                      }),
                      homeTrackedPlayers: (game.homeTrackedPlayers || []).map(p => {
                        const updated = rankingsMap.get((p.playerName || '').toLowerCase().trim());
                        if (updated) {
                          return { ...p, rank: updated.rank, type: updated.isWatchlist ? 'watchlist' : 'myBoard' };
                        }
                        return p;
                      }),
                      awayTrackedPlayers: (game.awayTrackedPlayers || []).map(p => {
                        const updated = rankingsMap.get((p.playerName || '').toLowerCase().trim());
                        if (updated) {
                          return { ...p, rank: updated.rank, type: updated.isWatchlist ? 'watchlist' : 'myBoard' };
                        }
                        return p;
                      }),
                    }));
                  }
                  console.log('[useGames] ✓ Current rankings applied to cached games');
                }
              } else {
                console.warn('[useGames] Failed to fetch current rankings, using cached rankings');
              }
            } catch (err) {
              console.warn('[useGames] Error fetching current rankings:', err);
              // Continue with cached games even if rankings fetch fails
            }
          }
          if (pendingRankingsUpdate && pendingRankingsUpdate.rankings) {
            console.log('[useGames] Applying pending rankings update to cached games...');
            const rankings = pendingRankingsUpdate.rankings;
            const rankingsMap = new Map<string, { rank: number; isWatchlist: boolean }>();
            for (const r of rankings) {
              const key = r.name.toLowerCase().trim();
              rankingsMap.set(key, { rank: r.rank, isWatchlist: !!r.isWatchlist });
            }
            
            // Update ranks in all games
            gamesToShow = {};
            for (const [dateKey, dateGames] of Object.entries(cached)) {
              gamesToShow[dateKey] = dateGames.map(game => ({
                ...game,
                homeProspects: (game.homeProspects || []).map(p => {
                  const updated = rankingsMap.get(p.name?.toLowerCase().trim() || '');
                  if (updated) {
                    return { ...p, rank: updated.rank, isWatchlist: updated.isWatchlist };
                  }
                  return p;
                }),
                awayProspects: (game.awayProspects || []).map(p => {
                  const updated = rankingsMap.get(p.name?.toLowerCase().trim() || '');
                  if (updated) {
                    return { ...p, rank: updated.rank, isWatchlist: updated.isWatchlist };
                  }
                  return p;
                }),
                homeTrackedPlayers: (game.homeTrackedPlayers || []).map(p => {
                  const updated = rankingsMap.get(p.playerName?.toLowerCase().trim() || '');
                  if (updated) {
                    return { ...p, rank: updated.rank, type: updated.isWatchlist ? 'watchlist' : 'myBoard' };
                  }
                  return p;
                }),
                awayTrackedPlayers: (game.awayTrackedPlayers || []).map(p => {
                  const updated = rankingsMap.get(p.playerName?.toLowerCase().trim() || '');
                  if (updated) {
                    return { ...p, rank: updated.rank, type: updated.isWatchlist ? 'watchlist' : 'myBoard' };
                  }
                  return p;
                }),
              }));
            }
            console.log('[useGames] ✓ Rankings applied to cached games');
            
            // Clear the pending update so we don't re-apply it
            try {
              localStorage.removeItem('rankingsUpdated');
            } catch { /* ignore */ }
          }
          
          setGames(gamesToShow);
          setLoading(false); // Don't show loading spinner - we have data to show
          loadedSourceRef.current = source;
          console.timeEnd('[useGames] Total load time');
          console.log('[useGames] ✓ Using cached games. New players will be merged instantly via events.');
          return;
        }
        // If cache was incomplete, fall through to fetch fresh data
      }
      
      // No cache available - must fetch fresh data
      // Only show loading spinner if we truly have no data
      setLoadingMessage('Loading schedules...');
      
      // Phase 1: Load today's games first for quick display
      console.time('[useGames] Today fetch time');
      const todayController = new AbortController();
      const todayTimeoutId = setTimeout(() => {
        todayController.abort();
      }, 15000); // 15 second timeout for today's games
      
      let todayResponse: Response;
      try {
        todayResponse = await fetch(`/api/games/today?source=${source}`, {
          cache: 'no-store',
          credentials: 'include', // Include auth for myboard source
          signal: todayController.signal,
        });
        clearTimeout(todayTimeoutId);
      } catch (err) {
        clearTimeout(todayTimeoutId);
        if (err instanceof Error && err.name === 'AbortError') {
          console.warn('[useGames] Today fetch timed out, continuing with full fetch');
          todayResponse = { ok: false } as Response;
        } else {
          throw err;
        }
      }
      console.timeEnd('[useGames] Today fetch time');
      
      if (todayResponse.ok) {
        const todayData = await todayResponse.json();
        const todayGames = (todayData.games ?? {}) as GamesByDate;
        
        if (alive && Object.keys(todayGames).length > 0) {
          setGames(todayGames);
          setLoadingMessage('Loading remaining schedules...');
          console.log(`[useGames] Loaded ${Object.keys(todayGames).length} date(s) with today's games`);
        }
      } else {
        console.warn(`[useGames] Today's games fetch failed: ${todayResponse.status}`);
      }
      
      // Phase 2: Load all games in the background
      setLoadingMessage('Loading all schedules...');
      console.time('[useGames] All games fetch time');
      // Check URL for forceReload parameter to bypass cache
      const urlParams = new URLSearchParams(window.location.search);
      const forceReload = urlParams.get('forceReload') === 'true';
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 30000); // 30 second timeout
      
      let response: Response;
      try {
        response = await fetch(`/api/games/all?source=${source}${forceReload || forceRefresh ? '&forceReload=true' : ''}`, {
          cache: 'no-store', // Force fresh fetch
          credentials: 'include', // CRITICAL: Include auth cookies for user-specific rankings
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') {
          console.error('[useGames] Request timed out after 30 seconds');
          throw new Error('Request timed out. Please try again.');
        }
        throw err;
      }
      console.timeEnd('[useGames] All games fetch time');
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[useGames] API error ${response.status}:`, errorText);
        throw new Error(`Failed to load games: ${response.status} ${response.statusText}`);
      }
      
      setLoadingMessage('Processing game data...');
      console.time('[useGames] JSON parse time');
      const data = await response.json();
      console.timeEnd('[useGames] JSON parse time');
      const gamesByDate = (data.games ?? {}) as GamesByDate;
      
      // Debug: Check if games have tracked players arrays (client-side logging)
      if (alive && gamesByDate) {
        let gamesWithTracked = 0;
        let gamesWithoutTracked = 0;
        let pokuGamesWithTracked = 0;
        let pokuGamesWithoutTracked = 0;
        const pokuGamesMissing: Array<{ id: string; date: string; homeTeam: string; awayTeam: string }> = [];
        
        for (const games of Object.values(gamesByDate) as GameWithProspects[][]) {
          for (const game of games) {
            const hasTracked = !!(game.homeTrackedPlayers || game.awayTrackedPlayers);
            if (hasTracked) {
              gamesWithTracked++;
              const hasPoku = (game.homeTrackedPlayers || []).some(p => p.playerName.toLowerCase().includes('pokusevski')) ||
                             (game.awayTrackedPlayers || []).some(p => p.playerName.toLowerCase().includes('pokusevski'));
              if (hasPoku) pokuGamesWithTracked++;
            } else {
              gamesWithoutTracked++;
              const isPartizan = (game.homeTeam?.displayName || game.homeTeam?.name || '').toLowerCase().includes('partizan') ||
                                (game.awayTeam?.displayName || game.awayTeam?.name || '').toLowerCase().includes('partizan');
              const hasPokuInProspects = (game.homeProspects || []).some(p => p.name.toLowerCase().includes('pokusevski')) ||
                                         (game.awayProspects || []).some(p => p.name.toLowerCase().includes('pokusevski'));
              if (isPartizan && hasPokuInProspects) {
                pokuGamesWithoutTracked++;
                pokuGamesMissing.push({
                  id: game.id,
                  date: game.dateKey || game.date.substring(0, 10),
                  homeTeam: game.homeTeam?.displayName || game.homeTeam?.name || '',
                  awayTeam: game.awayTeam?.displayName || game.awayTeam?.name || '',
                });
              }
            }
          }
        }
        
        console.log(`[useGames] 📊 Games decoration status:`, {
          totalGames: gamesWithTracked + gamesWithoutTracked,
          gamesWithTrackedPlayers: gamesWithTracked,
          gamesWithoutTrackedPlayers: gamesWithoutTracked,
          pokuGamesWithTracked: pokuGamesWithTracked,
          pokuGamesWithoutTracked: pokuGamesWithoutTracked,
        });
        
        if (pokuGamesMissing.length > 0) {
          console.warn(`[useGames] ⚠️ Found ${pokuGamesMissing.length} Partizan games with Pokusevski in prospects but NO tracked players:`, pokuGamesMissing.slice(0, 10));
        }
      }
      
      if (alive) {
        // CRITICAL: Apply any pending ranking updates from localStorage before setting state
        // This ensures that if user changed rankings on rankings page, those changes are reflected
        let finalGames = gamesByDate;
        if (source === 'myboard') {
          try {
            const storedRankings = localStorage.getItem('rankingsUpdated');
            if (storedRankings) {
              const data = JSON.parse(storedRankings);
              if (data.rankings && Array.isArray(data.rankings) && data.rankings.length > 0) {
                console.log(`[useGames] Applying ${data.rankings.length} pending ranking updates to network data`);
                const rankMap = new Map<string, { rank: number; isWatchlist: boolean }>();
                for (const prospect of data.rankings) {
                  const name = (prospect.name || '').toLowerCase().trim();
                  const team = (prospect.team || prospect.teamDisplay || '').toLowerCase().trim().replace(/\s+/g, ' ');
                  const key = `${name}|${team}`;
                  rankMap.set(key, { rank: prospect.rank || 0, isWatchlist: prospect.isWatchlist || false });
                }
                
                const updatedGames: GamesByDate = {};
                for (const [dateKey, gamesForDate] of Object.entries(gamesByDate)) {
                  updatedGames[dateKey] = gamesForDate.map((game: any) => {
                    const updatePlayer = (player: any) => {
                      const name = (player.playerName || player.name || '').toLowerCase().trim();
                      const team = (player.team || player.teamDisplay || '').toLowerCase().trim().replace(/\s+/g, ' ');
                      const key = `${name}|${team}`;
                      const rankInfo = rankMap.get(key);
                      if (rankInfo) {
                        return { ...player, rank: rankInfo.rank, type: rankInfo.isWatchlist ? 'watchlist' : 'myBoard' };
                      }
                      // Also try name-only match
                      for (const [mapKey, info] of rankMap.entries()) {
                        if (mapKey.startsWith(`${name}|`)) {
                          return { ...player, rank: info.rank, type: info.isWatchlist ? 'watchlist' : 'myBoard' };
                        }
                      }
                      return player;
                    };
                    
                    return {
                      ...game,
                      prospects: (game.prospects || []).map(updatePlayer),
                      homeProspects: (game.homeProspects || []).map(updatePlayer),
                      awayProspects: (game.awayProspects || []).map(updatePlayer),
                      homeTrackedPlayers: (game.homeTrackedPlayers || []).map(updatePlayer),
                      awayTrackedPlayers: (game.awayTrackedPlayers || []).map(updatePlayer),
                    };
                  });
                }
                finalGames = updatedGames;
                console.log(`[useGames] Rankings applied to network data`);
              }
            }
          } catch (err) {
            console.warn('[useGames] Failed to apply pending rankings to network data:', err);
          }
        }
        
        setGames(finalGames);
        setLoading(false);
        setLoadingMessage('Loaded successfully ✓');
        loadedSourceRef.current = source;
        
        // Store in cache for next time (with error handling)
        // For myboard, use version-aware cache key that auto-invalidates when rankings change
        try {
          const rankingsVersion = typeof window !== 'undefined' ? localStorage.getItem('rankingsVersion') : null;
          const storeCacheKey = source === 'myboard' && rankingsVersion 
            ? `games_all_${source}_v${rankingsVersion.substring(0, 10)}`
            : `games_all_${source}`;
          // Cache for 5 minutes for myboard (will auto-invalidate on version change), 10 minutes for ESPN
          const ttl = source === 'myboard' ? 5 * 60 * 1000 : 10 * 60 * 1000;
          setCachedData(storeCacheKey, finalGames, ttl);
        } catch (err) {
          console.warn('[useGames] Failed to cache data (localStorage may be disabled):', err);
          // Continue anyway - caching is optional
        }
        
        // PREFETCH: Load the other source in background for instant switching later
        // Only prefetch if we haven't already loaded/cached the other source
        const otherSource = source === 'espn' ? 'myboard' : 'espn';
        const otherCacheKey = `games_all_${otherSource}`;
        try {
          const otherCached = getCachedData<GamesByDate>(otherCacheKey) || getStaleCachedData<GamesByDate>(otherCacheKey);
          if (!otherCached || Object.keys(otherCached).length === 0) {
            console.log(`[useGames] Prefetching ${otherSource} in background for instant switching`);
            // Delay prefetch to not interfere with primary load
            setTimeout(async () => {
              try {
                const res = await fetch(`/api/games/all?source=${otherSource}`, { credentials: 'include' });
                if (res.ok) {
                  const data = await res.json();
                  if (data.games && Object.keys(data.games).length > 0) {
                    setCachedData(otherCacheKey, data.games, 10 * 60 * 1000);
                    console.log(`[useGames] Prefetched ${otherSource}: ${Object.values(data.games).flat().length} games cached`);
                  }
                }
              } catch (prefetchErr) {
                console.warn(`[useGames] Prefetch of ${otherSource} failed (non-critical):`, prefetchErr);
              }
            }, 2000); // Wait 2 seconds before prefetching
          } else {
            console.log(`[useGames] ${otherSource} already cached, skipping prefetch`);
          }
        } catch (err) {
          // Prefetch cache check failed, skip prefetch
        }
      }
      
      console.timeEnd('[useGames] Total load time');
    } catch (err) {
      console.error('Error loading schedule:', err);
      if (alive) {
        setError('Failed to load prospect schedules.');
        setGames({});
        setLoading(false);
      }
    }
  }, [source]);

  // Update prospect ranks in existing games without reloading
  // Can accept rankings data directly for instant updates, or fetch from API as fallback
  const updateProspectRanks = useCallback(async (providedRankings?: Array<{ name: string; team: string; teamDisplay?: string; rank: number; isWatchlist?: boolean }>) => {
    // If rankings are provided, update INSTANTLY (synchronously) - no async operations
    if (providedRankings && providedRankings.length > 0) {
      console.log('[useGames] INSTANT rank update with provided rankings');
      
      // Helper to normalize team name for matching
      const normalizeTeamForMatch = (team: string | undefined): string => {
        if (!team) return '';
        return team.toLowerCase().trim().replace(/\s+/g, ' ');
      };
      
      // Helper to create matching key from prospect data
      const createMatchKey = (name: string, team: string | undefined): string => {
        const normalizedName = name.toLowerCase().trim();
        const normalizedTeam = normalizeTeamForMatch(team);
        return `${normalizedName}|${normalizedTeam}`;
      };
      
      // Create rank map immediately (synchronous)
      const rankMap = new Map<string, { rank: number; isWatchlist: boolean }>();
      console.log(`[useGames] Building rank map from ${providedRankings.length} prospects`);
      
      for (const prospect of providedRankings) {
        const name = (prospect.name || '').trim();
        const team = (prospect.team || prospect.teamDisplay || '').trim();
        
        const rankData = {
          rank: prospect.rank || 0,
          isWatchlist: prospect.isWatchlist || false,
        };
        
        // Create key with team (normalized)
        const key = createMatchKey(name, team);
        rankMap.set(key, rankData);
        
        // Also add entry keyed by lowercase version (for playerId matching)
        // This ensures tracked players can match by their playerId field
        const normalizedKey = key.toLowerCase();
        if (normalizedKey !== key) {
          rankMap.set(normalizedKey, rankData);
        }
        
        // Debug: Log Dash Daniels specifically
        if (name.toLowerCase().includes('dash')) {
          console.log(`[useGames] ✓ Dash Daniels in rankings: name="${name}", team="${team}", rank=${rankData.rank}, key="${key}"`);
        }
      }
      
      console.log(`[useGames] Rank map built with ${rankMap.size} entries`);
      
      // Update ranks INSTANTLY (synchronous state update)
      setGames((prevGames) => {
        const updatedGames: GamesByDate = {};
        
        for (const [dateKey, gamesForDate] of Object.entries(prevGames)) {
          updatedGames[dateKey] = gamesForDate.map((game) => {
            // Helper to update a single prospect's rank
            const updateProspectRank = (prospect: any) => {
              const name = (prospect.name || '').trim().toLowerCase();
              const team = (prospect.team || prospect.teamDisplay || '').trim();
              
              // Try exact match first
              let key = createMatchKey(prospect.name || '', team);
              let rankInfo = rankMap.get(key);
              
              // If not found, try name-only match (more forgiving)
              if (!rankInfo) {
                for (const [mapKey, info] of rankMap.entries()) {
                  if (mapKey.startsWith(`${name}|`)) {
                    rankInfo = info;
                    console.log(`[useGames] Matched ${prospect.name} by name-only: ${mapKey} -> rank ${info.rank}`);
                    break;
                  }
                }
              }
              
              if (rankInfo !== undefined) {
                // Prospect found - update with new rank and watchlist status
                const oldRank = prospect.rank;
                const newRank = rankInfo.rank;
                const oldIsWatchlist = prospect.isWatchlist || false;
                const newIsWatchlist = rankInfo.isWatchlist || false;
                
                if (oldRank !== newRank) {
                  console.log(`[useGames] ✓ Updated ${prospect.name} from rank ${oldRank} to ${newRank}`);
                }
                if (oldIsWatchlist !== newIsWatchlist) {
                  console.log(`[useGames] ✓ Updated ${prospect.name} watchlist status: ${oldIsWatchlist ? 'watchlist' : 'big board'} -> ${newIsWatchlist ? 'watchlist' : 'big board'}`);
                }
                return { ...prospect, rank: rankInfo.rank, isWatchlist: rankInfo.isWatchlist };
              } else {
                // Debug: Log if Dash Daniels isn't found
                if (name.includes('dash')) {
                  console.warn(`[useGames] ✗ Dash Daniels NOT FOUND in rankings map. Looking for: "${name}|${team}"`);
                  console.warn(`[useGames] Available keys:`, Array.from(rankMap.keys()).filter(k => k.includes('dash')));
                }
              }
              
              return prospect;
            };
            
            // Update prospects with new ranks
            const updatedProspects = game.prospects.map(updateProspectRank);
            const updatedHomeProspects = game.homeProspects.map(updateProspectRank);
            const updatedAwayProspects = game.awayProspects.map(updateProspectRank);
            
            // CRITICAL: Also update tracked players arrays (used by GameCard for "Watchlist" vs "myBoard X")
            const updateTrackedPlayer = (player: any) => {
              // Tracked players have a playerId field (canonical ID: name|team)
              // Match by playerId first, then fall back to name+team matching
              const playerId = player.playerId || '';
              const name = (player.playerName || player.name || '').trim().toLowerCase();
              const team = (player.team || player.teamDisplay || '').trim();
              
              // Try matching by playerId first (most reliable)
              let rankInfo = playerId ? rankMap.get(playerId.toLowerCase()) : undefined;
              
              // If not found by playerId, try matching by name+team
              if (!rankInfo) {
                let key = createMatchKey(name, team);
                rankInfo = rankMap.get(key);
                
                // If still not found, try name-only match (more forgiving)
                if (!rankInfo) {
                  for (const [mapKey, info] of rankMap.entries()) {
                    if (mapKey.startsWith(`${name}|`)) {
                      rankInfo = info;
                      break;
                    }
                  }
                }
              }
              
              if (rankInfo !== undefined) {
                // Update tracked player with new rank and watchlist status
                return {
                  ...player,
                  rank: rankInfo.rank,
                  type: rankInfo.isWatchlist ? 'watchlist' : 'myBoard',
                };
              }
              
              return player;
            };
            
            const updatedHomeTracked = (game.homeTrackedPlayers || []).map(updateTrackedPlayer);
            const updatedAwayTracked = (game.awayTrackedPlayers || []).map(updateTrackedPlayer);
            
            return {
              ...game,
              prospects: updatedProspects,
              homeProspects: updatedHomeProspects,
              awayProspects: updatedAwayProspects,
              homeTrackedPlayers: updatedHomeTracked,
              awayTrackedPlayers: updatedAwayTracked,
            };
          });
        }
        
        return updatedGames;
      });
      
      console.log('[useGames] INSTANT rank update complete');
      return; // Exit early - instant update done
    }
    
    // Fallback: Fetch rankings from API (for cases where event didn't include data)
    console.log('[useGames] Fetching rankings from API for update...');
    
    try {
      const rankingsResponse = await fetch(`/api/rankings?source=${source}&excludeWatchlist=false`, {
        cache: 'no-store',
      });
      if (!rankingsResponse.ok) {
        console.warn('[useGames] Failed to fetch rankings for update');
        return;
      }
      
      const rankingsData = await rankingsResponse.json();
      const prospects = Array.isArray(rankingsData.prospects) ? rankingsData.prospects : [];
      
      // Create a map of prospect name+team to rank and watchlist status for quick lookup
      const rankMap = new Map<string, { rank: number; isWatchlist: boolean }>();
      for (const prospect of prospects) {
        const key = `${prospect.name.toLowerCase()}|${(prospect.team || '').toLowerCase()}`;
        rankMap.set(key, {
          rank: prospect.rank || prospect.watchlistRank || 0,
          isWatchlist: prospect.isWatchlist || false,
        });
      }
      
      // Update ranks in existing games
      setGames((prevGames) => {
        const updatedGames: GamesByDate = {};
        
        for (const [dateKey, gamesForDate] of Object.entries(prevGames)) {
          updatedGames[dateKey] = gamesForDate.map((game) => {
            // Helper to update a single prospect's rank
            const updateProspectRank = (prospect: any) => {
              const key = `${prospect.name.toLowerCase()}|${(prospect.team || '').toLowerCase()}`;
              const rankInfo = rankMap.get(key);
              if (rankInfo !== undefined) {
                // Prospect found in custom rankings - update with new rank
                return { ...prospect, rank: rankInfo.rank, isWatchlist: rankInfo.isWatchlist };
              }
              // Prospect not found in rankings
              // For myboard source: keep the prospect but don't update rank
              // (they'll be filtered out on next full reload if truly removed)
              // This prevents data loss from temporary mismatches while ensuring instant updates
              // For ESPN source: keep the prospect as-is
              return prospect;
            };
            
            // Update prospects with new ranks
            const updatedProspects = game.prospects.map(updateProspectRank);
            
            // Update homeProspects with new ranks
            const updatedHomeProspects = game.homeProspects.map(updateProspectRank);
            
            // Update awayProspects with new ranks
            const updatedAwayProspects = game.awayProspects.map(updateProspectRank);
            
            // CRITICAL: Also update tracked players arrays (used by GameCard for "Watchlist" vs "myBoard X")
            const updateTrackedPlayer = (player: any) => {
              // Tracked players have a playerId field (canonical ID: name|team)
              // Match by playerId first, then fall back to name+team matching
              const playerId = player.playerId || '';
              const name = (player.playerName || player.name || '').trim().toLowerCase();
              const team = (player.team || player.teamDisplay || '').trim();
              
              // Try matching by playerId first (most reliable)
              let rankInfo = playerId ? rankMap.get(playerId.toLowerCase()) : undefined;
              
              // If not found by playerId, try matching by name+team
              if (!rankInfo) {
                const key = `${name}|${team.toLowerCase()}`;
                rankInfo = rankMap.get(key);
              }
              
              if (rankInfo !== undefined) {
                // Update tracked player with new rank and watchlist status
                return {
                  ...player,
                  rank: rankInfo.rank,
                  type: rankInfo.isWatchlist ? 'watchlist' : 'myBoard',
                };
              }
              
              return player;
            };
            
            const updatedHomeTracked = (game.homeTrackedPlayers || []).map(updateTrackedPlayer);
            const updatedAwayTracked = (game.awayTrackedPlayers || []).map(updateTrackedPlayer);
            
            return {
              ...game,
              prospects: updatedProspects,
              homeProspects: updatedHomeProspects,
              awayProspects: updatedAwayProspects,
              homeTrackedPlayers: updatedHomeTracked,
              awayTrackedPlayers: updatedAwayTracked,
            };
          });
        }
        
        return updatedGames;
      });
      
      console.log('[useGames] Prospect ranks updated in existing games');
    } catch (err) {
      console.error('[useGames] Error updating prospect ranks:', err);
    }
  }, [source]);

  // Refresh function that can be called externally
  const refresh = useCallback(() => {
    console.log('[useGames] Manual refresh triggered');
    refreshTriggerRef.current += 1;
    loadGamesData(true);
  }, [loadGamesData]);

  // Load data when source changes or on mount
  // CRITICAL: This should NOT trigger when games are updated via merge (gamesCacheUpdated event)
  // CRITICAL: When switching sources, try to use cached data INSTANTLY before loading
  // CRITICAL: Wait until `ready` is true before starting any fetch (avoids double-fetch on page load)
  useEffect(() => {
    // CRITICAL: Wait until ready flag is true (source has been determined from localStorage)
    if (!ready) {
      console.log(`[useGames] useEffect BLOCKED: waiting for ready flag (source not yet determined)`);
      return;
    }
    
    // CRITICAL: If we're currently merging games, don't trigger a reload
    if (isMergingRef.current) {
      console.log(`[useGames] useEffect BLOCKED: merge in progress`);
      return;
    }
    
    // INSTANT LOAD FROM CACHE: Try to load from cache first for instant display
    // This handles page navigation where state is reset but cache exists
    const cacheKey = `games_all_${source}`;
    let cached: GamesByDate | null = null;
    try {
      cached = getCachedData<GamesByDate>(cacheKey);
      if (!cached) {
        cached = getStaleCachedData<GamesByDate>(cacheKey);
      }
    } catch (err) {
      console.warn('[useGames] Cache read failed:', err);
    }
    
    // If we have cached data, show it immediately
    if (cached && Object.keys(cached).length > 0) {
      const cachedGameCount = Object.values(cached).flat().length;
      const currentGameCount = Object.values(games).flat().length;
      
      // If we already have games loaded for this source, skip
      if (loadedSourceRef.current === source && currentGameCount >= cachedGameCount && refreshTriggerRef.current === 0) {
        console.log(`[useGames] useEffect skipped: already have ${currentGameCount} games for ${source}`);
        return;
      }
      
      console.log(`[useGames] INSTANT LOAD: Using cached data for ${source} (${cachedGameCount} games)`);
      setGames(cached);
      loadedSourceRef.current = source;
      setLoading(false);
      setError(null);
      
      // CRITICAL: Check for pending ranking updates and apply them IMMEDIATELY
      // This ensures rank changes from the rankings page are reflected instantly
      try {
        const storedRankings = localStorage.getItem('rankingsUpdated');
        if (storedRankings && source === 'myboard') {
          const data = JSON.parse(storedRankings);
          if (data.rankings && Array.isArray(data.rankings) && data.rankings.length > 0) {
            console.log(`[useGames] Applying ${data.rankings.length} pending ranking updates after cache load`);
            // Apply rankings to the cached games immediately
            // We need to do this synchronously before the component renders
            const rankMap = new Map<string, { rank: number; isWatchlist: boolean }>();
            for (const prospect of data.rankings) {
              const name = (prospect.name || '').toLowerCase().trim();
              const team = (prospect.team || prospect.teamDisplay || '').toLowerCase().trim().replace(/\s+/g, ' ');
              const key = `${name}|${team}`;
              rankMap.set(key, { rank: prospect.rank || 0, isWatchlist: prospect.isWatchlist || false });
            }
            
            // Update the cached games with new ranks
            const updatedCached: GamesByDate = {};
            for (const [dateKey, gamesForDate] of Object.entries(cached)) {
              updatedCached[dateKey] = gamesForDate.map((game: any) => {
                const updatePlayer = (player: any) => {
                  const name = (player.playerName || player.name || '').toLowerCase().trim();
                  const team = (player.team || player.teamDisplay || '').toLowerCase().trim().replace(/\s+/g, ' ');
                  const key = `${name}|${team}`;
                  const rankInfo = rankMap.get(key);
                  if (rankInfo) {
                    return { ...player, rank: rankInfo.rank, type: rankInfo.isWatchlist ? 'watchlist' : 'myBoard' };
                  }
                  // Also try name-only match
                  for (const [mapKey, info] of rankMap.entries()) {
                    if (mapKey.startsWith(`${name}|`)) {
                      return { ...player, rank: info.rank, type: info.isWatchlist ? 'watchlist' : 'myBoard' };
                    }
                  }
                  return player;
                };
                
                return {
                  ...game,
                  prospects: (game.prospects || []).map(updatePlayer),
                  homeProspects: (game.homeProspects || []).map(updatePlayer),
                  awayProspects: (game.awayProspects || []).map(updatePlayer),
                  homeTrackedPlayers: (game.homeTrackedPlayers || []).map(updatePlayer),
                  awayTrackedPlayers: (game.awayTrackedPlayers || []).map(updatePlayer),
                };
              });
            }
            
            // Update state with the rank-updated games AND update cache
            setGames(updatedCached);
            // Also update the cache so background refresh uses updated rankings
            try {
              const rankingsVersion = typeof window !== 'undefined' ? localStorage.getItem('rankingsVersion') : null;
              const updateCacheKey = source === 'myboard' && rankingsVersion 
                ? `games_all_${source}_v${rankingsVersion.substring(0, 10)}`
                : `games_all_${source}`;
              setCachedData(updateCacheKey, updatedCached, source === 'myboard' ? 5 * 60 * 1000 : 10 * 60 * 1000);
            } catch (cacheErr) {
              console.warn('[useGames] Failed to update cache with new rankings:', cacheErr);
            }
            console.log(`[useGames] Rankings applied to cached games - NO background refresh needed`);
            // CRITICAL: Don't do a background refresh when we have pending rankings
            // The pending rankings represent user's unsaved changes which should be preserved
            return;
          }
        }
      } catch (err) {
        console.warn('[useGames] Failed to apply pending rankings:', err);
      }
      
      // Background refresh to update cache (non-blocking, no loading state)
      // Only if no pending rankings were applied
      const abortController = new AbortController();
      setTimeout(() => {
        setUpdating(true);
        loadGamesData(false, abortController.signal).finally(() => setUpdating(false));
      }, 2000); // Delay to avoid immediate re-fetch
      
      return () => abortController.abort();
    }
    
    // No cached data available - must load from network
    console.log(`[useGames] useEffect triggered: loading ${source} from network (no cache)`);
    const abortController = new AbortController();
    loadGamesData(false, abortController.signal);
    
    return () => {
      abortController.abort();
    };
  }, [source, ready, loadGamesData]); // NOTE: games is NOT in deps - changes to games via merge won't trigger this

  // Keep fetchGames for backward compatibility but it's now a no-op
  const fetchGames = useCallback(async (_startDate: string, _endDate: string) => {
    // Data is already loaded, no-op
  }, []);

  // Auto-refresh for live games - check every 30 seconds if there are live games today
  useEffect(() => {
    // Only auto-refresh if we have games loaded and not currently loading
    if (loading || Object.keys(games).length === 0) return;
    
    // Check if there are any live games today
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const todayGames = games[today] || [];
    const hasLiveGames = todayGames.some(g => g.status === 'LIVE' || g.status === 'in');
    
    if (!hasLiveGames) return; // No live games, don't auto-refresh
    
    console.log('[useGames] Live games detected, setting up auto-refresh every 30s');
    
    // Refresh every 30 seconds for live games
    const refreshInterval = setInterval(async () => {
      console.log('[useGames] Auto-refreshing live game data...');
      
      try {
        const response = await fetch(`/api/games/today?source=${source}`, {
          cache: 'no-store',
        });
        
        if (response.ok) {
          const data = await response.json();
          const todayData = data.games || {};
          
          // Merge today's fresh data with existing games
          setGames(prevGames => ({
            ...prevGames,
            ...todayData,
          }));
          
          console.log('[useGames] Auto-refresh complete');
        }
      } catch (err) {
        console.warn('[useGames] Auto-refresh failed:', err);
      }
    }, 30000); // 30 seconds
    
    return () => {
      console.log('[useGames] Clearing auto-refresh interval');
      clearInterval(refreshInterval);
    };
  }, [games, loading, source]);

  // Remove a tracked player from all games and remove games with no tracked players
  const removeTrackedPlayer = useCallback((playerId: string, playerName: string) => {
    // Helper to create canonical player ID (same as in lib/trackedPlayers.ts)
    const createCanonicalPlayerId = (name: string, team: string, teamDisplay?: string): string => {
      const normalizedName = (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
      const teamToUse = (teamDisplay || team || '').trim();
      let normalizedTeam = teamToUse
        .toLowerCase()
        .trim()
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\s+(basket|basketball|club|bc)$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (normalizedTeam.includes('partizan') || normalizedTeam.includes('mozzart')) {
        normalizedTeam = 'partizan';
      }
      return `${normalizedName}|${normalizedTeam}`;
    };

    setGames((prevGames) => {
      const updatedGames: GamesByDate = {};
      let removedGameCount = 0;
      
      for (const [dateKey, gamesForDate] of Object.entries(prevGames)) {
        const filteredGames = gamesForDate
          .map(game => {
            // Remove player from tracked players arrays
            const newHomeTracked = (game.homeTrackedPlayers || [])
              .filter(p => p.playerId !== playerId);
            const newAwayTracked = (game.awayTrackedPlayers || [])
              .filter(p => p.playerId !== playerId);
            
            // Also remove from old prospect arrays for backward compatibility
            const newHomeProspects = (game.homeProspects || [])
              .filter(p => {
                const prospectId = createCanonicalPlayerId(p.name, p.team || '', p.teamDisplay);
                return prospectId !== playerId;
              });
            const newAwayProspects = (game.awayProspects || [])
              .filter(p => {
                const prospectId = createCanonicalPlayerId(p.name, p.team || '', p.teamDisplay);
                return prospectId !== playerId;
              });
            const newProspects = (game.prospects || [])
              .filter(p => {
                const prospectId = createCanonicalPlayerId(p.name, p.team || '', p.teamDisplay);
                return prospectId !== playerId;
              });
            
            return {
              ...game,
              homeTrackedPlayers: newHomeTracked,
              awayTrackedPlayers: newAwayTracked,
              homeProspects: newHomeProspects,
              awayProspects: newAwayProspects,
              prospects: newProspects,
            };
          })
          .filter(game => {
            // Remove games with no tracked players
            const hasTrackedPlayers = 
              (game.homeTrackedPlayers?.length || 0) > 0 ||
              (game.awayTrackedPlayers?.length || 0) > 0 ||
              (game.prospects?.length || 0) > 0;
            if (!hasTrackedPlayers) removedGameCount++;
            return hasTrackedPlayers;
          });
        
        // Only add date key if there are games remaining
        if (filteredGames.length > 0) {
          updatedGames[dateKey] = filteredGames;
        }
      }
      
      console.log(`[useGames] Removed ${playerName} from games, removed ${removedGameCount} empty gamecards`);
      return updatedGames;
    });
  }, []);

  // Add games for a new watchlist player (silent merge - no loading state)
  const addWatchlistGames = useCallback(async (prospectId: string, prospectName: string, prospectTeam: string) => {
    try {
      console.log(`[useGames] 🚀 FAST PATH: Fetching games for new watchlist player: ${prospectName} (ID: ${prospectId}, Team: ${prospectTeam})`);
      
      // Small delay to allow database to sync after import (schedule sync happens async)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Fetch only this prospect's games (this should be fast - queries database directly)
      const url = `/api/games/prospects?prospectIds=${encodeURIComponent(prospectId)}&source=${source}`;
      console.log(`[useGames] Calling: ${url}`);
      
      const startTime = performance.now();
      let response = await fetch(url, {
        cache: 'no-store',
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[useGames] Failed to fetch prospect games: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Failed to fetch prospect games: ${response.status}`);
      }
      
      let newGamesData = await response.json();
      let newGames: GamesByDate = newGamesData.games || {};
      
      let fetchTime = performance.now() - startTime;
      let totalNewGames = Object.values(newGames).flat().length;
      
      // If no games found, retry once after a longer delay (schedule might still be syncing)
      if (totalNewGames === 0) {
        console.log(`[useGames] ⚠️ No games found on first attempt, retrying after delay...`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const retryStartTime = performance.now();
        response = await fetch(url, {
          cache: 'no-store',
        });
        
        if (response.ok) {
          newGamesData = await response.json();
          newGames = newGamesData.games || {};
          totalNewGames = Object.values(newGames).flat().length;
          fetchTime = performance.now() - retryStartTime;
          console.log(`[useGames] Retry: Received ${totalNewGames} games in ${fetchTime.toFixed(0)}ms`);
        }
      }
      
      console.log(`[useGames] ⚡ Received ${totalNewGames} games across ${Object.keys(newGames).length} dates for ${prospectName} in ${fetchTime.toFixed(0)}ms`);
      
      if (totalNewGames === 0) {
        console.warn(`[useGames] ⚠️ No games found for ${prospectName} (${prospectTeam}) after retry. This might be because:`);
        console.warn(`[useGames]   1. Games aren't loaded yet in database`);
        console.warn(`[useGames]   2. Team name matching failed (looking for: "${prospectTeam}")`);
        console.warn(`[useGames]   3. Games exist but player isn't decorated yet`);
        return; // Don't update state if no games
      }
      
      // Merge silently into existing games (no loading state change)
      // CRITICAL: Create deep copy to preserve all existing games
      setGames((prevGames) => {
        // Deep copy all existing games to ensure React detects changes
        const merged: GamesByDate = {};
        for (const [dateKey, gamesForDate] of Object.entries(prevGames)) {
          merged[dateKey] = [...gamesForDate]; // Copy array
        }
        
        const prevGamesCount = Object.values(prevGames).flat().length;
        console.log(`[useGames] Before merge: ${prevGamesCount} existing games across ${Object.keys(prevGames).length} dates`);
        
        let gamesMerged = 0;
        let gamesAdded = 0;
        let totalProspectsAdded = 0;
        
        for (const [dateKey, gamesForDate] of Object.entries(newGames)) {
          if (!merged[dateKey]) {
            merged[dateKey] = [];
          }
          
          // Build maps for efficient lookup
          const existingGamesByKey = new Map<string, GameWithProspects>();
          const existingGamesByNormalizedKey = new Map<string, GameWithProspects>();
          const existingGamesByTeamIds = new Map<string, GameWithProspects>();
          
          for (const existingGame of merged[dateKey]) {
            const key = existingGame.gameKey || getGameKey(existingGame);
            existingGamesByKey.set(key, existingGame);
            // Also index by normalized key (without league identifier)
            const normalizedKey = key.replace(/__[^_]+$/, '');
            existingGamesByNormalizedKey.set(normalizedKey, existingGame);
            
            // Index by team IDs and normalized team names
            const gDate = existingGame.dateKey || existingGame.date;
            const gHomeId = String(existingGame.homeTeam.id || '').trim();
            const gAwayId = String(existingGame.awayTeam.id || '').trim();
            const gHomeName = normalizeTeamNameForKey(existingGame.homeTeam.displayName || existingGame.homeTeam.name || '');
            const gAwayName = normalizeTeamNameForKey(existingGame.awayTeam.displayName || existingGame.awayTeam.name || '');
            
            if (gHomeId && gAwayId) {
              const teamIdsKey = `${gDate}|${[gHomeId, gAwayId].sort().join('|')}`;
              existingGamesByTeamIds.set(teamIdsKey, existingGame);
            }
            
            if (gHomeName && gAwayName) {
              const teamNamesKey = `${gDate}|${[gHomeName, gAwayName].sort().join('|')}`;
              existingGamesByTeamIds.set(teamNamesKey, existingGame);
            }
          }
          
          // Process each new game
          for (const newGame of gamesForDate) {
            const newGameKey = newGame.gameKey || getGameKey(newGame);
            const newGameDate = newGame.dateKey || newGame.date;
            const newHomeId = String(newGame.homeTeam.id || '').trim();
            const newAwayId = String(newGame.awayTeam.id || '').trim();
            
            // SIMPLIFIED MATCHING: Try team IDs first, then team names (normalized)
            // This is more reliable than complex game key matching
            let existingGame: GameWithProspects | undefined;
            
            const newHomeName = normalizeTeamNameForKey(newGame.homeTeam.displayName || newGame.homeTeam.name || '');
            const newAwayName = normalizeTeamNameForKey(newGame.awayTeam.displayName || newGame.awayTeam.name || '');
            const teamNamesKey = newHomeName && newAwayName ? `${newGameDate}|${[newHomeName, newAwayName].sort().join('|')}` : null;
            
            // PRIORITY 1: Try matching by team IDs (if both games have IDs)
            console.log(`[useGames] 🔍 Matching: ${newGame.homeTeam.displayName || newGame.homeTeam.name} vs ${newGame.awayTeam.displayName || newGame.awayTeam.name}`);
            console.log(`[useGames]   New game IDs: home="${newHomeId}", away="${newAwayId}"`);
            console.log(`[useGames]   New game names: home="${newHomeName}", away="${newAwayName}"`);
            
            if (newHomeId && newAwayId) {
              const teamIdsKey = `${newGameDate}|${[newHomeId, newAwayId].sort().join('|')}`;
              existingGame = existingGamesByTeamIds.get(teamIdsKey);
              if (existingGame) {
                const existingHomeId = String(existingGame.homeTeam.id || '').trim();
                const existingAwayId = String(existingGame.awayTeam.id || '').trim();
                console.log(`[useGames] ✅ Team ID match: ${newHomeId}/${newAwayId}`);
                console.log(`[useGames]   Existing game IDs: home="${existingHomeId}", away="${existingAwayId}"`);
              } else {
                console.log(`[useGames] ❌ No team ID match for key: ${teamIdsKey}`);
                // Show what keys exist for this date
                const matchingKeys = Array.from(existingGamesByTeamIds.keys()).filter(k => k.startsWith(newGameDate + '|'));
                if (matchingKeys.length > 0) {
                  console.log(`[useGames]   Available keys for ${newGameDate}: ${matchingKeys.slice(0, 3).join(', ')}...`);
                } else {
                  console.log(`[useGames]   No keys found for date ${newGameDate}`);
                }
              }
            } else {
              console.log(`[useGames] ⚠️ New game missing team IDs - cannot use ID matching`);
            }
            
            // PRIORITY 2: Try matching by normalized team names (works even without IDs)
            if (!existingGame && teamNamesKey) {
              existingGame = existingGamesByTeamIds.get(teamNamesKey);
              if (existingGame) {
                const existingHomeId = String(existingGame.homeTeam.id || '').trim();
                const existingAwayId = String(existingGame.awayTeam.id || '').trim();
                console.log(`[useGames] ✅ Team name match (indexed): ${newHomeName}/${newAwayName}`);
                console.log(`[useGames]   Existing game IDs: home="${existingHomeId}", away="${existingAwayId}"`);
              } else {
                console.log(`[useGames] ❌ No team name match for key: ${teamNamesKey}`);
              }
            }
            
            // PRIORITY 3: Fallback - search all games by normalized names (handles edge cases)
            if (!existingGame && newHomeName && newAwayName) {
              existingGame = merged[dateKey].find(g => {
                const gDate = g.dateKey || g.date;
                if (gDate !== newGameDate) return false;
                
                const gHomeName = normalizeTeamNameForKey(g.homeTeam.displayName || g.homeTeam.name || '');
                const gAwayName = normalizeTeamNameForKey(g.awayTeam.displayName || g.awayTeam.name || '');
                
                if (!gHomeName || !gAwayName) return false;
                
                const gTeams = [gHomeName, gAwayName].sort().join('__');
                const newTeams = [newHomeName, newAwayName].sort().join('__');
                
                if (gTeams === newTeams) {
                  console.log(`[useGames] ✅ Team name match (search): ${gTeams}`);
                  return true;
                }
                
                return false;
              });
            }
            
            // PRIORITY 2: Try exact game key match
            if (!existingGame) {
              existingGame = existingGamesByKey.get(newGameKey);
              if (existingGame) {
                console.log(`[useGames] ✅ Exact game key match found`);
              }
            }
            
            // PRIORITY 3: Try normalized key (without league identifier)
            if (!existingGame) {
              const normalizedKey = newGameKey.replace(/__[^_]+$/, ''); // Remove last segment (league)
              existingGame = existingGamesByNormalizedKey.get(normalizedKey);
              if (existingGame) {
                console.log(`[useGames] ✅ Normalized game key match found`);
              }
            }
            
            // PRIORITY 4: Try matching by first words (indexed lookup - fast)
            if (!existingGame) {
              const getFirstWord = (name: string) => {
                const normalized = (name || '').toLowerCase().trim();
                return normalized.split(/\s+/)[0] || normalized;
              };
              const newHomeFirst = getFirstWord(newGame.homeTeam.displayName || newGame.homeTeam.name || '');
              const newAwayFirst = getFirstWord(newGame.awayTeam.displayName || newGame.awayTeam.name || '');
              if (newHomeFirst && newAwayFirst) {
                const firstWordsKey = `${newGameDate}|${[newHomeFirst, newAwayFirst].sort().join('|')}`;
                existingGame = existingGamesByTeamIds.get(firstWordsKey);
                if (existingGame) {
                  console.log(`[useGames] ✅ First word match found (indexed): ${newHomeFirst}/${newAwayFirst}`);
                }
              }
            }
            
            // PRIORITY 5: Fallback to searching all games by first words
            if (!existingGame) {
              const getFirstWord = (name: string) => {
                const normalized = (name || '').toLowerCase().trim();
                return normalized.split(/\s+/)[0] || normalized;
              };
              
              existingGame = merged[dateKey].find(g => {
                const gDate = g.dateKey || g.date;
                if (gDate !== newGameDate) return false;
                
                const gHomeFirst = getFirstWord(g.homeTeam.displayName || g.homeTeam.name || '');
                const gAwayFirst = getFirstWord(g.awayTeam.displayName || g.awayTeam.name || '');
                const newHomeFirst = getFirstWord(newGame.homeTeam.displayName || newGame.homeTeam.name || '');
                const newAwayFirst = getFirstWord(newGame.awayTeam.displayName || newGame.awayTeam.name || '');
                
                if (!gHomeFirst || !gAwayFirst || !newHomeFirst || !newAwayFirst) {
                  return false;
                }
                
                // Match by first words (sorted to handle home/away swap)
                const gTeams = [gHomeFirst, gAwayFirst].sort().join('__');
                const newTeams = [newHomeFirst, newAwayFirst].sort().join('__');
                
                if (gTeams === newTeams) {
                  console.log(`[useGames] ✅ First word match found (search): ${gTeams} (${g.homeTeam.name} vs ${newGame.homeTeam.name})`);
                  return true;
                }
                
                return false;
              });
            }
            
            if (!existingGame) {
              const newHomeIdForLog = String(newGame.homeTeam.id || '').trim();
              const newAwayIdForLog = String(newGame.awayTeam.id || '').trim();
              const newHomeNameForLog = normalizeTeamNameForKey(newGame.homeTeam.displayName || newGame.homeTeam.name || '');
              const newAwayNameForLog = normalizeTeamNameForKey(newGame.awayTeam.displayName || newGame.awayTeam.name || '');
              
              console.log(`[useGames] ⚠️ No match found for game: ${newGame.homeTeam.name} vs ${newGame.awayTeam.name} on ${dateKey}`);
              console.log(`[useGames]   New game IDs: home="${newHomeIdForLog}", away="${newAwayIdForLog}"`);
              console.log(`[useGames]   New game key: ${newGameKey}`);
              console.log(`[useGames]   New normalized names: home="${newHomeNameForLog}", away="${newAwayNameForLog}"`);
              console.log(`[useGames]   New date: ${newGameDate}`);
              console.log(`[useGames]   Existing games on this date: ${merged[dateKey].length}`);
              
              // Check all existing games to see why they don't match
              for (let i = 0; i < Math.min(merged[dateKey].length, 10); i++) {
                const g = merged[dateKey][i];
                const gDate = g.dateKey || g.date;
                const gHomeId = String(g.homeTeam.id || '').trim();
                const gAwayId = String(g.awayTeam.id || '').trim();
                const gHomeName = normalizeTeamNameForKey(g.homeTeam.displayName || g.homeTeam.name || '');
                const gAwayName = normalizeTeamNameForKey(g.awayTeam.displayName || g.awayTeam.name || '');
                const gGameKey = g.gameKey || getGameKey(g);
                
                const dateMatch = gDate === newGameDate;
                const idMatch = (gHomeId && newHomeIdForLog && gHomeId === newHomeIdForLog && gAwayId === newAwayIdForLog) ||
                               (gHomeId && newAwayIdForLog && gHomeId === newAwayIdForLog && gAwayId === newHomeIdForLog);
                const nameMatch = [gHomeName, gAwayName].sort().join('__') === [newHomeNameForLog, newAwayNameForLog].sort().join('__');
                
                // Check if this looks like the same game
                const looksLikeMatch = (g.homeTeam.name.toLowerCase().includes(newGame.homeTeam.name.toLowerCase().split(' ')[0]) ||
                                       newGame.homeTeam.name.toLowerCase().includes(g.homeTeam.name.toLowerCase().split(' ')[0])) &&
                                      (g.awayTeam.name.toLowerCase().includes(newGame.awayTeam.name.toLowerCase().split(' ')[0]) ||
                                       newGame.awayTeam.name.toLowerCase().includes(g.awayTeam.name.toLowerCase().split(' ')[0]));
                
                console.log(`[useGames]   Existing game ${i}: ${g.homeTeam.name} vs ${g.awayTeam.name}`);
                console.log(`[useGames]     Date: ${gDate} (match: ${dateMatch})`);
                console.log(`[useGames]     IDs: home="${gHomeId}", away="${gAwayId}"`);
                console.log(`[useGames]     Normalized names: home="${gHomeName}", away="${gAwayName}"`);
                console.log(`[useGames]     Game key: ${gGameKey}`);
                console.log(`[useGames]     ID match: ${idMatch}`);
                console.log(`[useGames]     Name match: ${nameMatch}`);
                console.log(`[useGames]     Looks like match: ${looksLikeMatch}`);
                
                if (looksLikeMatch && dateMatch && !idMatch && !nameMatch) {
                  console.log(`[useGames]     ⚠️ POTENTIAL MATCH BUT NORMALIZATION FAILED!`);
                  console.log(`[useGames]     Raw names - Existing: "${g.homeTeam.name}" vs "${g.awayTeam.name}"`);
                  console.log(`[useGames]     Raw names - New: "${newGame.homeTeam.name}" vs "${newGame.awayTeam.name}"`);
                }
              }
            }
            
            if (existingGame) {
              console.log(`[useGames] ✅ Found existing game: ${existingGame.homeTeam.displayName || existingGame.homeTeam.name} vs ${existingGame.awayTeam.displayName || existingGame.awayTeam.name}`);
              console.log(`[useGames]   Existing prospects: ${(existingGame.prospects || []).length}`);
              console.log(`[useGames]   New game prospects: ${(newGame.prospects || []).length}`);
              
              // Merge prospects into existing game - create new arrays to trigger React re-render
              const existingProspectIds = new Set(
                (existingGame.prospects || []).map(p => `${p.name}|${p.team || ''}`)
              );
              const newProspects = [...(existingGame.prospects || [])];
              const newHomeProspects = [...(existingGame.homeProspects || [])];
              const newAwayProspects = [...(existingGame.awayProspects || [])];
              
              for (const prospect of (newGame.prospects || [])) {
                const prospectId = `${prospect.name}|${prospect.team || ''}`;
                console.log(`[useGames]   Checking prospect: ${prospect.name} (${prospectId})`);
                
                if (!existingProspectIds.has(prospectId)) {
                  console.log(`[useGames]   ✓ Adding prospect ${prospect.name} to existing game`);
                  newProspects.push(prospect);
                  existingProspectIds.add(prospectId);
                  totalProspectsAdded++;
                  
                  // Determine prospect side by comparing team names directly
                  // This is more reliable than checking which array they're in
                  const prospectTeam = (prospect.team || prospect.teamDisplay || '').toLowerCase().trim();
                  const homeTeamName = (existingGame.homeTeam.displayName || existingGame.homeTeam.name || '').toLowerCase().trim();
                  const awayTeamName = (existingGame.awayTeam.displayName || existingGame.awayTeam.name || '').toLowerCase().trim();
                  
                  // Normalize team names for comparison (remove common suffixes)
                  const normalizeForMatch = (name: string) => {
                    return name
                      .replace(/\s+(spartans|bears|lions|tigers|wildcats|bulldogs|eagles|hawks|owls|panthers|warriors|knights|pirates|raiders|cougars|hornets|jayhawks|tar heels|blue devils|crimson tide|fighting irish|wolverines|seminoles|nittany lions|fighting camels|pioneers|golden gophers|mountaineers|boilermakers|hoosiers)$/i, '')
                      .trim();
                  };
                  
                  const normalizedProspectTeam = normalizeForMatch(prospectTeam);
                  const normalizedHomeTeam = normalizeForMatch(homeTeamName);
                  const normalizedAwayTeam = normalizeForMatch(awayTeamName);
                  
                  // Check if prospect's team matches home or away team
                  const isHome = normalizedProspectTeam === normalizedHomeTeam || 
                                 homeTeamName.includes(normalizedProspectTeam) || 
                                 normalizedProspectTeam.includes(normalizedHomeTeam);
                  const isAway = normalizedProspectTeam === normalizedAwayTeam || 
                                 awayTeamName.includes(normalizedProspectTeam) || 
                                 normalizedProspectTeam.includes(normalizedAwayTeam);
                  
                  console.log(`[useGames]     Prospect team: "${prospectTeam}" (normalized: "${normalizedProspectTeam}")`);
                  console.log(`[useGames]     Home team: "${homeTeamName}" (normalized: "${normalizedHomeTeam}")`);
                  console.log(`[useGames]     Away team: "${awayTeamName}" (normalized: "${normalizedAwayTeam}")`);
                  console.log(`[useGames]     Prospect side: home=${isHome}, away=${isAway}`);
                  
                  if (isHome && !newHomeProspects.some(p => 
                    p.name === prospect.name && p.team === prospect.team
                  )) {
                    newHomeProspects.push(prospect);
                    console.log(`[useGames]     ✓ Added to homeProspects`);
                  }
                  if (isAway && !newAwayProspects.some(p => 
                    p.name === prospect.name && p.team === prospect.team
                  )) {
                    newAwayProspects.push(prospect);
                    console.log(`[useGames]     ✓ Added to awayProspects`);
                  }
                  
                  if (!isHome && !isAway) {
                    console.warn(`[useGames]     ⚠️ Could not determine prospect side for ${prospect.name} (team: "${prospectTeam}")`);
                    console.warn(`[useGames]       Home: "${homeTeamName}", Away: "${awayTeamName}"`);
                    // Fallback: try to match from newGame arrays as last resort
                    const fallbackIsHome = (newGame.homeProspects || []).some(p => 
                      p.name === prospect.name && p.team === prospect.team
                    );
                    const fallbackIsAway = (newGame.awayProspects || []).some(p => 
                      p.name === prospect.name && p.team === prospect.team
                    );
                    if (fallbackIsHome && !newHomeProspects.some(p => p.name === prospect.name && p.team === prospect.team)) {
                      newHomeProspects.push(prospect);
                      console.log(`[useGames]     ✓ Fallback: Added to homeProspects`);
                    }
                    if (fallbackIsAway && !newAwayProspects.some(p => p.name === prospect.name && p.team === prospect.team)) {
                      newAwayProspects.push(prospect);
                      console.log(`[useGames]     ✓ Fallback: Added to awayProspects`);
                    }
                  }
                } else {
                  console.log(`[useGames]   ✗ Prospect ${prospect.name} already exists in game`);
                }
              }
              
              // Create new game object with updated prospects and other fields
              const updatedGame = {
                ...existingGame,
                prospects: newProspects,
                homeProspects: newHomeProspects,
                awayProspects: newAwayProspects,
                // Update other fields if new game has more complete data
                tv: existingGame.tv || newGame.tv,
                note: existingGame.note || newGame.note,
                venue: existingGame.venue || newGame.venue,
              };
              
              // CRITICAL: Create a NEW array for this date to ensure React detects the change
              // Simply replacing the game in the existing array won't trigger a re-render
              const gameIndex = merged[dateKey].indexOf(existingGame);
              if (gameIndex >= 0) {
                merged[dateKey] = [
                  ...merged[dateKey].slice(0, gameIndex),
                  updatedGame,
                  ...merged[dateKey].slice(gameIndex + 1),
                ];
                console.log(`[useGames] ✓ Replaced game at index ${gameIndex} with updated game (${newProspects.length} prospects)`);
              } else {
                console.warn(`[useGames] ⚠️ Could not find game index for replacement`);
              }
              gamesMerged++;
            } else {
              // New game - add it
              merged[dateKey].push(newGame);
              gamesAdded++;
            }
          }
        }
        
        console.log(`[useGames] ✅ INSTANT MERGE: Added ${gamesAdded} new games, merged prospects into ${gamesMerged} existing games for ${prospectName}`);
        
        // CRITICAL: Create a completely new GamesByDate object to ensure React detects the change
        // Also add version timestamps to all games to force React.memo to detect changes
        const version = Date.now();
        const newGamesByDate: GamesByDate = {};
        for (const [dateKey, gamesForDate] of Object.entries(merged)) {
          newGamesByDate[dateKey] = gamesForDate.map(game => ({
            ...game,
            _version: version, // Add version to force React.memo to see this as different
          }));
        }
        
        console.log(`[useGames] ✓ Created new GamesByDate object with ${Object.keys(newGamesByDate).length} dates (version: ${version})`);
        
        return newGamesByDate;
      });
      
      // Update cache silently (don't trigger loading state)
      try {
        const rankingsVersion = typeof window !== 'undefined' ? localStorage.getItem('rankingsVersion') : null;
        const mergeCacheKey = source === 'myboard' && rankingsVersion 
          ? `games_all_${source}_v${rankingsVersion.substring(0, 10)}`
          : `games_all_${source}`;
        // Get the merged games from state and cache them
        setGames((currentGames) => {
          setCachedData(mergeCacheKey, currentGames, source === 'myboard' ? 5 * 60 * 1000 : 10 * 60 * 1000);
          return currentGames; // Return unchanged to avoid double update
        });
      } catch (err) {
        // Ignore cache errors
      }
    } catch (err) {
      console.error('[useGames] Error adding watchlist games:', err);
      // Don't show error to user - silent failure
    }
  }, [source]);

  // Listen for player add/remove events and cache updates
  // NOTE: The global listener (globalPlayerEvents.ts) handles playerAdded/playerRemoved
  // and dispatches gamesCacheUpdated events. We only need to listen for those events here.
  useEffect(() => {
    const handlePlayerRemoved = (e: CustomEvent) => {
      const { playerId, playerName } = e.detail;
      console.log(`[useGames] Player removed event: ${playerName} (${playerId})`);
      removeTrackedPlayer(playerId, playerName);
    };
    
    // REMOVED: handlePlayerAdded - the global listener handles this and dispatches gamesCacheUpdated
    // This prevents duplicate fetches and reloads
    
    // Listen for cache updates from global listener (this is the main handler)
    // CRITICAL: This function MUST NEVER call setLoading(true) or loadGamesData
    // It should only merge games silently to prevent full reloads
    const handleGamesCacheUpdated = (e: CustomEvent) => {
      const eventDetail = e.detail || {};
      const action = eventDetail.action; // 'add' or undefined
      
      console.log(`[useGames] gamesCacheUpdated event received, action: ${action || 'none'}`);
      
      // Set flag to prevent any reloads during merge
      isMergingRef.current = true;
      
      // If this is an 'add' action, merge new games AND add player to existing games
      // CRITICAL: Do NOT call setLoading(true) or loadGamesData here
      if (action === 'add') {
        const newGames = (eventDetail.games || {}) as GamesByDate;
        const trackedPlayer = eventDetail.trackedPlayer;
        const playerTeam = eventDetail.playerTeam as string | undefined;
        const newGamesCount = Object.values(newGames).flat().length;
        const currentCount = Object.values(games).flat().length;
        
        console.log(`[useGames] Cache updated event (ADD): merging ${newGamesCount} new games, player: ${trackedPlayer?.playerName || 'unknown'}`);
        
        // Always update games if we have player info (to add player to existing games)
        // or if we have new games to add
        if (newGamesCount > 0 || trackedPlayer) {
          setGames((prevGames) => {
            // CRITICAL: Create a deep copy and add player to existing games
            const merged: GamesByDate = {};
            
            // Helper to check if player is on a team
            // STRICT matching to avoid "Alabama" matching "Alabama State"
            const SCHOOL_QUALIFIERS = ['state', 'tech', 'christian', 'am', 'southern', 'northern', 'eastern', 'western', 'central', 'atlantic', 'pacific', 'international', 'methodist', 'baptist', 'lutheran', 'coastal', 'poly'];
            
            const isPlayerOnTeam = (teamName: string): boolean => {
              if (!playerTeam) return false;
              const normalizedTeamName = normalizeTeamNameForKey(teamName);
              
              // Exact match is always valid
              if (normalizedTeamName === playerTeam) return true;
              
              // For substring matching, require minimum length
              if (playerTeam.length < 5) return false;
              
              // Check if one starts with the other
              let shorter = '', longer = '';
              if (normalizedTeamName.startsWith(playerTeam)) {
                shorter = playerTeam;
                longer = normalizedTeamName;
              } else if (playerTeam.startsWith(normalizedTeamName)) {
                shorter = normalizedTeamName;
                longer = playerTeam;
              } else {
                return false;
              }
              
              // Get the suffix
              const suffix = longer.substring(shorter.length);
              
              // If suffix starts with a school qualifier, it's a DIFFERENT school
              for (const qualifier of SCHOOL_QUALIFIERS) {
                if (suffix.startsWith(qualifier)) {
                  return false;
                }
              }
              
              return true;
            };
            
            let existingGamesUpdated = 0;
            
            for (const [dateKey, gamesForDate] of Object.entries(prevGames)) {
              merged[dateKey] = gamesForDate.map(game => {
                // If we have player info, add them to matching games
                if (trackedPlayer && playerTeam) {
                  const homeTeamName = game.homeTeam?.displayName || game.homeTeam?.name || '';
                  const awayTeamName = game.awayTeam?.displayName || game.awayTeam?.name || '';
                  const isOnHome = isPlayerOnTeam(homeTeamName);
                  const isOnAway = isPlayerOnTeam(awayTeamName);
                  
                  if (isOnHome || isOnAway) {
                    const updatedGame = { ...game };
                    if (!updatedGame.homeTrackedPlayers) updatedGame.homeTrackedPlayers = [];
                    if (!updatedGame.awayTrackedPlayers) updatedGame.awayTrackedPlayers = [];
                    
                    if (isOnHome && !updatedGame.homeTrackedPlayers.some(p => p.playerId === trackedPlayer.playerId)) {
                      updatedGame.homeTrackedPlayers = [...updatedGame.homeTrackedPlayers, trackedPlayer];
                      existingGamesUpdated++;
                      return updatedGame;
                    } else if (isOnAway && !updatedGame.awayTrackedPlayers.some(p => p.playerId === trackedPlayer.playerId)) {
                      updatedGame.awayTrackedPlayers = [...updatedGame.awayTrackedPlayers, trackedPlayer];
                      existingGamesUpdated++;
                      return updatedGame;
                    }
                  }
                }
                return game;
              });
            }
            
            console.log(`[useGames] Added ${trackedPlayer?.playerName || 'player'} to ${existingGamesUpdated} existing games in state`);
            
            const prevGamesCount = Object.values(prevGames).flat().length;
            console.log(`[useGames] Before merge: ${prevGamesCount} existing games across ${Object.keys(prevGames).length} dates`);
            
            let prospectsAdded = 0;
            let gamesMerged = 0;
            let gamesAdded = 0;
            
            // Merge new games from event into existing games using proper matching
            for (const [dateKey, gamesForDate] of Object.entries(newGames)) {
              if (!merged[dateKey]) {
                merged[dateKey] = [];
              }
              
              // Build lookup maps for existing games
              const existingGamesByKey = new Map<string, GameWithProspects>();
              const existingGamesByTeamIds = new Map<string, GameWithProspects>();
              
              console.log(`[useGames] 📋 Building lookup maps for ${merged[dateKey].length} existing games on ${dateKey}`);
              
              for (const existingGame of merged[dateKey]) {
                const key = existingGame.gameKey || getGameKey(existingGame);
                existingGamesByKey.set(key, existingGame);
                
                const gDate = existingGame.dateKey || existingGame.date;
                const gHomeId = String(existingGame.homeTeam.id || '').trim();
                const gAwayId = String(existingGame.awayTeam.id || '').trim();
                const gHomeName = normalizeTeamNameForKey(existingGame.homeTeam.displayName || existingGame.homeTeam.name || '');
                const gAwayName = normalizeTeamNameForKey(existingGame.awayTeam.displayName || existingGame.awayTeam.name || '');
                
                console.log(`[useGames]   Existing game: ${existingGame.homeTeam.displayName || existingGame.homeTeam.name} vs ${existingGame.awayTeam.displayName || existingGame.awayTeam.name}`);
                console.log(`[useGames]     IDs: home="${gHomeId}", away="${gAwayId}"`);
                console.log(`[useGames]     Normalized names: home="${gHomeName}", away="${gAwayName}"`);
                console.log(`[useGames]     Game key: ${key}`);
                
                if (gHomeId && gAwayId) {
                  const teamIdsKey = `${gDate}|${[gHomeId, gAwayId].sort().join('|')}`;
                  existingGamesByTeamIds.set(teamIdsKey, existingGame);
                  console.log(`[useGames]     ✓ Indexed by team IDs: ${teamIdsKey}`);
                } else {
                  console.log(`[useGames]     ⚠️ No team IDs available for indexing`);
                }
                
                if (gHomeName && gAwayName) {
                  const teamNamesKey = `${gDate}|${[gHomeName, gAwayName].sort().join('|')}`;
                  existingGamesByTeamIds.set(teamNamesKey, existingGame);
                  console.log(`[useGames]     ✓ Indexed by team names: ${teamNamesKey}`);
                } else {
                  console.log(`[useGames]     ⚠️ No team names available for indexing`);
                }
              }
              
              console.log(`[useGames] 📋 Built lookup maps: ${existingGamesByKey.size} by key, ${existingGamesByTeamIds.size} by team IDs/names`);
              
              // Merge each new game
              for (const newGame of gamesForDate) {
                const newGameKey = newGame.gameKey || getGameKey(newGame);
                const newGameDate = newGame.dateKey || newGame.date;
                const newHomeId = String(newGame.homeTeam.id || '').trim();
                const newAwayId = String(newGame.awayTeam.id || '').trim();
                const newHomeName = normalizeTeamNameForKey(newGame.homeTeam.displayName || newGame.homeTeam.name || '');
                const newAwayName = normalizeTeamNameForKey(newGame.awayTeam.displayName || newGame.awayTeam.name || '');
                
                console.log(`[useGames] 🔍 Looking for existing game: ${newGame.homeTeam.displayName || newGame.homeTeam.name} vs ${newGame.awayTeam.displayName || newGame.awayTeam.name} on ${newGameDate}`);
                console.log(`[useGames]   New game IDs: home="${newHomeId}", away="${newAwayId}"`);
                console.log(`[useGames]   New normalized names: home="${newHomeName}", away="${newAwayName}"`);
                console.log(`[useGames]   New game key: ${newGameKey}`);
                
                // Find existing game - try multiple matching strategies
                let existingGame: GameWithProspects | undefined;
                
                // Strategy 1: Match by team IDs (most reliable)
                if (newHomeId && newAwayId) {
                  const teamIdsKey = `${newGameDate}|${[newHomeId, newAwayId].sort().join('|')}`;
                  existingGame = existingGamesByTeamIds.get(teamIdsKey);
                  if (existingGame) {
                    console.log(`[useGames] ✅ Found match by team IDs: ${teamIdsKey}`);
                  }
                }
                
                // Strategy 2: Match by normalized team names
                if (!existingGame && newHomeName && newAwayName) {
                  const teamNamesKey = `${newGameDate}|${[newHomeName, newAwayName].sort().join('|')}`;
                  existingGame = existingGamesByTeamIds.get(teamNamesKey);
                  if (existingGame) {
                    console.log(`[useGames] ✅ Found match by normalized team names: ${teamNamesKey}`);
                  }
                }
                
                // Strategy 3: Match by game key
                if (!existingGame) {
                  existingGame = existingGamesByKey.get(newGameKey);
                  if (existingGame) {
                    console.log(`[useGames] ✅ Found match by game key: ${newGameKey}`);
                  }
                }
                
                // Strategy 4: Fallback - search all games on this date for fuzzy match
                if (!existingGame) {
                  console.log(`[useGames] ⚠️ No exact match found, trying fuzzy match...`);
                  console.log(`[useGames]   Searching through ${merged[dateKey].length} existing games on ${newGameDate}`);
                  
                  existingGame = merged[dateKey].find(g => {
                    const gDate = g.dateKey || g.date;
                    if (gDate !== newGameDate) return false;
                    
                    const gHomeName = normalizeTeamNameForKey(g.homeTeam.displayName || g.homeTeam.name || '');
                    const gAwayName = normalizeTeamNameForKey(g.awayTeam.displayName || g.awayTeam.name || '');
                    const gHomeId = String(g.homeTeam.id || '').trim();
                    const gAwayId = String(g.awayTeam.id || '').trim();
                    
                    // Try matching by team IDs first (even if not in map)
                    if (newHomeId && newAwayId && gHomeId && gAwayId) {
                      const newIds = [newHomeId, newAwayId].sort().join('|');
                      const gIds = [gHomeId, gAwayId].sort().join('|');
                      if (newIds === gIds) {
                        console.log(`[useGames] ✅ Fuzzy match found: team IDs match (${newIds})`);
                        return true;
                      }
                    }
                    
                    // Try exact normalized match
                    if ((gHomeName === newHomeName && gAwayName === newAwayName) ||
                        (gHomeName === newAwayName && gAwayName === newHomeName)) {
                      console.log(`[useGames] ✅ Fuzzy match found: exact normalized names`);
                      return true;
                    }
                    
                    // Try substring match (e.g., "Nebraska" matches "Nebraska Cornhuskers")
                    // Check if both teams match (either order)
                    const matchesHomeFirst = (gHomeName.includes(newHomeName) || newHomeName.includes(gHomeName)) &&
                                           (gAwayName.includes(newAwayName) || newAwayName.includes(gAwayName));
                    const matchesAwayFirst = (gHomeName.includes(newAwayName) || newAwayName.includes(gHomeName)) &&
                                            (gAwayName.includes(newHomeName) || newHomeName.includes(gAwayName));
                    
                    if (matchesHomeFirst || matchesAwayFirst) {
                      console.log(`[useGames] ✅ Fuzzy match found: substring match`);
                      console.log(`[useGames]     Existing: "${gHomeName}" vs "${gAwayName}"`);
                      console.log(`[useGames]     New: "${newHomeName}" vs "${newAwayName}"`);
                      return true;
                    }
                    
                    return false;
                  });
                  
                  if (!existingGame) {
                    console.log(`[useGames] ❌ No fuzzy match found either`);
                  }
                }
                
                if (!existingGame) {
                  console.log(`[useGames] ❌ No match found - will add as new game`);
                  console.log(`[useGames]   Existing games on ${newGameDate}: ${merged[dateKey].length}`);
                  for (let i = 0; i < Math.min(merged[dateKey].length, 3); i++) {
                    const g = merged[dateKey][i];
                    const gHomeName = normalizeTeamNameForKey(g.homeTeam.displayName || g.homeTeam.name || '');
                    const gAwayName = normalizeTeamNameForKey(g.awayTeam.displayName || g.awayTeam.name || '');
                    console.log(`[useGames]     Existing game ${i}: ${g.homeTeam.name} vs ${g.awayTeam.name} (normalized: ${gHomeName} vs ${gAwayName})`);
                  }
                }
                
                if (existingGame) {
                  console.log(`[useGames] ✅ Found existing game to merge into!`);
                  console.log(`[useGames]   Existing game: ${existingGame.homeTeam.displayName || existingGame.homeTeam.name} vs ${existingGame.awayTeam.displayName || existingGame.awayTeam.name}`);
                  console.log(`[useGames]   Existing prospects: ${(existingGame.prospects || []).length}`);
                  console.log(`[useGames]   New game prospects: ${(newGame.prospects || []).length}`);
                  
                  // Merge prospects into existing game - create new arrays to trigger React re-render
                  const existingProspectIds = new Set((existingGame.prospects || []).map(p => `${p.name}|${p.team || ''}`));
                  const newProspects = [...(existingGame.prospects || [])];
                  const newHomeProspects = [...(existingGame.homeProspects || [])];
                  const newAwayProspects = [...(existingGame.awayProspects || [])];
                  
                  // CRITICAL: Also update homeTrackedPlayers and awayTrackedPlayers arrays
                  // These are what the game cards actually display!
                  const newHomeTrackedPlayers = [...(existingGame.homeTrackedPlayers || [])];
                  const newAwayTrackedPlayers = [...(existingGame.awayTrackedPlayers || [])];
                  const existingTrackedIds = new Set([
                    ...newHomeTrackedPlayers.map(p => p.playerName.toLowerCase()),
                    ...newAwayTrackedPlayers.map(p => p.playerName.toLowerCase()),
                  ]);
                  
                  // Helper function to normalize team names for matching
                  const normalizeForMatch = (name: string) => {
                    return name
                      .replace(/\s+(spartans|bears|lions|tigers|wildcats|bulldogs|eagles|hawks|owls|panthers|warriors|knights|pirates|raiders|cougars|hornets|jayhawks|tar heels|blue devils|crimson tide|fighting irish|wolverines|seminoles|nittany lions|fighting camels|pioneers|golden gophers)$/i, '')
                      .trim();
                  };
                  
                  const homeTeamName = (existingGame.homeTeam.displayName || existingGame.homeTeam.name || '').toLowerCase().trim();
                  const awayTeamName = (existingGame.awayTeam.displayName || existingGame.awayTeam.name || '').toLowerCase().trim();
                  const normalizedHomeTeam = normalizeForMatch(homeTeamName);
                  const normalizedAwayTeam = normalizeForMatch(awayTeamName);
                  
                  console.log(`[useGames]   Home team: "${homeTeamName}" (normalized: "${normalizedHomeTeam}")`);
                  console.log(`[useGames]   Away team: "${awayTeamName}" (normalized: "${normalizedAwayTeam}")`);
                  
                  for (const prospect of (newGame.prospects || [])) {
                    const prospectId = `${prospect.name}|${prospect.team || ''}`;
                    console.log(`[useGames]   Processing prospect: ${prospect.name} (team: "${prospect.team || prospect.teamDisplay}")`);
                    
                    if (!existingProspectIds.has(prospectId)) {
                      console.log(`[useGames]     ✓ Adding prospect ${prospect.name} to existing game`);
                      newProspects.push(prospect);
                      existingProspectIds.add(prospectId);
                      prospectsAdded++;
                      
                      // Determine prospect side by comparing team names directly
                      const prospectTeam = (prospect.team || prospect.teamDisplay || '').toLowerCase().trim();
                      const normalizedProspectTeam = normalizeForMatch(prospectTeam);
                      
                      console.log(`[useGames]     Prospect team: "${prospectTeam}" (normalized: "${normalizedProspectTeam}")`);
                      
                      const isHome = normalizedProspectTeam === normalizedHomeTeam || 
                                     homeTeamName.includes(normalizedProspectTeam) || 
                                     normalizedProspectTeam.includes(normalizedHomeTeam);
                      const isAway = normalizedProspectTeam === normalizedAwayTeam || 
                                     awayTeamName.includes(normalizedProspectTeam) || 
                                     normalizedProspectTeam.includes(normalizedAwayTeam);
                      
                      console.log(`[useGames]     Side determination: home=${isHome}, away=${isAway}`);
                      
                      if (isHome && !newHomeProspects.some(p => p.name === prospect.name && p.team === prospect.team)) {
                        newHomeProspects.push(prospect);
                        console.log(`[useGames]     ✓ Added to homeProspects`);
                        
                        // CRITICAL: Also add to homeTrackedPlayers for game card display
                        if (!existingTrackedIds.has(prospect.name.toLowerCase())) {
                          const trackedInfo = {
                            playerId: `${prospect.name.toLowerCase()}|${(prospect.team || '').toLowerCase()}`,
                            playerName: prospect.name,
                            team: prospect.team || '',
                            teamDisplay: prospect.teamDisplay,
                            teamId: prospect.teamId,
                            type: (prospect.isWatchlist ? 'watchlist' : 'myBoard') as 'watchlist' | 'myBoard',
                            rank: prospect.rank,
                            isWatchlist: prospect.isWatchlist,
                          };
                          newHomeTrackedPlayers.push(trackedInfo);
                          existingTrackedIds.add(prospect.name.toLowerCase());
                          console.log(`[useGames]     ✓ Added to homeTrackedPlayers: ${prospect.name} (${trackedInfo.type})`);
                        }
                      }
                      if (isAway && !newAwayProspects.some(p => p.name === prospect.name && p.team === prospect.team)) {
                        newAwayProspects.push(prospect);
                        console.log(`[useGames]     ✓ Added to awayProspects`);
                        
                        // CRITICAL: Also add to awayTrackedPlayers for game card display
                        if (!existingTrackedIds.has(prospect.name.toLowerCase())) {
                          const trackedInfo = {
                            playerId: `${prospect.name.toLowerCase()}|${(prospect.team || '').toLowerCase()}`,
                            playerName: prospect.name,
                            team: prospect.team || '',
                            teamDisplay: prospect.teamDisplay,
                            teamId: prospect.teamId,
                            type: (prospect.isWatchlist ? 'watchlist' : 'myBoard') as 'watchlist' | 'myBoard',
                            rank: prospect.rank,
                            isWatchlist: prospect.isWatchlist,
                          };
                          newAwayTrackedPlayers.push(trackedInfo);
                          existingTrackedIds.add(prospect.name.toLowerCase());
                          console.log(`[useGames]     ✓ Added to awayTrackedPlayers: ${prospect.name} (${trackedInfo.type})`);
                        }
                      }
                      
                      // Fallback: if we can't determine side, use the arrays from newGame
                      if (!isHome && !isAway) {
                        console.warn(`[useGames]     ⚠️ Could not determine side, using fallback`);
                        const fallbackIsHome = (newGame.homeProspects || []).some(p => 
                          p.name === prospect.name && p.team === prospect.team
                        );
                        const fallbackIsAway = (newGame.awayProspects || []).some(p => 
                          p.name === prospect.name && p.team === prospect.team
                        );
                        if (fallbackIsHome && !newHomeProspects.some(p => p.name === prospect.name && p.team === prospect.team)) {
                          newHomeProspects.push(prospect);
                          console.log(`[useGames]     ✓ Fallback: Added to homeProspects`);
                          
                          // Also add to homeTrackedPlayers
                          if (!existingTrackedIds.has(prospect.name.toLowerCase())) {
                            const trackedInfo = {
                              playerId: `${prospect.name.toLowerCase()}|${(prospect.team || '').toLowerCase()}`,
                              playerName: prospect.name,
                              team: prospect.team || '',
                              teamDisplay: prospect.teamDisplay,
                              teamId: prospect.teamId,
                              type: (prospect.isWatchlist ? 'watchlist' : 'myBoard') as 'watchlist' | 'myBoard',
                              rank: prospect.rank,
                              isWatchlist: prospect.isWatchlist,
                            };
                            newHomeTrackedPlayers.push(trackedInfo);
                            existingTrackedIds.add(prospect.name.toLowerCase());
                            console.log(`[useGames]     ✓ Fallback: Added to homeTrackedPlayers`);
                          }
                        }
                        if (fallbackIsAway && !newAwayProspects.some(p => p.name === prospect.name && p.team === prospect.team)) {
                          newAwayProspects.push(prospect);
                          console.log(`[useGames]     ✓ Fallback: Added to awayProspects`);
                          
                          // Also add to awayTrackedPlayers
                          if (!existingTrackedIds.has(prospect.name.toLowerCase())) {
                            const trackedInfo = {
                              playerId: `${prospect.name.toLowerCase()}|${(prospect.team || '').toLowerCase()}`,
                              playerName: prospect.name,
                              team: prospect.team || '',
                              teamDisplay: prospect.teamDisplay,
                              teamId: prospect.teamId,
                              type: (prospect.isWatchlist ? 'watchlist' : 'myBoard') as 'watchlist' | 'myBoard',
                              rank: prospect.rank,
                              isWatchlist: prospect.isWatchlist,
                            };
                            newAwayTrackedPlayers.push(trackedInfo);
                            existingTrackedIds.add(prospect.name.toLowerCase());
                            console.log(`[useGames]     ✓ Fallback: Added to awayTrackedPlayers`);
                          }
                        }
                      }
                    } else {
                      console.log(`[useGames]     ✗ Prospect ${prospect.name} already exists in game`);
                    }
                  }
                  
                  console.log(`[useGames]   After merge: ${newProspects.length} total prospects (${newHomeProspects.length} home, ${newAwayProspects.length} away)`);
                  console.log(`[useGames]   Tracked players: ${newHomeTrackedPlayers.length} home, ${newAwayTrackedPlayers.length} away`);
                  
                  // Create new game object to trigger React re-render
                  // CRITICAL: Create a completely new object with new arrays to ensure React detects the change
                  // Add a version timestamp to force React.memo to see this as a different object
                  const updatedGame: GameWithProspects & { _version?: number } = {
                    ...existingGame,
                    prospects: [...newProspects], // New array reference
                    homeProspects: [...newHomeProspects], // New array reference
                    awayProspects: [...newAwayProspects], // New array reference
                    // CRITICAL: Also include updated tracked players arrays for game card display
                    homeTrackedPlayers: [...newHomeTrackedPlayers],
                    awayTrackedPlayers: [...newAwayTrackedPlayers],
                    // Also create new team objects to ensure React detects changes
                    homeTeam: { ...existingGame.homeTeam },
                    awayTeam: { ...existingGame.awayTeam },
                    // Add version timestamp to force React.memo to detect change
                    _version: Date.now(),
                  };
                  
                  // CRITICAL: Create a NEW array for this date to ensure React detects the change
                  // Simply replacing the game in the existing array won't trigger a re-render
                  const gameIndex = merged[dateKey].indexOf(existingGame);
                  if (gameIndex >= 0) {
                    merged[dateKey] = [
                      ...merged[dateKey].slice(0, gameIndex),
                      updatedGame,
                      ...merged[dateKey].slice(gameIndex + 1),
                    ];
                    console.log(`[useGames] ✓ Replaced game at index ${gameIndex} with updated game (${newProspects.length} prospects, ${newHomeProspects.length} home, ${newAwayProspects.length} away)`);
                  } else {
                    console.warn(`[useGames] ⚠️ Could not find game index for replacement`);
                  }
                  gamesMerged++;
                } else {
                  // New game - add it
                  merged[dateKey].push(newGame);
                  gamesAdded++;
                }
              }
            }
            
            const finalGamesCount = Object.values(merged).flat().length;
            const finalDatesCount = Object.keys(merged).length;
            console.log(`[useGames] ✓ Merged cache update: ${finalGamesCount} total games across ${finalDatesCount} dates`);
            console.log(`[useGames]   - ${gamesMerged} games merged (prospects added)`);
            console.log(`[useGames]   - ${gamesAdded} new games added`);
            console.log(`[useGames]   - ${prospectsAdded} prospects added to existing games`);
            console.log(`[useGames]   - Preserved ${prevGamesCount} existing games`);
            
            // CRITICAL: Verify we didn't lose any games
            if (finalGamesCount < prevGamesCount) {
              console.warn(`[useGames] ⚠️ WARNING: Lost ${prevGamesCount - finalGamesCount} games during merge!`);
              console.warn(`[useGames]   This should not happen - all existing games should be preserved`);
            }
            
            // CRITICAL: Create a completely new GamesByDate object to ensure React detects the change
            // Also add version timestamps to all games to force React.memo to detect changes
            const version = Date.now();
            const newGamesByDate: GamesByDate = {};
            for (const [dateKey, gamesForDate] of Object.entries(merged)) {
              newGamesByDate[dateKey] = gamesForDate.map(game => ({
                ...game,
                _version: version, // Add version to force React.memo to see this as different
              }));
            }
            
            console.log(`[useGames] ✓ Created new GamesByDate object with ${Object.keys(newGamesByDate).length} dates (version: ${version})`);
            
            // Increment version counter to force React to detect the change
            setGamesVersion(prev => prev + 1);
            console.log(`[useGames] ✓ Incremented games version to force re-render`);
            
            return newGamesByDate;
          });
          
          // CRITICAL: Do NOT update cache here - that could trigger other listeners
          // The global listener already updated the cache
          console.log(`[useGames] ✓ Merged games silently without reload`);
        } else {
          console.log(`[useGames] No new games to merge (count: ${newGamesCount})`);
        }
        
        // Clear merge flag after merge completes
        setTimeout(() => {
          isMergingRef.current = false;
        }, 100);
      } else if (action === 'remove') {
        // Player removed - the cache was already updated by globalPlayerEvents
        // and removeTrackedPlayer already updated the games state via playerRemoved event
        // So we just need to log and NOT replace the state (which would overwrite the correct state)
        const playerName = eventDetail.playerName as string;
        const playerId = eventDetail.playerId as string;
        
        console.log(`[useGames] Cache updated event (REMOVE): player ${playerName} (${playerId}) - cache updated, state already handled by removeTrackedPlayer`);
        
        // Clear merge flag
        setTimeout(() => {
          isMergingRef.current = false;
        }, 100);
      } else if (e.detail?.games && !action) {
        // Fallback: use event detail if action is not 'add', but merge instead of replace
        // This should rarely happen, but handle it gracefully
        const eventGames = e.detail.games as GamesByDate;
        const eventCount = Object.values(eventGames).flat().length;
        console.log(`[useGames] Cache updated event received (no action), using event detail: ${eventCount} games`);
        
        if (eventCount > 0) {
          setGames((prevGames) => {
            const merged: GamesByDate = { ...prevGames };
            
            // Merge new games from event into existing games
            for (const [dateKey, gamesForDate] of Object.entries(eventGames)) {
              if (!merged[dateKey]) {
                merged[dateKey] = [];
              }
              
              const existingIds = new Set(merged[dateKey].map(g => g.id));
              const uniqueNewGames = gamesForDate.filter(g => !existingIds.has(g.id));
              
              if (uniqueNewGames.length > 0) {
                merged[dateKey] = [...merged[dateKey], ...uniqueNewGames];
              }
            }
            
            return merged;
          });
        }
      } else {
        console.warn('[useGames] Cache updated event received but no games found in cache or event');
      }
      
      // CRITICAL: NEVER call setLoading(true) or loadGamesData here
      // This function should only merge silently
      
      // Clear merge flag
      setTimeout(() => {
        isMergingRef.current = false;
      }, 100);
    };
    
    // Also poll localStorage for playerAdded/playerRemoved events (backup for cross-page)
    // This ensures we catch events even if dispatched before this hook mounts
    const checkForPlayerEvents = () => {
      try {
        const playerAdded = localStorage.getItem('playerAdded');
        const playerRemoved = localStorage.getItem('playerRemoved');
        
        if (playerAdded) {
          const data = JSON.parse(playerAdded);
          const { playerId, playerName, playerTeam, timestamp } = data;
          // Only process if event is recent (within last 5 seconds)
          if (timestamp && Date.now() - timestamp < 5000) {
            console.log(`[useGames] Found recent playerAdded in localStorage: ${playerName}`);
            localStorage.removeItem('playerAdded');
            // Trigger global listener by dispatching event
            window.dispatchEvent(new CustomEvent('playerAdded', {
              detail: { playerId, playerName, playerTeam, type: 'watchlist' }
            }));
          } else if (!timestamp) {
            // Old format, process anyway
            console.log(`[useGames] Found playerAdded in localStorage (old format): ${playerName}`);
            localStorage.removeItem('playerAdded');
            window.dispatchEvent(new CustomEvent('playerAdded', {
              detail: { playerId, playerName, playerTeam, type: 'watchlist' }
            }));
          }
        }
        
        if (playerRemoved) {
          const data = JSON.parse(playerRemoved);
          const { playerId, playerName, timestamp } = data;
          // Only process if event is recent (within last 5 seconds)
          if (timestamp && Date.now() - timestamp < 5000) {
            console.log(`[useGames] Found recent playerRemoved in localStorage: ${playerName}`);
            localStorage.removeItem('playerRemoved');
            // Trigger global listener by dispatching event
            window.dispatchEvent(new CustomEvent('playerRemoved', {
              detail: { playerId, playerName, type: 'watchlist' }
            }));
          } else if (!timestamp) {
            // Old format, process anyway
            console.log(`[useGames] Found playerRemoved in localStorage (old format): ${playerName}`);
            localStorage.removeItem('playerRemoved');
            window.dispatchEvent(new CustomEvent('playerRemoved', {
              detail: { playerId, playerName, type: 'watchlist' }
            }));
          }
        }
      } catch (err) {
        // Ignore errors
      }
    };
    
    // Check immediately and set up polling
    checkForPlayerEvents();
    const pollInterval = setInterval(checkForPlayerEvents, 500); // Check every 500ms
    
    window.addEventListener('playerRemoved', handlePlayerRemoved as EventListener);
    // REMOVED: playerAdded listener - handled by global listener which dispatches gamesCacheUpdated
    window.addEventListener('gamesCacheUpdated', handleGamesCacheUpdated as EventListener);
    
    return () => {
      window.removeEventListener('playerRemoved', handlePlayerRemoved as EventListener);
      // REMOVED: playerAdded listener cleanup
      window.removeEventListener('gamesCacheUpdated', handleGamesCacheUpdated as EventListener);
      clearInterval(pollInterval);
    };
  }, [removeTrackedPlayer]); // Removed addWatchlistGames - it's no longer used (global listener handles it)

  return { games, loading, error, loadingMessage, updating, fetchGames, refresh, updateProspectRanks, source };
}
