import type { Prospect } from '@/app/types/prospect';
import { loadProspects } from './loadProspects';
import type { RankingSource } from './loadProspects';

export type TrackedPlayerType = 'myBoard' | 'watchlist';

export interface TrackedPlayerInfo {
  playerId: string;      // canonical id: normalized name + team
  playerName: string;
  team: string;
  teamDisplay?: string;
  teamId?: string;
  type: TrackedPlayerType;
  rank?: number;         // only for myBoard
  isWatchlist?: boolean; // true if watchlist, false if myBoard
}

/**
 * Creates a canonical player ID from name and team
 * This ID should be consistent across the app for matching
 */
function createCanonicalPlayerId(name: string, team: string | undefined, teamDisplay?: string | undefined): string {
  // Normalize name: lowercase, trim, remove extra spaces
  const normalizedName = (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Use teamDisplay if available, otherwise team, otherwise empty
  const teamToUse = (teamDisplay || team || '').trim();
  
  // Normalize team: lowercase, trim, remove common suffixes for matching
  // Also remove parenthetical content like "(France)", "(Spain)"
  let normalizedTeam = teamToUse
    .toLowerCase()
    .trim()
    .replace(/\s*\([^)]*\)/g, '') // Remove parenthetical content
    .replace(/\s+(basket|basketball|club|bc)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // For Partizan, normalize variations to just "partizan"
  if (normalizedTeam.includes('partizan') || normalizedTeam.includes('mozzart')) {
    normalizedTeam = 'partizan';
  }
  
  // Create ID: name|team
  return `${normalizedName}|${normalizedTeam}`;
}

/**
 * Separates prospects into big board and watchlist
 * This is needed because loadProspects returns a combined array
 */
export async function getBigBoardAndWatchlistProspects(
  source: RankingSource,
  clerkUserId?: string
): Promise<{ bigBoard: Prospect[]; watchlist: Prospect[] }> {
  const allProspects = await loadProspects(source, clerkUserId);
  
  const bigBoard: Prospect[] = [];
  const watchlist: Prospect[] = [];
  
  for (const prospect of allProspects) {
    if (prospect.isWatchlist) {
      watchlist.push(prospect);
    } else {
      bigBoard.push(prospect);
    }
  }
  
  return { bigBoard, watchlist };
}

/**
 * Checks if a team is an international team (not NCAA)
 */
function isInternationalTeam(teamName: string): boolean {
  const lower = teamName.toLowerCase();
  return lower.includes('partizan') ||
         lower.includes('asvel') ||
         lower.includes('valencia') ||
         lower.includes('lyon') ||
         lower.includes('villeurbanne') ||
         lower.includes('mega') ||
         lower.includes('melbourne') ||
         lower.includes('new zealand') ||
         lower.includes('paris basket');
}

/**
 * Builds a map of all tracked players (big board + watchlist) keyed by canonical player ID
 * 
 * @param bigBoardProspects - Prospects from the user's big board rankings
 * @param watchlistProspects - Prospects from the user's watchlist
 * @returns Map of playerId -> TrackedPlayerInfo
 */
export function buildTrackedPlayersMap(
  bigBoardProspects: Prospect[],
  watchlistProspects: Prospect[]
): Record<string, TrackedPlayerInfo> {
  const map: Record<string, TrackedPlayerInfo> = {};
  const missingTeamIds: string[] = [];
  
  // Debug players to log
  const debugPlayerNames = [
    'Tomislav Ivisic',
    'Andrej Stojakovic',
    'Kylan Boswell',
    'Zvonimir Ivisic',
    'Donnie Freeman'
  ];

  // Add big board prospects
  for (const p of bigBoardProspects) {
    if (!p.name) continue;
    
    // Debug logging for problematic players
    if (debugPlayerNames.includes(p.name)) {
      console.log('[buildTrackedPlayersMap] DEBUG prospect mapping', {
        prospectId: p.id,
        name: p.name,
        teamId: p.teamId,
        team: p.team,
        teamDisplay: p.teamDisplay,
        espnTeamName: p.espnTeamName,
      });
    }
    
    // Log warning for NCAA prospects missing teamId
    const teamName = p.teamDisplay || p.team || '';
    if (!p.teamId && !isInternationalTeam(teamName)) {
      missingTeamIds.push(`${p.name} (${teamName})`);
      console.warn(`[buildTrackedPlayersMap] ⚠️ Missing teamId for NCAA prospect: ${p.name} (${teamName})`);
    }
    
    // Try multiple player IDs to handle team name variations
    const playerIds = [
      createCanonicalPlayerId(p.name, p.team, p.teamDisplay),
      createCanonicalPlayerId(p.name, p.teamDisplay, p.teamDisplay),
      createCanonicalPlayerId(p.name, p.team, p.team),
    ];
    
    // Use the first ID as primary, but ensure all variations point to the same entry
    const primaryId = playerIds[0];
    map[primaryId] = {
      playerId: primaryId,
      playerName: p.name,
      team: p.team || '',
      teamDisplay: p.teamDisplay,
      teamId: p.teamId, // CRITICAL: Must be set for NCAA teams
      type: 'myBoard',
      rank: p.rank,
      isWatchlist: false,
    };
    
    // Also add aliases for team name variations (only for international teams)
    // For NCAA teams, we rely on teamId matching, not name variations
    if (isInternationalTeam(teamName)) {
      for (const aliasId of playerIds.slice(1)) {
        if (aliasId !== primaryId && !map[aliasId]) {
          map[aliasId] = map[primaryId]; // Reference same object
        }
      }
    }
  }

  // Add watchlist prospects (don't override myBoard entries)
  for (const p of watchlistProspects) {
    if (!p.name) continue;
    
    // Debug logging for problematic players
    if (debugPlayerNames.includes(p.name)) {
      console.log('[buildTrackedPlayersMap] DEBUG watchlist prospect mapping', {
        prospectId: p.id,
        name: p.name,
        teamId: p.teamId,
        team: p.team,
        teamDisplay: p.teamDisplay,
        espnTeamName: p.espnTeamName,
      });
    }
    
    // Log warning for NCAA prospects missing teamId
    const teamName = p.teamDisplay || p.team || '';
    if (!p.teamId && !isInternationalTeam(teamName)) {
      missingTeamIds.push(`${p.name} (${teamName})`);
      console.warn(`[buildTrackedPlayersMap] ⚠️ Missing teamId for NCAA watchlist prospect: ${p.name} (${teamName})`);
    }
    
    // Try multiple player IDs to handle team name variations
    const playerIds = [
      createCanonicalPlayerId(p.name, p.team, p.teamDisplay),
      createCanonicalPlayerId(p.name, p.teamDisplay, p.teamDisplay),
      createCanonicalPlayerId(p.name, p.team, p.team),
    ];
    
    const primaryId = playerIds[0];
    
    // If already on myBoard, keep as myBoard (don't override)
    const existing = map[primaryId];
    if (existing && existing.type === 'myBoard') {
      // Already tracked as myBoard, skip
      continue;
    }

    map[primaryId] = {
      playerId: primaryId,
      playerName: p.name,
      team: p.team || '',
      teamDisplay: p.teamDisplay,
      teamId: p.teamId, // CRITICAL: Must be set for NCAA teams
      type: 'watchlist',
      isWatchlist: true,
    };
    
    // Also add aliases for team name variations (only for international teams)
    // For NCAA teams, we rely on teamId matching, not name variations
    if (isInternationalTeam(teamName)) {
      for (const aliasId of playerIds.slice(1)) {
        if (aliasId !== primaryId && !map[aliasId]) {
          map[aliasId] = map[primaryId]; // Reference same object
        }
      }
    }
  }
  
  // Log summary of missing teamIds
  if (missingTeamIds.length > 0) {
    console.warn(`[buildTrackedPlayersMap] ⚠️ Found ${missingTeamIds.length} NCAA prospects without teamId. They may not match correctly.`);
  }

  // Debug logging for specific players
  const adamEntry = Object.values(map).find(p => p.playerName.toLowerCase().includes('atamna'));
  const pokuEntry = Object.values(map).find(p => p.playerName.toLowerCase().includes('pokusevski'));
  
  if (adamEntry) {
    console.log('[trackedPlayers] ✅ Found Adam Atamna in tracked map:', {
      playerId: adamEntry.playerId,
      name: adamEntry.playerName,
      team: adamEntry.team,
      teamDisplay: adamEntry.teamDisplay,
      type: adamEntry.type,
      rank: adamEntry.rank,
    });
  } else {
    console.warn('[trackedPlayers] ⚠️ Adam Atamna NOT found in tracked map');
  }
  
  if (pokuEntry) {
    console.log('[trackedPlayers] ✅ Found Pokusevski in tracked map:', {
      playerId: pokuEntry.playerId,
      name: pokuEntry.playerName,
      team: pokuEntry.team,
      teamDisplay: pokuEntry.teamDisplay,
      type: pokuEntry.type,
      rank: pokuEntry.rank,
    });
  } else {
    console.warn('[trackedPlayers] ⚠️ Pokusevski NOT found in tracked map');
    console.log('[trackedPlayers] Tracked map keys sample:', Object.keys(map).slice(0, 20));
    console.log('[trackedPlayers] All tracked players:', Object.values(map).map(p => `${p.playerName} (${p.team})`).slice(0, 20));
  }

  // Safety check: Log warnings for ambiguous school names
  // This helps catch future regressions where similar school names might be confused
  const ambiguousSchoolNames = ['Michigan', 'Michigan State', 'Iowa', 'Iowa State', 'Georgia', 'Georgia Tech', 'Virginia', 'Virginia Tech'];
  const byNameRoot: Record<string, Set<string>> = {};
  
  // Group tracked players by normalized team name root
  for (const tracked of Object.values(map)) {
    if (!tracked.teamId) continue; // Skip if no teamId
    
    const teamName = tracked.teamDisplay || tracked.team || '';
    // Remove "State" and "Tech" suffixes for grouping
    const nameRoot = teamName.replace(/\s+State$/, '').replace(/\s+Tech$/, '').trim();
    
    if (ambiguousSchoolNames.some(ambiguous => teamName.includes(ambiguous))) {
      if (!byNameRoot[nameRoot]) {
        byNameRoot[nameRoot] = new Set();
      }
      byNameRoot[nameRoot].add(tracked.teamId);
    }
  }
  
  // Log if any name root maps to multiple teamIds (potential confusion)
  for (const [nameRoot, teamIds] of Object.entries(byNameRoot)) {
    if (teamIds.size > 1) {
      console.warn(`[buildTrackedPlayersMap] ⚠️ Ambiguous team name root "${nameRoot}" maps to ${teamIds.size} different teamIds:`, Array.from(teamIds));
      console.warn(`[buildTrackedPlayersMap] This indicates potential confusion between similar school names. Ensure teamId matching is used, not name matching.`);
    }
  }

  return map;
}

/**
 * Matches a prospect from a game to a tracked player
 * 
 * CRITICAL: For NCAA teams, uses teamId matching ONLY (no string matching)
 * For international teams, uses name matching with team name variations
 * 
 * This prevents mixing up similar school names like:
 * - Michigan vs Michigan State
 * - Iowa vs Iowa State
 * - Georgia vs Georgia Tech
 * - Virginia vs Virginia Tech
 */
function matchProspectToTracked(
  prospect: Prospect,
  trackedMap: Record<string, TrackedPlayerInfo>,
  gameHomeTeamId?: string,
  gameAwayTeamId?: string
): TrackedPlayerInfo | null {
  if (!prospect.name) return null;
  
  const prospectTeamName = prospect.teamDisplay || prospect.team || '';
  const isProspectInternational = isInternationalTeam(prospectTeamName);
  
  // STEP 1: For NCAA prospects with teamId, match by teamId ONLY
  // This is the PRIMARY and SAFE way to match NCAA prospects
  if (prospect.teamId && !isProspectInternational) {
    // Find tracked players with matching teamId
    for (const tracked of Object.values(trackedMap)) {
      const trackedTeamName = tracked.teamDisplay || tracked.team || '';
      const isTrackedInternational = isInternationalTeam(trackedTeamName);
      
      // Only match NCAA to NCAA by teamId
      if (!isTrackedInternational && tracked.teamId === prospect.teamId) {
        // Also verify name matches (case-insensitive)
        const normalizedProspectName = prospect.name.toLowerCase().trim().replace(/\s+/g, ' ');
        const normalizedTrackedName = tracked.playerName.toLowerCase().trim().replace(/\s+/g, ' ');
        if (normalizedProspectName === normalizedTrackedName) {
          return tracked;
        }
      }
    }
  }
  
  // STEP 2: For international teams OR prospects without teamId, use name + team matching
  // This handles Partizan/ASVEL variations and fallback cases
  const normalizedProspectName = prospect.name.toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Try multiple team name combinations (only for international teams or missing teamId)
  const teamVariations = [
    prospect.team,
    prospect.teamDisplay,
    prospect.espnTeamName,
    // Remove common suffixes for matching
    prospect.teamDisplay?.replace(/\s+(basket|basketball|club|bc)$/i, '').trim(),
    prospect.team?.replace(/\s+(basket|basketball|club|bc)$/i, '').trim(),
  ].filter(Boolean) as string[];
  
  // Remove duplicates
  const uniqueTeamVariations = Array.from(new Set(teamVariations));
  
  // Try each team variation
  for (const teamVar of uniqueTeamVariations) {
    const playerId = createCanonicalPlayerId(prospect.name, teamVar, teamVar);
    const tracked = trackedMap[playerId];
    if (tracked) {
      // For NCAA teams, verify teamId matches if both have it
      if (prospect.teamId && tracked.teamId && !isProspectInternational) {
        if (prospect.teamId === tracked.teamId) {
          return tracked;
        }
        // teamId mismatch - skip this match
        continue;
      }
      return tracked;
    }
  }
  
  // STEP 3: Fallback - match by name only for international teams
  // ONLY use this for international teams, NEVER for NCAA teams
  if (isProspectInternational) {
    for (const tracked of Object.values(trackedMap)) {
      const normalizedTrackedName = tracked.playerName.toLowerCase().trim().replace(/\s+/g, ' ');
      if (normalizedProspectName === normalizedTrackedName) {
        const trackedTeamName = tracked.teamDisplay || tracked.team || '';
        const isTrackedInternational = isInternationalTeam(trackedTeamName);
        
        // Only match international to international
        if (isTrackedInternational && teamNamesMatch(prospectTeamName, trackedTeamName)) {
          return tracked;
        }
      }
    }
  }
  
  return null;
}

/**
 * Normalizes team name for matching (similar to loadSchedules.ts)
 * Handles cases like "ASVEL (France)" -> "asvel"
 */
function normalizeTeamNameForMatching(name: string): string {
  let normalized = (name || '')
    .toLowerCase()
    .trim();
  
  // Remove parenthetical content like "(France)", "(Spain)", etc.
  normalized = normalized.replace(/\s*\([^)]*\)/g, '');
  
  // Remove common suffixes
  normalized = normalized
    .replace(/\s+(basket|basketball|club|bc)$/i, '')
    .trim();
  
  // Remove all non-alphanumeric characters for comparison
  normalized = normalized.replace(/[^a-z0-9]/g, '');
  
  return normalized;
}

