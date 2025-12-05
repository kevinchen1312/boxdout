'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { GameWithProspects } from '../utils/gameMatching';
import { getCachedData, getStaleCachedData, setCachedData, clearExpiredCache, clearCacheByKey } from '../utils/browserCache';

export type GamesByDate = Record<string, GameWithProspects[]>;
export type RankingSource = 'espn' | 'myboard';

interface UseGamesOptions {
  source?: RankingSource;
}

export function useGames(options: UseGamesOptions = {}) {
  const { source = 'espn' } = options;
  const [games, setGames] = useState<GamesByDate>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('Loading schedules...');
  const [updating, setUpdating] = useState(false);
  const loadedSourceRef = useRef<RankingSource | null>(null);
  const refreshTriggerRef = useRef(0);

  // Function to load games data (extracted for reuse)
  const loadGamesData = useCallback(async (forceRefresh = false, signal?: AbortSignal) => {
    let alive = true;
    if (signal) {
      signal.addEventListener('abort', () => {
        alive = false;
      });
    }
    
    try {
      console.time('[useGames] Total load time');
      setLoading(true);
      setLoadingMessage(forceRefresh ? 'Refreshing schedules...' : 'Checking cache...');
      
      // Clear expired cache entries on mount (async, non-blocking)
      setTimeout(() => clearExpiredCache(), 0);
      
      // If force refresh, clear cache first
      if (forceRefresh) {
        const cacheKey = `games_all_${source}`;
        clearCacheByKey(cacheKey);
      }
      
      // Try to get from cache first (with error handling for browsers that block localStorage)
      // Show cached data immediately even if stale, then refresh in background
      let cached: GamesByDate | null = null;
      if (!forceRefresh) {
        try {
          const cacheKey = `games_all_${source}`;
          // First try fresh cache
          cached = getCachedData<GamesByDate>(cacheKey);
          // If no fresh cache, try stale cache (for immediate display)
          if (!cached) {
            cached = getStaleCachedData<GamesByDate>(cacheKey);
          }
        } catch (err) {
          console.warn('[useGames] Cache read failed (localStorage may be disabled):', err);
        }
      }
      
      // If we have cached data (fresh or stale), show it immediately
      // Skip background revalidation to avoid any delays - rankings will update in-place when needed
      if (cached && alive && Object.keys(cached).length > 0) {
        console.log('[useGames] Showing cached games immediately (skipping background revalidation for instant display)');
        setGames(cached);
        setLoading(false); // Don't show loading spinner - we have data to show
        loadedSourceRef.current = source;
        console.timeEnd('[useGames] Total load time');
        
        // DON'T do background revalidation - it causes delays
        // Rankings will be updated in-place via updateProspectRanks() when rankings change
        // This ensures gamecards stay visible and only rankings update instantly
        
        return;
      }
      
      // No cache available - must fetch fresh data
      // Only show loading spinner if we truly have no data
      setLoadingMessage('Loading schedules...');
      
      // Phase 1: Load today's games first for quick display
      console.time('[useGames] Today fetch time');
      const todayResponse = await fetch(`/api/games/today?source=${source}`, {
        cache: 'no-store',
      });
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
      const response = await fetch(`/api/games/all?source=${source}${forceReload || forceRefresh ? '&forceReload=true' : ''}`, {
        cache: 'no-store', // Force fresh fetch
      });
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
        setGames(gamesByDate);
        setLoading(false);
        setLoadingMessage('Loaded successfully ✓');
        loadedSourceRef.current = source;
        
        // Store in cache for next time (with error handling)
        // Cache for 10 minutes - balances freshness with performance
        try {
          const cacheKey = `games_all_${source}`;
          setCachedData(cacheKey, gamesByDate, 10 * 60 * 1000); // Cache for 10 minutes
        } catch (err) {
          console.warn('[useGames] Failed to cache data (localStorage may be disabled):', err);
          // Continue anyway - caching is optional
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
  useEffect(() => {
    // If we've already loaded this source, skip
    if (loadedSourceRef.current === source && Object.keys(games).length > 0 && refreshTriggerRef.current === 0) {
      return;
    }
    
    const abortController = new AbortController();
    loadGamesData(false, abortController.signal);
    
    return () => {
      abortController.abort();
    };
  }, [source, loadGamesData]);

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
        updatedGames[dateKey] = gamesForDate
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
      }
      
      console.log(`[useGames] Removed ${playerName} from games, removed ${removedGameCount} empty gamecards`);
      return updatedGames;
    });
  }, []);

  // Add games for a new watchlist player
  const addWatchlistGames = useCallback(async (prospectId: string, prospectName: string, prospectTeam: string) => {
    try {
      console.log(`[useGames] Fetching games for new watchlist player: ${prospectName} (ID: ${prospectId}, Team: ${prospectTeam})`);
      
      // Fetch only this prospect's games
      const url = `/api/games/prospects?prospectIds=${encodeURIComponent(prospectId)}&source=${source}`;
      console.log(`[useGames] Calling: ${url}`);
      
      const response = await fetch(url, {
        cache: 'no-store',
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[useGames] Failed to fetch prospect games: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Failed to fetch prospect games: ${response.status}`);
      }
      
      const newGamesData = await response.json();
      const newGames: GamesByDate = newGamesData.games || {};
      
      const totalNewGames = Object.values(newGames).flat().length;
      console.log(`[useGames] Received ${totalNewGames} games across ${Object.keys(newGames).length} dates for ${prospectName}`);
      
      if (totalNewGames === 0) {
        console.warn(`[useGames] ⚠️ No games found for ${prospectName} (${prospectTeam}). This might be because:`);
        console.warn(`[useGames]   1. Games aren't loaded yet in loadAllSchedules`);
        console.warn(`[useGames]   2. Team name matching failed (looking for: "${prospectTeam}")`);
        console.warn(`[useGames]   3. Games exist but player isn't decorated yet`);
      }
      
      // Merge into existing cache
      setGames((prevGames) => {
        const merged: GamesByDate = { ...prevGames };
        let totalMerged = 0;
        
        for (const [dateKey, gamesForDate] of Object.entries(newGames)) {
          if (!merged[dateKey]) {
            merged[dateKey] = [];
          }
          
          // Add new games, avoiding duplicates
          const existingIds = new Set(merged[dateKey].map(g => g.id));
          const uniqueNewGames = gamesForDate.filter(g => !existingIds.has(g.id));
          merged[dateKey] = [...merged[dateKey], ...uniqueNewGames];
          totalMerged += uniqueNewGames.length;
        }
        
        console.log(`[useGames] ✓ Merged ${totalMerged} new games for ${prospectName} (${totalNewGames - totalMerged} were duplicates)`);
        return merged;
      });
      
      // Re-decorate all games with updated tracked players (to show new player on existing games)
      // This will happen automatically on next rankings update, or we can trigger it here
    } catch (err) {
      console.error('[useGames] Error adding watchlist games:', err);
    }
  }, [source]);

  // Listen for player add/remove events (backup - global listener also handles this)
  useEffect(() => {
    const handlePlayerRemoved = (e: CustomEvent) => {
      const { playerId, playerName } = e.detail;
      console.log(`[useGames] Player removed event: ${playerName} (${playerId})`);
      removeTrackedPlayer(playerId, playerName);
    };
    
    const handlePlayerAdded = (e: CustomEvent) => {
      const { playerId, playerName, playerTeam } = e.detail;
      console.log(`[useGames] Player added event: ${playerName} (${playerId})`);
      addWatchlistGames(playerId, playerName, playerTeam);
    };
    
    // Also listen for cache updates from global listener
    const handleGamesCacheUpdated = (e: CustomEvent) => {
      // CRITICAL: Read from cache directly, don't trust event detail (might be stale)
      const cacheKey = `games_all_${source}`;
      const cachedGames = getCachedData<GamesByDate>(cacheKey);
      
      if (cachedGames) {
        console.log(`[useGames] Cache updated event received, reading from cache: ${Object.values(cachedGames).flat().length} games`);
        setGames(cachedGames);
      } else if (e.detail?.games) {
        // Fallback: use event detail if cache read fails
        console.log(`[useGames] Cache updated event received, using event detail: ${Object.values(e.detail.games).flat().length} games`);
        setGames(e.detail.games);
      } else {
        console.warn('[useGames] Cache updated event received but no games found in cache or event');
      }
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
    window.addEventListener('playerAdded', handlePlayerAdded as EventListener);
    window.addEventListener('gamesCacheUpdated', handleGamesCacheUpdated as EventListener);
    
    return () => {
      window.removeEventListener('playerRemoved', handlePlayerRemoved as EventListener);
      window.removeEventListener('playerAdded', handlePlayerAdded as EventListener);
      window.removeEventListener('gamesCacheUpdated', handleGamesCacheUpdated as EventListener);
      clearInterval(pollInterval);
    };
  }, [removeTrackedPlayer, addWatchlistGames]);

  return { games, loading, error, loadingMessage, updating, fetchGames, refresh, updateProspectRanks, source };
}
