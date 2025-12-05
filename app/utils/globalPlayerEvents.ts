/**
 * Global event listener for playerAdded/playerRemoved events
 * Works across all pages, not just where useGames is mounted
 */

import type { GamesByDate } from '../hooks/useGames';
import { getCachedData, setCachedData } from './browserCache';

type RankingSource = 'espn' | 'myboard';

/**
 * Creates a canonical player ID (same as in lib/trackedPlayers.ts)
 */
function createCanonicalPlayerId(name: string, team: string, teamDisplay?: string): string {
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
}

/**
 * Removes a player from cached games
 */
async function removePlayerFromCache(playerId: string, playerName: string, source: RankingSource = 'myboard') {
  try {
    const cacheKey = `games_all_${source}`;
    const cached = getCachedData<GamesByDate>(cacheKey);
    
    if (!cached) {
      console.log(`[globalPlayerEvents] No cached games found for ${source}, skipping removal`);
      return;
    }
    
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
    
    const updated: GamesByDate = {};
    let removedGameCount = 0;
    
    for (const [dateKey, gamesForDate] of Object.entries(cached)) {
      updated[dateKey] = gamesForDate
        .map(game => {
          // Remove player from tracked players arrays
          const newHomeTracked = (game.homeTrackedPlayers || [])
            .filter(p => p.playerId !== playerId);
          const newAwayTracked = (game.awayTrackedPlayers || [])
            .filter(p => p.playerId !== playerId);
          
          // Also remove from old prospect arrays
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
    
    // Update cache
    setCachedData(cacheKey, updated, 10 * 60 * 1000);
    
    console.log(`[globalPlayerEvents] Removed ${playerName} from cache, removed ${removedGameCount} empty gamecards`);
    
    // Dispatch event to notify useGames hook if it's mounted
    window.dispatchEvent(new CustomEvent('gamesCacheUpdated', { detail: { games: updated } }));
  } catch (err) {
    console.error('[globalPlayerEvents] Error removing player from cache:', err);
  }
}

/**
 * Adds games for a new watchlist player
 */
async function addPlayerGames(playerId: string, playerName: string, playerTeam: string, source: RankingSource = 'myboard') {
  try {
    console.log(`[globalPlayerEvents] Fetching games for new watchlist player: ${playerName} (ID: ${playerId}, Team: ${playerTeam})`);
    
    // Fetch only this prospect's games
    const url = `/api/games/prospects?prospectIds=${encodeURIComponent(playerId)}&source=${source}`;
    console.log(`[globalPlayerEvents] Calling: ${url}`);
    
    const response = await fetch(url, {
      cache: 'no-store',
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[globalPlayerEvents] Failed to fetch prospect games: ${response.status} ${response.statusText}`, errorText);
      return;
    }
    
    const newGamesData = await response.json();
    const newGames: GamesByDate = newGamesData.games || {};
    
    const totalNewGames = Object.values(newGames).flat().length;
    console.log(`[globalPlayerEvents] Received ${totalNewGames} games across ${Object.keys(newGames).length} dates for ${playerName}`);
    
    if (totalNewGames === 0) {
      console.warn(`[globalPlayerEvents] ⚠️ No games found for ${playerName} (${playerTeam}). This might be because:`);
      console.warn(`[globalPlayerEvents]   1. Games aren't loaded yet in loadAllSchedules`);
      console.warn(`[globalPlayerEvents]   2. Team name matching failed (looking for: "${playerTeam}")`);
      console.warn(`[globalPlayerEvents]   3. Games exist but player isn't decorated yet`);
      return;
    }
    
    // Merge into cached games
    const cacheKey = `games_all_${source}`;
    const cached = getCachedData<GamesByDate>(cacheKey) || {};
    const merged: GamesByDate = { ...cached };
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
    
    // Update cache with merged games immediately (for instant UI update)
    setCachedData(cacheKey, merged, 10 * 60 * 1000);
    
    console.log(`[globalPlayerEvents] ✓ Merged ${totalMerged} new games for ${playerName} (${totalNewGames - totalMerged} were duplicates)`);
    
    // FINAL SUMMARY LOG (AT VERY BOTTOM)
    console.log(`\n\n[globalPlayerEvents] ========== FINAL SUMMARY (AT VERY BOTTOM) ==========`);
    console.log(`[globalPlayerEvents] Player: ${playerName} (${playerId})`);
    console.log(`[globalPlayerEvents] Team: ${playerTeam}`);
    console.log(`[globalPlayerEvents] New games fetched: ${totalNewGames}`);
    console.log(`[globalPlayerEvents] Games merged: ${totalMerged}`);
    console.log(`[globalPlayerEvents] Duplicates skipped: ${totalNewGames - totalMerged}`);
    console.log(`[globalPlayerEvents] Total games in cache after merge: ${Object.values(merged).flat().length}`);
    console.log(`[globalPlayerEvents] ============================================================\n\n`);
    
    // Dispatch event immediately so UI updates instantly
    window.dispatchEvent(new CustomEvent('gamesCacheUpdated', { detail: { games: merged } }));
    
    // CRITICAL: Re-decorate ALL games in background to show new player on existing games
    // Do this silently without blocking the UI
    setTimeout(async () => {
      try {
        console.log(`[globalPlayerEvents] Background: Re-decorating all games with updated watchlist...`);
        const allGamesResponse = await fetch(`/api/games/all?source=${source}`, {
          cache: 'no-store',
        });
        
        if (allGamesResponse.ok) {
          const allGamesData = await allGamesResponse.json();
          const allGames: GamesByDate = allGamesData.games || {};
          
          // Update cache with fully decorated games
          setCachedData(cacheKey, allGames, 10 * 60 * 1000);
          
          console.log(`[globalPlayerEvents] ✓ Background re-decoration complete: ${Object.values(allGames).flat().length} total games`);
          
          // Dispatch event to notify useGames hook of fully decorated games
          window.dispatchEvent(new CustomEvent('gamesCacheUpdated', { detail: { games: allGames } }));
        }
      } catch (err) {
        console.warn('[globalPlayerEvents] Background re-decoration failed:', err);
      }
    }, 100); // Small delay to let UI update first
  } catch (err) {
    console.error('[globalPlayerEvents] Error adding watchlist games:', err);
  }
}

/**
 * Initialize global event listeners for player add/remove
 * Call this once on app startup (e.g., in root layout or main page)
 */
export function setupGlobalPlayerEventListeners() {
  if (typeof window === 'undefined') return;
  
  // Get current source from localStorage (defaults to 'myboard' if useMyBoard is true)
  const getCurrentSource = (): RankingSource => {
    try {
      const useMyBoard = localStorage.getItem('useMyBoard');
      return useMyBoard === 'true' ? 'myboard' : 'espn';
    } catch {
      return 'espn';
    }
  };
  
  const handlePlayerRemoved = (e: CustomEvent) => {
    const { playerId, playerName } = e.detail;
    const source = getCurrentSource();
    console.log(`[globalPlayerEvents] Player removed event: ${playerName} (${playerId})`);
    removePlayerFromCache(playerId, playerName, source);
  };
  
  const handlePlayerAdded = (e: CustomEvent) => {
    const { playerId, playerName, playerTeam } = e.detail;
    const source = getCurrentSource();
    console.log(`[globalPlayerEvents] Player added event: ${playerName} (${playerId})`);
    addPlayerGames(playerId, playerName, playerTeam, source);
  };
  
  // Set up listeners (only once)
  if (!(window as any).__playerEventListenersSetup) {
    window.addEventListener('playerRemoved', handlePlayerRemoved as EventListener);
    window.addEventListener('playerAdded', handlePlayerAdded as EventListener);
    (window as any).__playerEventListenersSetup = true;
    console.log('[globalPlayerEvents] Global event listeners set up');
  }
}