/**
 * Checks if two team names match (handles variations like Lyon-Villeurbanne/ASVEL)
 */
function teamNamesMatch(name1: string, name2: string): boolean {
  const normalized1 = normalizeTeamNameForMatching(name1);
  const normalized2 = normalizeTeamNameForMatching(name2);
  
  if (normalized1 === normalized2) return true;
  
  // Check if one contains the other (for variations like "Lyon-Villeurbanne" vs "Lyon")
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return true;
  }
  
  // Handle known variations
  const variations: Record<string, string[]> = {
    'asvel': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket', 'lyon-villeurbanne', 'asvelfrance'],
    'lyonvilleurbanne': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket', 'lyon-villeurbanne', 'asvelfrance'],
    'partizan': ['partizan', 'partizanmozzartbet', 'partizanmozzart', 'mozzartbet', 'kkpartizan', 'partizanbelgrade'],
    'partizanmozzartbet': ['partizan', 'partizanmozzartbet', 'partizanmozzart', 'mozzartbet', 'kkpartizan', 'partizanbelgrade'],
  };
  
  // Check if normalized names match any variation group
  for (const [base, vars] of Object.entries(variations)) {
    // Check if either normalized name matches any variation in this group
    const matches1 = vars.some(v => {
      const vNormalized = normalizeTeamNameForMatching(v);
      return normalized1 === vNormalized || normalized1.includes(vNormalized) || vNormalized.includes(normalized1);
    });
    const matches2 = vars.some(v => {
      const vNormalized = normalizeTeamNameForMatching(v);
      return normalized2 === vNormalized || normalized2.includes(vNormalized) || vNormalized.includes(normalized2);
    });
    if (matches1 && matches2) {
      return true;
    }
  }
  
  return false;
}

