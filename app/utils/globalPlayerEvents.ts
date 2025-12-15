/**
 * Global event listener for playerAdded/playerRemoved events
 * Works across all pages, not just where useGames is mounted
 */

import type { GamesByDate } from '../hooks/useGames';
import { getCachedData, setCachedData } from './browserCache';
import { normalizeTeamNameForKey, getGameKey } from './gameKey';

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
      const filteredGames = gamesForDate
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
      
      // Only add date key if there are games remaining
      if (filteredGames.length > 0) {
        updated[dateKey] = filteredGames;
      }
    }
    
    // Update cache
    setCachedData(cacheKey, updated, 10 * 60 * 1000);
    
    console.log(`[globalPlayerEvents] Removed ${playerName} from cache, removed ${removedGameCount} empty gamecards`);
    
    // Dispatch event to notify useGames hook if it's mounted
    // Include action: 'remove' so the hook knows to replace the games state
    window.dispatchEvent(new CustomEvent('gamesCacheUpdated', { 
      detail: { 
        games: updated, 
        action: 'remove',
        playerId,
        playerName
      } 
    }));
  } catch (err) {
    console.error('[globalPlayerEvents] Error removing player from cache:', err);
  }
}

/**
 * Adds games for a new watchlist player
 * OPTIMIZED: Uses /api/games/team/[teamId] for direct database query (no loadAllSchedules)
 */
async function addPlayerGames(playerId: string, playerName: string, playerTeam: string, source: RankingSource = 'myboard') {
  try {
    console.log(`[globalPlayerEvents] Fetching games for new watchlist player: ${playerName} (ID: ${playerId}, Team: ${playerTeam})`);
    
    // First, try to get the team ID from the player ID (format: "name|team")
    // We need to look up the ESPN team ID from the database
    let teamId: string | null = null;
    
    // Try to find team ID by searching existing cached games for this team
    const cacheKey = `games_all_${source}`;
    const cached = getCachedData<GamesByDate>(cacheKey) || {};
    
    // Normalize team name for matching
    const normalizedPlayerTeam = normalizeTeamNameForKey(playerTeam);
    
    for (const games of Object.values(cached)) {
      for (const game of games) {
        const homeTeamName = normalizeTeamNameForKey(game.homeTeam?.displayName || game.homeTeam?.name || '');
        const awayTeamName = normalizeTeamNameForKey(game.awayTeam?.displayName || game.awayTeam?.name || '');
        
        if (homeTeamName === normalizedPlayerTeam || homeTeamName.includes(normalizedPlayerTeam) || normalizedPlayerTeam.includes(homeTeamName)) {
          teamId = game.homeTeam?.id;
          break;
        }
        if (awayTeamName === normalizedPlayerTeam || awayTeamName.includes(normalizedPlayerTeam) || normalizedPlayerTeam.includes(awayTeamName)) {
          teamId = game.awayTeam?.id;
          break;
        }
      }
      if (teamId) break;
    }
    
    let newGames: GamesByDate = {};
    let totalNewGames = 0;
    
    // If we found a team ID, use the fast /api/games/team endpoint
    if (teamId) {
      console.log(`[globalPlayerEvents] Found team ID ${teamId} for ${playerTeam}, using fast path`);
      const url = `/api/games/team/${teamId}`;
      const response = await fetch(url, { cache: 'no-store' });
      
      if (response.ok) {
        const data = await response.json();
        const teamGamesArray = data.games || [];
        
        // Convert array to GamesByDate format
        for (const game of teamGamesArray) {
          const dateKey = game.dateKey || game.date?.substring(0, 10);
          if (!dateKey) continue;
          if (!newGames[dateKey]) newGames[dateKey] = [];
          newGames[dateKey].push(game);
        }
        
        totalNewGames = teamGamesArray.length;
        console.log(`[globalPlayerEvents] Fast path: Received ${totalNewGames} games for team ${teamId}`);
      } else {
        console.warn(`[globalPlayerEvents] Fast path failed (${response.status}), will try fallback`);
      }
    }
    
    // Fallback: If no team ID found or fast path failed, try /api/games/prospects
    // But only if we got no games from fast path
    if (totalNewGames === 0) {
      console.log(`[globalPlayerEvents] Using fallback: /api/games/prospects for ${playerName}`);
      const url = `/api/games/prospects?prospectIds=${encodeURIComponent(playerId)}&source=${source}`;
      
      const response = await fetch(url, { cache: 'no-store' });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[globalPlayerEvents] Failed to fetch prospect games: ${response.status} ${response.statusText}`, errorText);
        return;
      }
      
      const newGamesData = await response.json();
      newGames = newGamesData.games || {};
      totalNewGames = Object.values(newGames).flat().length;
    }
    
    console.log(`[globalPlayerEvents] Received ${totalNewGames} games across ${Object.keys(newGames).length} dates for ${playerName}`);
    
    // Create the tracked player info for the new watchlist player
    const trackedPlayer = {
      playerId,
      playerName,
      type: 'watchlist' as const,
      team: playerTeam,
      teamDisplay: playerTeam,
    };
    
    // Helper to determine if player should be on home or away team
    // STRICT matching to avoid "Alabama" matching "Alabama State"
    const SCHOOL_QUALIFIERS = ['state', 'tech', 'christian', 'am', 'southern', 'northern', 'eastern', 'western', 'central', 'atlantic', 'pacific', 'international', 'methodist', 'baptist', 'lutheran', 'coastal', 'poly'];
    
    const isPlayerOnTeam = (teamName: string): boolean => {
      const normalizedTeamName = normalizeTeamNameForKey(teamName);
      
      // Exact match is always valid
      if (normalizedTeamName === normalizedPlayerTeam) return true;
      
      // For substring matching, require minimum length
      if (normalizedPlayerTeam.length < 5) return false;
      
      // Check if one starts with the other
      let shorter = '', longer = '';
      if (normalizedTeamName.startsWith(normalizedPlayerTeam)) {
        shorter = normalizedPlayerTeam;
        longer = normalizedTeamName;
      } else if (normalizedPlayerTeam.startsWith(normalizedTeamName)) {
        shorter = normalizedTeamName;
        longer = normalizedPlayerTeam;
      } else {
        return false;
      }
      
      // Get the suffix (what's left after removing the shorter name)
      const suffix = longer.substring(shorter.length);
      
      // If suffix starts with a school qualifier, it's a DIFFERENT school
      for (const qualifier of SCHOOL_QUALIFIERS) {
        if (suffix.startsWith(qualifier)) {
          return false; // "alabama" should NOT match "alabamastate"
        }
      }
      
      return true;
    };
    
    if (totalNewGames === 0) {
      console.log(`[globalPlayerEvents] No new games from API, but will add ${playerName} to existing cached games`);
    }
    
    // Decorate new games with the watchlist player
    for (const gamesForDate of Object.values(newGames)) {
      for (const game of gamesForDate) {
        const homeTeamName = game.homeTeam?.displayName || game.homeTeam?.name || '';
        const awayTeamName = game.awayTeam?.displayName || game.awayTeam?.name || '';
        if (!game.homeTrackedPlayers) game.homeTrackedPlayers = [];
        if (!game.awayTrackedPlayers) game.awayTrackedPlayers = [];
        const isOnHome = isPlayerOnTeam(homeTeamName);
        const isOnAway = isPlayerOnTeam(awayTeamName);
        if (isOnHome && !game.homeTrackedPlayers.some((p: any) => p.playerId === playerId)) {
          game.homeTrackedPlayers.push(trackedPlayer);
        } else if (isOnAway && !game.awayTrackedPlayers.some((p: any) => p.playerId === playerId)) {
          game.awayTrackedPlayers.push(trackedPlayer);
        }
      }
    }
    
    // Merge into cached games and add player to existing games that match their team
    const existingCacheKey = `games_all_${source}`;
    const existingCached = getCachedData<GamesByDate>(existingCacheKey) || {};
    const merged: GamesByDate = {};
    let existingGamesUpdated = 0;
    
    // First, copy and update existing cached games to add the new player
    for (const [dateKey, gamesForDate] of Object.entries(existingCached)) {
      merged[dateKey] = gamesForDate.map(game => {
        const homeTeamName = game.homeTeam?.displayName || game.homeTeam?.name || '';
        const awayTeamName = game.awayTeam?.displayName || game.awayTeam?.name || '';
        const isOnHome = isPlayerOnTeam(homeTeamName);
        const isOnAway = isPlayerOnTeam(awayTeamName);
        if (!isOnHome && !isOnAway) return game;
        
        const updatedGame = { ...game };
        if (!updatedGame.homeTrackedPlayers) updatedGame.homeTrackedPlayers = [];
        if (!updatedGame.awayTrackedPlayers) updatedGame.awayTrackedPlayers = [];
        
        if (isOnHome && !updatedGame.homeTrackedPlayers.some((p: any) => p.playerId === playerId)) {
          updatedGame.homeTrackedPlayers = [...updatedGame.homeTrackedPlayers, trackedPlayer];
          existingGamesUpdated++;
        } else if (isOnAway && !updatedGame.awayTrackedPlayers.some((p: any) => p.playerId === playerId)) {
          updatedGame.awayTrackedPlayers = [...updatedGame.awayTrackedPlayers, trackedPlayer];
          existingGamesUpdated++;
        }
        return updatedGame;
      });
    }
    
    console.log(`[globalPlayerEvents] Added ${playerName} to ${existingGamesUpdated} existing cached games`);
    
    let totalMerged = 0;
    let totalProspectsAdded = 0;
    
    for (const [dateKey, gamesForDate] of Object.entries(newGames)) {
      if (!merged[dateKey]) {
        merged[dateKey] = [];
      }
      
      // Build maps for efficient lookup (same logic as useGames)
      const existingGamesByKey = new Map<string, any>();
      const existingGamesByTeamIds = new Map<string, any>();
      
      for (const existingGame of merged[dateKey]) {
        const key = existingGame.gameKey || getGameKey(existingGame);
        existingGamesByKey.set(key, existingGame);
        
        // Index by team IDs
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
      
      // Merge new games into existing ones
      for (const newGame of gamesForDate) {
        const newGameKey = newGame.gameKey || getGameKey(newGame);
        const newGameDate = newGame.dateKey || newGame.date;
        const newHomeId = String(newGame.homeTeam.id || '').trim();
        const newAwayId = String(newGame.awayTeam.id || '').trim();
        const newHomeName = normalizeTeamNameForKey(newGame.homeTeam.displayName || newGame.homeTeam.name || '');
        const newAwayName = normalizeTeamNameForKey(newGame.awayTeam.displayName || newGame.awayTeam.name || '');
        
        // Try to find existing game
        let existingGame: any = undefined;
        
        // Priority 1: Team ID match
        if (newHomeId && newAwayId) {
          const teamIdsKey = `${newGameDate}|${[newHomeId, newAwayId].sort().join('|')}`;
          existingGame = existingGamesByTeamIds.get(teamIdsKey);
        }
        
        // Priority 2: Team name match
        if (!existingGame && newHomeName && newAwayName) {
          const teamNamesKey = `${newGameDate}|${[newHomeName, newAwayName].sort().join('|')}`;
          existingGame = existingGamesByTeamIds.get(teamNamesKey);
        }
        
        // Priority 3: Game key match
        if (!existingGame) {
          existingGame = existingGamesByKey.get(newGameKey);
        }
        
        if (existingGame) {
          // Merge prospects into existing game
          const newProspects = newGame.prospects || [];
          const newHomeProspects = newGame.homeProspects || [];
          const newAwayProspects = newGame.awayProspects || [];
          
          // Add prospects that don't already exist
          const existingProspectIds = new Set((existingGame.prospects || []).map((p: any) => 
            `${p.name}|${p.team || ''}`
          ));
          
          for (const prospect of newProspects) {
            const prospectId = `${prospect.name}|${prospect.team || ''}`;
            if (!existingProspectIds.has(prospectId)) {
              existingGame.prospects.push(prospect);
              existingProspectIds.add(prospectId);
              totalProspectsAdded++;
            }
          }
          
          // Add to home/away prospects arrays
          for (const prospect of newHomeProspects) {
            const prospectId = `${prospect.name}|${prospect.team || ''}`;
            if (!existingProspectIds.has(prospectId)) {
              existingGame.homeProspects.push(prospect);
            }
          }
          
          for (const prospect of newAwayProspects) {
            const prospectId = `${prospect.name}|${prospect.team || ''}`;
            if (!existingProspectIds.has(prospectId)) {
              existingGame.awayProspects.push(prospect);
            }
          }
          
          totalMerged++;
        } else {
          // New game - add it
          merged[dateKey].push(newGame);
          totalMerged++;
        }
      }
    }
    
    // Update cache with merged games immediately (for instant UI update)
    // CRITICAL: Only update cache if we have existing games to merge with
    // If cache is empty, don't overwrite it - let the full load happen
    const existingGamesCount = Object.values(cached).flat().length;
    const mergedGamesCount = Object.values(merged).flat().length;
    
    if (existingGamesCount > 0) {
      // We have existing games - safe to update cache with merged data
      setCachedData(cacheKey, merged, 10 * 60 * 1000);
      console.log(`[globalPlayerEvents] ✓ Updated cache: ${existingGamesCount} existing + ${totalMerged} new = ${mergedGamesCount} total`);
    } else {
      // Cache is empty - don't overwrite it with just new games
      // Let the full load happen instead
      console.warn(`[globalPlayerEvents] ⚠️ Cache is empty (${existingGamesCount} games). Not updating cache - full load will happen.`);
      console.warn(`[globalPlayerEvents]   This prevents cache from being overwritten with incomplete data.`);
    }
    
    console.log(`[globalPlayerEvents] ✓ Merged ${totalMerged} new games for ${playerName} (${totalNewGames - totalMerged} were duplicates)`);
    
    // FINAL SUMMARY LOG (AT VERY BOTTOM)
    console.log(`\n\n[globalPlayerEvents] ========== FINAL SUMMARY (AT VERY BOTTOM) ==========`);
    console.log(`[globalPlayerEvents] Player: ${playerName} (${playerId})`);
    console.log(`[globalPlayerEvents] Team: ${playerTeam}`);
    console.log(`[globalPlayerEvents] New games fetched: ${totalNewGames}`);
    console.log(`[globalPlayerEvents] Games merged: ${totalMerged}`);
    console.log(`[globalPlayerEvents] Duplicates skipped: ${totalNewGames - totalMerged}`);
    console.log(`[globalPlayerEvents] Existing games in cache: ${existingGamesCount}`);
    console.log(`[globalPlayerEvents] Total games after merge: ${mergedGamesCount}`);
    console.log(`[globalPlayerEvents] ============================================================\n\n`);
    
    // Dispatch event with new games AND player info so useGames can update existing games too
    window.dispatchEvent(new CustomEvent('gamesCacheUpdated', { 
      detail: { 
        games: newGames, // New games to add
        action: 'add', // Indicate this is an add operation
        playerName,
        // Include player info so useGames can add player to existing games in state
        trackedPlayer,
        playerTeam: normalizedPlayerTeam,
      } 
    }));
    
    // NOTE: We no longer do a full reload of all games. Instead:
    // 1. New games are added instantly (above)
    // 2. The new player will appear on existing games automatically when those games are
    //    re-fetched naturally (e.g., on next page load, or when user refreshes)
    // 3. This prevents the jarring experience of games disappearing and reappearing
    console.log(`[globalPlayerEvents] ✓ Games added instantly. Existing games remain visible.`);
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