/**
 * Decorates games with tracked player information
 * Adds homeTrackedPlayers and awayTrackedPlayers arrays to each game
 * 
 * This function:
 * 1. Matches prospects already in the game to tracked players
 * 2. Also adds tracked players whose teams match the game's teams (even if not in prospects arrays)
 */
// Debug games to log
const DEBUG_GAMES = [
  'Tennessee vs Illinois',
  'Houston vs Florida State',
  'Texas A&M vs SMU',
  'UConn vs Florida',
  'Saint Joseph\'s vs Syracuse',
];

function isDebugGame(game: { homeTeam?: { name?: string; displayName?: string }; awayTeam?: { name?: string; displayName?: string } }): boolean {
  const homeName = game.homeTeam?.name || game.homeTeam?.displayName || '';
  const awayName = game.awayTeam?.name || game.awayTeam?.displayName || '';
  const label = `${homeName} vs ${awayName}`;
  return DEBUG_GAMES.includes(label);
}

export function decorateGamesWithTrackedPlayers(
  games: Array<{ 
    id?: string;
    prospects: Prospect[]; 
    homeProspects: Prospect[]; 
    awayProspects: Prospect[];
    homeTeam?: { id?: string; name?: string; displayName?: string };
    awayTeam?: { id?: string; name?: string; displayName?: string };
  }>,
  trackedMap: Record<string, TrackedPlayerInfo>
): Array<{ 
  prospects: Prospect[]; 
  homeProspects: Prospect[]; 
  awayProspects: Prospect[];
  homeTrackedPlayers: TrackedPlayerInfo[];
  awayTrackedPlayers: TrackedPlayerInfo[];
}> {
  let adamMatchCount = 0;
  let adamGameCount = 0;
  
  
  const decorated = games.map(game => {
    const homeTracked: TrackedPlayerInfo[] = [];
    const awayTracked: TrackedPlayerInfo[] = [];
    const usedPlayerIds = new Set<string>();

    // Get game team names
    const homeTeamName = game.homeTeam?.displayName || game.homeTeam?.name || '';
    const awayTeamName = game.awayTeam?.displayName || game.awayTeam?.name || '';

    // Get game team IDs for teamId-based matching
    const gameHomeTeamId = game.homeTeam?.id;
    const gameAwayTeamId = game.awayTeam?.id;
    
    // Step 1: Match prospects already in the game to tracked players
    // This is the PRIMARY way tracked players are added - it uses the prospects that enrichment already found
    // CRITICAL: Uses teamId matching for NCAA teams to prevent mixing up similar school names
    for (const prospect of game.homeProspects || []) {
      const tracked = matchProspectToTracked(prospect, trackedMap, gameHomeTeamId, gameAwayTeamId);
      if (tracked && !usedPlayerIds.has(tracked.playerId)) {
        // CRITICAL GUARD: For NCAA prospects, verify teamId matches game team ID
        // This prevents prospects from being attached to wrong teams
        if (prospect.teamId && gameHomeTeamId && !isInternationalTeam(prospect.teamDisplay || prospect.team || '')) {
          if (prospect.teamId !== gameHomeTeamId) {
            // teamId mismatch - this prospect doesn't belong to this team
            console.warn(`[decorateGames] ⚠️ MISMATCH home teamId - Prospect ${prospect.name} teamId (${prospect.teamId}) doesn't match game homeTeamId (${gameHomeTeamId})`, {
              gameId: game.id,
              homeTeamName: homeTeamName,
              awayTeamName: awayTeamName,
              prospectName: prospect.name,
              prospectTeamId: prospect.teamId,
              gameHomeTeamId: gameHomeTeamId,
              trackedTeamId: tracked.teamId,
            });
            continue; // Skip attaching - prospect doesn't belong to this team
          }
        }
        
        // Additional guard: Verify tracked player's teamId matches game team ID
        if (tracked.teamId && gameHomeTeamId && !isInternationalTeam(tracked.teamDisplay || tracked.team || '')) {
          if (tracked.teamId !== gameHomeTeamId) {
            console.warn(`[decorateGames] ⚠️ MISMATCH home teamId - Tracked player ${tracked.playerName} teamId (${tracked.teamId}) doesn't match game homeTeamId (${gameHomeTeamId})`, {
              gameId: game.id,
              homeTeamName: homeTeamName,
              awayTeamName: awayTeamName,
              trackedPlayerName: tracked.playerName,
              trackedTeamId: tracked.teamId,
              gameHomeTeamId: gameHomeTeamId,
            });
            continue; // Skip attaching - tracked player doesn't belong to this team
          }
        }
        
        homeTracked.push(tracked);
        usedPlayerIds.add(tracked.playerId);
        
        const playerNameLower = tracked.playerName.toLowerCase();
        if (playerNameLower.includes('atamna')) adamMatchCount++;
      }
    }

    for (const prospect of game.awayProspects || []) {
      const tracked = matchProspectToTracked(prospect, trackedMap, gameHomeTeamId, gameAwayTeamId);
      if (tracked && !usedPlayerIds.has(tracked.playerId)) {
        // CRITICAL GUARD: For NCAA prospects, verify teamId matches game team ID
        // This prevents prospects from being attached to wrong teams
        if (prospect.teamId && gameAwayTeamId && !isInternationalTeam(prospect.teamDisplay || prospect.team || '')) {
          if (prospect.teamId !== gameAwayTeamId) {
            // teamId mismatch - this prospect doesn't belong to this team
            console.warn(`[decorateGames] ⚠️ MISMATCH away teamId - Prospect ${prospect.name} teamId (${prospect.teamId}) doesn't match game awayTeamId (${gameAwayTeamId})`, {
              gameId: game.id,
              homeTeamName: homeTeamName,
              awayTeamName: awayTeamName,
              prospectName: prospect.name,
              prospectTeamId: prospect.teamId,
              gameAwayTeamId: gameAwayTeamId,
              trackedTeamId: tracked.teamId,
            });
            continue; // Skip attaching - prospect doesn't belong to this team
          }
        }
        
        // Additional guard: Verify tracked player's teamId matches game team ID
        if (tracked.teamId && gameAwayTeamId && !isInternationalTeam(tracked.teamDisplay || tracked.team || '')) {
          if (tracked.teamId !== gameAwayTeamId) {
            console.warn(`[decorateGames] ⚠️ MISMATCH away teamId - Tracked player ${tracked.playerName} teamId (${tracked.teamId}) doesn't match game awayTeamId (${gameAwayTeamId})`, {
              gameId: game.id,
              homeTeamName: homeTeamName,
              awayTeamName: awayTeamName,
              trackedPlayerName: tracked.playerName,
              trackedTeamId: tracked.teamId,
              gameAwayTeamId: gameAwayTeamId,
            });
            continue; // Skip attaching - tracked player doesn't belong to this team
          }
        }
        
        awayTracked.push(tracked);
        usedPlayerIds.add(tracked.playerId);
        
        const playerNameLower = tracked.playerName.toLowerCase();
        if (playerNameLower.includes('atamna')) adamMatchCount++;
      }
    }
    
    // Step 2: Also add tracked players whose teams match the game's teams
    // BUT: ONLY for international teams (Partizan, ASVEL, Valencia, Lyon, etc.)
    // NCAA teams should ONLY be matched via Step 1 (prospects already in the game)
    // This prevents matching "Michigan" with "Michigan State", "Iowa" with "Iowa State", etc.
    const homeTeamLower = homeTeamName.toLowerCase();
    const awayTeamLower = awayTeamName.toLowerCase();
    const isInternationalGame = homeTeamLower.includes('partizan') || 
                               awayTeamLower.includes('partizan') ||
                               homeTeamLower.includes('asvel') ||
                               awayTeamLower.includes('asvel') ||
                               homeTeamLower.includes('valencia') ||
                               awayTeamLower.includes('valencia') ||
                               homeTeamLower.includes('lyon') ||
                               awayTeamLower.includes('lyon') ||
                               homeTeamLower.includes('villeurbanne') ||
                               awayTeamLower.includes('villeurbanne');
    
    // ONLY run team matching for international games
    // NCAA games should ONLY match via Step 1 (prospects already in the game)
    if (isInternationalGame) {
      for (const tracked of Object.values(trackedMap)) {
        if (usedPlayerIds.has(tracked.playerId)) continue; // Already added
        
        const trackedTeam = tracked.teamDisplay || tracked.team || '';
        const trackedTeamLower = trackedTeam.toLowerCase();
        
        // Only match if the tracked player is also on an international team
        // This prevents NCAA players from being matched to international games
        const trackedIsInternational = trackedTeamLower.includes('partizan') ||
                                      trackedTeamLower.includes('asvel') ||
                                      trackedTeamLower.includes('valencia') ||
                                      trackedTeamLower.includes('lyon') ||
                                      trackedTeamLower.includes('villeurbanne');
        
        if (!trackedIsInternational) continue; // Skip NCAA players
        
        const playerNameLower = tracked.playerName.toLowerCase();
        const isAdam = playerNameLower.includes('atamna');
        
        // Check if tracked player's team matches home team
        if (homeTeamName && trackedTeam && teamNamesMatch(homeTeamName, trackedTeam)) {
          homeTracked.push(tracked);
          usedPlayerIds.add(tracked.playerId);
          if (isAdam) adamMatchCount++;
        }
        
        // Check if tracked player's team matches away team
        if (awayTeamName && trackedTeam && teamNamesMatch(awayTeamName, trackedTeam)) {
          awayTracked.push(tracked);
          usedPlayerIds.add(tracked.playerId);
          if (isAdam) adamMatchCount++;
        }
      }
    }
    
    // Check if this game has Adam in prospects (for debugging)
    const hasAdamInProspects = (game.homeProspects || []).some(p => p.name.toLowerCase().includes('atamna')) ||
                               (game.awayProspects || []).some(p => p.name.toLowerCase().includes('atamna'));
    if (hasAdamInProspects) {
      adamGameCount++;
    }

        const decoratedGame = {
          ...game,
          homeTrackedPlayers: homeTracked,
          awayTrackedPlayers: awayTracked,
        };
        
        // Debug logging for problematic games
        if (isDebugGame(game)) {
          console.log('[decorateGames] DEBUG game:', {
            gameId: game.id,
            home: homeTeamName,
            away: awayTeamName,
            homeTeamId: gameHomeTeamId,
            awayTeamId: gameAwayTeamId,
            homeTracked: homeTracked.map(t => ({
              playerName: t.playerName,
              teamId: t.teamId,
              team: t.team,
              teamDisplay: t.teamDisplay,
              matchesHome: t.teamId === gameHomeTeamId,
              matchesAway: t.teamId === gameAwayTeamId,
            })),
            awayTracked: awayTracked.map(t => ({
              playerName: t.playerName,
              teamId: t.teamId,
              team: t.team,
              teamDisplay: t.teamDisplay,
              matchesHome: t.teamId === gameHomeTeamId,
              matchesAway: t.teamId === gameAwayTeamId,
            })),
            homeProspects: (game.homeProspects || []).map(p => ({
              name: p.name,
              teamId: p.teamId,
              team: p.team,
              teamDisplay: p.teamDisplay,
            })),
            awayProspects: (game.awayProspects || []).map(p => ({
              name: p.name,
              teamId: p.teamId,
              team: p.team,
              teamDisplay: p.teamDisplay,
            })),
          });
        }
        
        return decoratedGame;
      });

      if (adamMatchCount > 0) {
        console.log(`[decorateGames] ✅ Matched Adam Atamna ${adamMatchCount} time(s) across ${adamGameCount} game(s)`);
      } else if (adamGameCount > 0) {
        console.warn(`[decorateGames] ⚠️ Adam Atamna found in ${adamGameCount} game(s) but NOT matched to tracked players`);
      }

      return decorated;
}

/**
 * Filters games to those containing a specific tracked player
 */
export function getGamesForTrackedPlayer(
  playerId: string,
  gamesWithTracked: Array<{ homeTrackedPlayers: TrackedPlayerInfo[]; awayTrackedPlayers: TrackedPlayerInfo[] }>
): typeof gamesWithTracked {
  return gamesWithTracked.filter(game =>
    game.homeTrackedPlayers.some(p => p.playerId === playerId) ||
    game.awayTrackedPlayers.some(p => p.playerId === playerId)
  );
}

/**
 * Finds a tracked player by name (for prospect search)
 */
export function findTrackedPlayerByName(
  name: string,
  trackedMap: Record<string, TrackedPlayerInfo>
): TrackedPlayerInfo | null {
  const normalizedSearchName = name.toLowerCase().trim();
  
  // Try exact match first
  for (const tracked of Object.values(trackedMap)) {
    if (tracked.playerName.toLowerCase().trim() === normalizedSearchName) {
      return tracked;
    }
  }
  
  // Try partial match
  for (const tracked of Object.values(trackedMap)) {
    if (tracked.playerName.toLowerCase().includes(normalizedSearchName) ||
        normalizedSearchName.includes(tracked.playerName.toLowerCase())) {
      return tracked;
    }
  }
  
  return null;
}

