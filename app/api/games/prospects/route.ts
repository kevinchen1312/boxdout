import { NextRequest, NextResponse } from 'next/server';
import { loadAllSchedules, buildGameKey } from '@/lib/loadSchedules';
import type { RankingSource } from '@/lib/loadProspects';
import { auth } from '@clerk/nextjs/server';
import { enrichWithLiveScores } from '@/lib/loadSchedulesFromScoreboard';
import { localYMD } from '@/app/utils/dateKey';
import { getBigBoardAndWatchlistProspects } from '@/lib/loadProspects';
import { buildTrackedPlayersMap, decorateGamesWithTrackedPlayers } from '@/lib/trackedPlayers';
import type { TrackedPlayerInfo } from '@/lib/trackedPlayers';
import type { GameWithProspects } from '@/app/utils/gameMatching';
import type { Prospect } from '@/app/types/prospect';

/**
 * Creates a canonical player ID from name and team (same as in lib/trackedPlayers.ts)
 */
function createCanonicalPlayerId(name: string, team: string | undefined, teamDisplay?: string | undefined): string {
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
 * Normalizes team name for matching (same as in lib/trackedPlayers.ts)
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
 * Checks if two team names match (handles variations like "Partizan" vs "Partizan Mozzart Bet")
 * Same logic as in lib/trackedPlayers.ts
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
  
  for (const [key, vars] of Object.entries(variations)) {
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
 * Extracts team name from prospect ID (format: "name|team")
 */
function extractTeamFromProspectId(prospectId: string): string | null {
  const parts = prospectId.split('|');
  return parts.length >= 2 ? parts[1] : null;
}

/**
 * Filters games to only include those with the specified prospect IDs
 * Also matches by team name to find games even if player isn't decorated yet
 */
function filterGamesByProspectIds(
  gamesByDate: Record<string, GameWithProspects[]>,
  prospectIds: Set<string>
): Record<string, GameWithProspects[]> {
  const filtered: Record<string, GameWithProspects[]> = {};
  
  // Extract team names from prospect IDs for team-based matching
  const prospectTeams = new Set<string>();
  for (const prospectId of prospectIds) {
    const team = extractTeamFromProspectId(prospectId);
    if (team) {
      prospectTeams.add(team);
    }
  }
  
  for (const [dateKey, games] of Object.entries(gamesByDate)) {
    const matchingGames = games.filter(game => {
      // Check tracked players arrays
      const hasInTracked = 
        (game.homeTrackedPlayers || []).some(p => prospectIds.has(p.playerId)) ||
        (game.awayTrackedPlayers || []).some(p => prospectIds.has(p.playerId));
      
      if (hasInTracked) return true;
      
      // Check old prospect arrays for backward compatibility
      const hasInProspects = 
        (game.prospects || []).some(p => {
          const prospectId = createCanonicalPlayerId(p.name, p.team, p.teamDisplay);
          return prospectIds.has(prospectId);
        }) ||
        (game.homeProspects || []).some(p => {
          const prospectId = createCanonicalPlayerId(p.name, p.team, p.teamDisplay);
          return prospectIds.has(prospectId);
        }) ||
        (game.awayProspects || []).some(p => {
          const prospectId = createCanonicalPlayerId(p.name, p.team, p.teamDisplay);
          return prospectIds.has(prospectId);
        });
      
      if (hasInProspects) return true;
      
      // NEW: Also match by team name - this finds games even if player isn't decorated yet
      // This is critical for watchlist players whose games exist but weren't decorated
      const homeTeamName = game.homeTeam?.displayName || game.homeTeam?.name || '';
      const awayTeamName = game.awayTeam?.displayName || game.awayTeam?.name || '';
      
      for (const prospectTeam of prospectTeams) {
        if (teamNamesMatch(homeTeamName, prospectTeam) || teamNamesMatch(awayTeamName, prospectTeam)) {
          return true;
        }
      }
      
      return false;
    });
    
    if (matchingGames.length > 0) {
      filtered[dateKey] = matchingGames;
    }
  }
  
  return filtered;
}

/**
 * Fast path: Query database directly for watchlist player games
 * Returns games if found, null if fast path should be skipped
 */
async function tryFastPath(
  clerkUserId: string,
  source: RankingSource,
  prospectIds: Set<string>,
  prospectNames: Set<string>,
  prospectTeams: Set<string>
): Promise<NextResponse | null> {
  try {
    const { supabaseAdmin, getSupabaseUserId } = await import('@/lib/supabase');
    const supabaseUserId = await getSupabaseUserId(clerkUserId);
    
    if (!supabaseUserId) {
      return null;
    }

    // Query for watchlist players matching these names/teams
    // Also try to match by prospect ID if we can extract it from the prospectIds
    const { data: rankings } = await supabaseAdmin
      .from('user_rankings')
      .select(`
        rank,
        prospects!inner(
          id,
          full_name,
          team_name,
          international_team_id,
          espn_team_id,
          source,
          espn_id
        )
      `)
      .eq('user_id', supabaseUserId);
    
    if (!rankings || rankings.length === 0) {
      console.log('[API/Prospects] No rankings found for user, fast path skipped');
      return null;
    }

    // Try to match by prospect ID first (more reliable)
    // prospectIds are in format "name|team", so we need to match by name/team
    // But also check if any prospectIds match espn_id directly
    const prospectIdArray = Array.from(prospectIds);
    const matchingRankings = rankings.filter((r: any) => {
      if (!r.prospects) return false;
      
      const prospect = r.prospects;
      const name = (prospect.full_name || '').toLowerCase().trim();
      const team = (prospect.team_name || '').toLowerCase().trim();
      const espnId = prospect.espn_id || '';
      
      // Check if any prospectId matches the espn_id directly
      if (prospectIdArray.some(pid => pid === espnId || espnId.includes(pid) || pid.includes(espnId))) {
        return true;
      }
      
      // Match by name/team (original logic)
      return Array.from(prospectNames).some(pn => {
        const pnLower = pn.toLowerCase().trim();
        return name.includes(pnLower) || pnLower.includes(name);
      }) || Array.from(prospectTeams).some(pt => {
        const ptLower = pt.toLowerCase().trim();
        return team.includes(ptLower) || ptLower.includes(team);
      });
    });
    
    if (matchingRankings.length === 0) {
      console.log(`[API/Prospects] No matching prospects found. Looking for: ${Array.from(prospectNames).join(', ')}, teams: ${Array.from(prospectTeams).join(', ')}`);
      console.log(`[API/Prospects] Available prospects: ${rankings.map((r: any) => `${r.prospects?.full_name} (${r.prospects?.team_name})`).join(', ')}`);
      return null;
    }
    
    console.log(`[API/Prospects] ✅ Fast path: Found ${matchingRankings.length} matching prospects`);

    console.log(`[API/Prospects] Found ${matchingRankings.length} matching prospects in database`);
    
    // Separate prospects by type: international, NCAA, NBL
    const internationalProspects = matchingRankings.filter((r: any) => r.prospects?.international_team_id);
    const ncaaProspects = matchingRankings.filter((r: any) => 
      r.prospects?.espn_team_id && !r.prospects?.international_team_id
    );
    const nblProspects = matchingRankings.filter((r: any) => 
      r.prospects?.espn_team_id && (r.prospects?.team_name || '').toLowerCase().includes('melbourne') ||
      (r.prospects?.team_name || '').toLowerCase().includes('new zealand breakers') ||
      (r.prospects?.team_name || '').toLowerCase().includes('adelaide') ||
      (r.prospects?.team_name || '').toLowerCase().includes('brisbane') ||
      (r.prospects?.team_name || '').toLowerCase().includes('cairns') ||
      (r.prospects?.team_name || '').toLowerCase().includes('illawarra') ||
      (r.prospects?.team_name || '').toLowerCase().includes('perth') ||
      (r.prospects?.team_name || '').toLowerCase().includes('south east melbourne') ||
      (r.prospects?.team_name || '').toLowerCase().includes('southeast melbourne') ||
      (r.prospects?.team_name || '').toLowerCase().includes('sydney') ||
      (r.prospects?.team_name || '').toLowerCase().includes('tasmania')
    );
    
    const allGames: any[] = [];
    
    // Query international team schedules
    if (internationalProspects.length > 0) {
      const teamIds = internationalProspects
        .map((r: any) => r.prospects.international_team_id)
        .filter(Boolean);
      
      if (teamIds.length > 0) {
        console.log(`[API/Prospects] Querying international_team_schedules for ${teamIds.length} team IDs`);
        const { data: gamesData } = await supabaseAdmin
          .from('international_team_schedules')
          .select('*')
          .in('team_id', teamIds)
          .order('date', { ascending: true });
        
        if (gamesData) {
          allGames.push(...gamesData.map((g: any) => ({ ...g, league: 'international' })));
        }
      }
    }
    
    // Query NCAA team schedules using espn_team_id
    if (ncaaProspects.length > 0) {
      const espnTeamIds = ncaaProspects
        .map((r: any) => r.prospects?.espn_team_id)
        .filter(Boolean);
      
      if (espnTeamIds.length > 0) {
        console.log(`[API/Prospects] Querying ncaa_team_schedules for ${espnTeamIds.length} ESPN team IDs: ${espnTeamIds.join(', ')}`);
        const { data: gamesData } = await supabaseAdmin
          .from('ncaa_team_schedules')
          .select('*')
          .in('espn_team_id', espnTeamIds)
          .order('date', { ascending: true });
        
        if (gamesData) {
          allGames.push(...gamesData.map((g: any) => ({ ...g, league: 'ncaa' })));
          console.log(`[API/Prospects] Found ${gamesData.length} NCAA games from database`);
        }
      }
    }
    
    // Query NBL team schedules using espn_team_id
    if (nblProspects.length > 0) {
      const espnTeamIds = nblProspects
        .map((r: any) => r.prospects?.espn_team_id)
        .filter(Boolean);
      
      if (espnTeamIds.length > 0) {
        console.log(`[API/Prospects] Querying nbl_team_schedules for ${espnTeamIds.length} ESPN team IDs: ${espnTeamIds.join(', ')}`);
        const { data: gamesData } = await supabaseAdmin
          .from('nbl_team_schedules')
          .select('*')
          .in('espn_team_id', espnTeamIds)
          .order('date', { ascending: true });
        
        if (gamesData) {
          allGames.push(...gamesData.map((g: any) => ({ ...g, league: 'nbl' })));
          console.log(`[API/Prospects] Found ${gamesData.length} NBL games from database`);
        }
      }
    }
    
    if (allGames.length === 0) {
      return null;
    }

    const gamesData = allGames;
    console.log(`[API/Prospects] ⚡ FAST PATH: Found ${gamesData.length} total games directly from database (international: ${internationalProspects.length}, NCAA: ${ncaaProspects.length}, NBL: ${nblProspects.length})`);
    
    // Convert database games to GameWithProspects format
    // Group games by unique game key first to avoid duplicates
    const gamesMap = new Map<string, GameWithProspects>();
    
    // Collect all unique team IDs from games to query ALL prospects on both teams
    const homeTeamIds = new Set<string>();
    const awayTeamIds = new Set<string>();
    const internationalTeamIds = new Set<string>();
    
    for (const gameData of gamesData) {
      if (gameData.league === 'international') {
        internationalTeamIds.add(gameData.home_team_id);
        internationalTeamIds.add(gameData.away_team_id);
      } else if (gameData.league === 'ncaa' || gameData.league === 'nbl') {
        homeTeamIds.add(gameData.home_team_id);
        awayTeamIds.add(gameData.away_team_id);
      }
    }
    
    // Query ALL prospects on all teams involved in these games
    // Use the matchingRankings we already have, and only query for additional prospects if needed
    // This is faster and avoids duplicate queries
    let allTeamRankings: any[] = [...matchingRankings]; // Start with the matching prospects
    
    // Only query for additional prospects if we have games and need to find prospects on opposing teams
    try {
      if (internationalTeamIds.size > 0) {
        // Query prospects first, then rankings
        const { data: intlProspects, error: intlError } = await supabaseAdmin
          .from('prospects')
          .select('id, international_team_id')
          .in('international_team_id', Array.from(internationalTeamIds));
        
        if (intlError) {
          console.warn('[API/Prospects] Error querying international prospects:', intlError);
        } else if (intlProspects && intlProspects.length > 0) {
          const prospectIds = intlProspects.map(p => p.id);
          const existingProspectIds = new Set(matchingRankings.map((r: any) => r.prospects?.id).filter(Boolean));
          const newProspectIds = prospectIds.filter(id => !existingProspectIds.has(id));
          
          if (newProspectIds.length > 0) {
            const { data: rankings, error: rankingsError } = await supabaseAdmin
              .from('user_rankings')
              .select(`
                rank,
                prospects!inner(
                  id,
                  full_name,
                  team_name,
                  position,
                  international_team_id
                )
              `)
              .eq('user_id', supabaseUserId)
              .in('prospect_id', newProspectIds);
            
            if (rankingsError) {
              console.warn('[API/Prospects] Error querying international rankings:', rankingsError);
            } else if (rankings) {
              allTeamRankings.push(...rankings);
            }
          }
        }
      }
      
      if (homeTeamIds.size > 0 || awayTeamIds.size > 0) {
        const allEspnTeamIds = Array.from(new Set([...homeTeamIds, ...awayTeamIds]));
        const { data: ncaaNblProspects, error: ncaaError } = await supabaseAdmin
          .from('prospects')
          .select('id, espn_team_id')
          .in('espn_team_id', allEspnTeamIds);
        
        if (ncaaError) {
          console.warn('[API/Prospects] Error querying NCAA/NBL prospects:', ncaaError);
        } else if (ncaaNblProspects && ncaaNblProspects.length > 0) {
          const prospectIds = ncaaNblProspects.map(p => p.id);
          const existingProspectIds = new Set(matchingRankings.map((r: any) => r.prospects?.id).filter(Boolean));
          const newProspectIds = prospectIds.filter(id => !existingProspectIds.has(id));
          
          if (newProspectIds.length > 0) {
            const { data: rankings, error: rankingsError } = await supabaseAdmin
              .from('user_rankings')
              .select(`
                rank,
                prospects!inner(
                  id,
                  full_name,
                  team_name,
                  position,
                  espn_team_id
                )
              `)
              .eq('user_id', supabaseUserId)
              .in('prospect_id', newProspectIds);
            
            if (rankingsError) {
              console.warn('[API/Prospects] Error querying NCAA/NBL rankings:', rankingsError);
            } else if (rankings) {
              allTeamRankings.push(...rankings);
            }
          }
        }
      }
    } catch (queryError) {
      console.error('[API/Prospects] Error querying all team rankings, continuing with matching prospects only:', queryError);
      // Continue with just the matchingRankings - games will still be returned
    }
    
    console.log(`[API/Prospects] ⚡ FAST PATH: Found ${allTeamRankings.length} total prospects across all teams in games (${matchingRankings.length} matching, ${allTeamRankings.length - matchingRankings.length} additional)`);
    
    // Get tracked players map BEFORE creating games to check watchlist status
    let trackedMap: Record<string, TrackedPlayerInfo> = {};
    if (clerkUserId) {
      try {
        const { bigBoard, watchlist } = await getBigBoardAndWatchlistProspects(source, clerkUserId);
        trackedMap = buildTrackedPlayersMap(bigBoard, watchlist);
        console.log(`[API/Prospects] ⚡ FAST PATH: Built tracked players map (${Object.keys(trackedMap).length} players)`);
      } catch (err) {
        console.error('[API/Prospects] Failed to build tracked players map:', err);
      }
    }
    
    for (const gameData of gamesData) {
      // Find ALL prospects on both teams for this game
      let teamRankings: any[] = [];
      
      if (gameData.league === 'international') {
        // International: match by team_id UUID for both home and away
        teamRankings = allTeamRankings.filter((r: any) => {
          const prospectTeamId = r.prospects?.international_team_id;
          return prospectTeamId === gameData.home_team_id || prospectTeamId === gameData.away_team_id;
        });
      } else if (gameData.league === 'ncaa' || gameData.league === 'nbl') {
        // NCAA/NBL: match by espn_team_id for both home and away
        const homeTeamId = gameData.home_team_id;
        const awayTeamId = gameData.away_team_id;
        teamRankings = allTeamRankings.filter((r: any) => {
          const prospectEspnTeamId = r.prospects?.espn_team_id;
          return prospectEspnTeamId === homeTeamId || prospectEspnTeamId === awayTeamId;
        });
      }
      
      // Use date_key from database if available (already in YYYY-MM-DD format)
      // Otherwise parse from date timestamp
      let dateKey: string;
      if (gameData.date_key) {
        dateKey = gameData.date_key; // Already in YYYY-MM-DD format
      } else {
        // Parse from timestamp - use local date, not UTC, to avoid timezone shifts
        const gameDate = new Date(gameData.date);
        // Get local date components to avoid timezone issues
        const year = gameDate.getFullYear();
        const month = String(gameDate.getMonth() + 1).padStart(2, '0');
        const day = String(gameDate.getDate()).padStart(2, '0');
        dateKey = `${year}-${month}-${day}`;
      }
      
      // Parse date for time extraction (use original date for time)
      const gameDate = new Date(gameData.date);
      
      // If no prospects found for this game, skip it (we only show games with prospects)
      // But log it for debugging
      if (teamRankings.length === 0) {
        console.log(`[API/Prospects] ⚡ FAST PATH: No prospects found for game ${gameData.home_team_name} vs ${gameData.away_team_name} on ${dateKey}`);
        continue;
      }
      const hours = gameDate.getUTCHours();
      const minutes = gameDate.getUTCMinutes();
      const isoTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
      
      let sourceIdentifier: string;
      if (gameData.league === 'international') {
        sourceIdentifier = `intl-${gameData.league_id || 'unknown'}`;
      } else if (gameData.league === 'ncaa') {
        sourceIdentifier = 'ncaa';
      } else {
        sourceIdentifier = 'nbl';
      }
      
      const key = buildGameKey(
        dateKey,
        isoTime,
        gameData.home_team_name,
        gameData.away_team_name,
        gameData.venue || undefined,
        sourceIdentifier
      );
      
      // Get or create game object
      let game = gamesMap.get(key);
      const homeDisplayName = gameData.home_team_display_name || gameData.home_team_name;
      const awayDisplayName = gameData.away_team_display_name || gameData.away_team_name;
      
      if (!game) {
        const sortTimestamp = hours * 60 + minutes;
        
        game = {
          id: gameData.game_id || `${gameData.league || 'espn'}-${gameData.date}-${gameData.home_team_id}-${gameData.away_team_id}`,
          date: dateKey,
          dateKey,
          sortTimestamp,
          // Store tipoff in ET (as stored in database), client will convert to local timezone
          tipoff: gameDate.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/New_York'
          }) + ' ET',
          homeTeam: {
            id: String(gameData.home_team_id),
            name: gameData.home_team_name,
            displayName: homeDisplayName,
            logo: gameData.home_team_logo || undefined,
            score: gameData.home_score || undefined,
          },
          awayTeam: {
            id: String(gameData.away_team_id),
            name: gameData.away_team_name,
            displayName: awayDisplayName,
            logo: gameData.away_team_logo || undefined,
            score: gameData.away_score || undefined,
          },
          status: gameData.status || 'Scheduled',
          statusDetail: gameData.status_detail || undefined,
          locationType: gameData.location_type === 'neutral' ? 'neutral' : (gameData.location_type === 'home' ? 'home' : 'away'),
          venue: gameData.venue || undefined,
          tv: gameData.broadcasts?.[0] || undefined,
          note: gameData.notes || undefined,
          prospects: [],
          homeProspects: [],
          awayProspects: [],
          // Add gameKey for client-side merging
          gameKey: key,
        } as GameWithProspects & { gameKey: string };
        gamesMap.set(key, game);
      }
      
      // Add ALL prospects from matching teams to the game
      for (const ranking of teamRankings) {
        if (!ranking.prospects) continue;
        const prospectData: any = ranking.prospects;
        
        // Check if this is a watchlist player (not on big board)
        const prospectId = createCanonicalPlayerId(
          prospectData.full_name || '',
          prospectData.team_name || '',
          prospectData.team_name || ''
        );
        const tracked = trackedMap[prospectId];
        const isWatchlistPlayer = tracked?.isWatchlist === true;
        
        const prospect: Prospect = {
          name: prospectData.full_name || '',
          team: prospectData.team_name || '',
          // Only assign rank if NOT a watchlist player
          rank: isWatchlistPlayer ? undefined : ranking.rank,
          position: prospectData.position || '',
          teamDisplay: prospectData.team_name || '',
          isWatchlist: isWatchlistPlayer,
        };
        
        // Determine prospect side by comparing prospect's team ID to game's home/away team IDs
        let isHome = false;
        let isAway = false;
        
        if (gameData.league === 'international') {
          // International: compare prospect's international_team_id to game's home/away team IDs
          const prospectTeamId = prospectData.international_team_id;
          isHome = String(gameData.home_team_id) === String(prospectTeamId);
          isAway = String(gameData.away_team_id) === String(prospectTeamId);
        } else {
          // NCAA/NBL: compare prospect's espn_team_id to game's home/away team IDs
          const prospectEspnTeamId = prospectData.espn_team_id;
          isHome = String(gameData.home_team_id) === String(prospectEspnTeamId);
          isAway = String(gameData.away_team_id) === String(prospectEspnTeamId);
        }
        
        // Log if we can't determine side (shouldn't happen if teamRankings filtering is correct)
        if (!isHome && !isAway) {
          console.warn(`[API/Prospects] ⚠️ Could not determine prospect side for ${prospectData.full_name} in game ${gameData.home_team_name} vs ${gameData.away_team_name}`);
          console.warn(`[API/Prospects]   Prospect team ID: ${prospectData.international_team_id || prospectData.espn_team_id}`);
          console.warn(`[API/Prospects]   Game home ID: ${gameData.home_team_id}, away ID: ${gameData.away_team_id}`);
        }
        
        // Add to appropriate arrays
        game.prospects.push(prospect);
        if (isHome) {
          game.homeProspects.push(prospect);
        } else if (isAway) {
          game.awayProspects.push(prospect);
        } else {
          // Final fallback: add to both
          game.homeProspects.push(prospect);
          game.awayProspects.push(prospect);
        }
      }
    }
    
    
    // Group games by date
    const gamesByDate: Record<string, GameWithProspects[]> = {};
    for (const game of gamesMap.values()) {
      if (!gamesByDate[game.dateKey || game.date]) {
        gamesByDate[game.dateKey || game.date] = [];
      }
      gamesByDate[game.dateKey || game.date].push(game);
    }
    
    console.log(`[API/Prospects] ⚡ FAST PATH: Converted ${Object.values(gamesByDate).flat().length} games across ${Object.keys(gamesByDate).length} dates`);
    
    // Decorate with tracked players (for homeTrackedPlayers/awayTrackedPlayers arrays)
    if (clerkUserId && Object.keys(trackedMap).length > 0) {
      try {
        const decoratedGamesByDate: Record<string, GameWithProspects[]> = {};
        for (const [dateKey, games] of Object.entries(gamesByDate)) {
          const decorated = decorateGamesWithTrackedPlayers(games, trackedMap);
          // Merge decorated properties back into original games
          decoratedGamesByDate[dateKey] = games.map((game, idx) => ({
            ...game,
            ...decorated[idx],
          })) as GameWithProspects[];
        }
        
        Object.assign(gamesByDate, decoratedGamesByDate);
        console.log(`[API/Prospects] ⚡ FAST PATH: Decorated games with tracked players`);
      } catch (err) {
        console.error('[API/Prospects] Failed to decorate games with tracked players:', err);
      }
    }
    
    // Enrich today's games with live scores in background
    const todayKey = localYMD(new Date());
    if (gamesByDate[todayKey] && gamesByDate[todayKey].length > 0) {
      enrichWithLiveScores(gamesByDate[todayKey]).catch(err => 
        console.error('[API/Prospects] Background score enrichment failed:', err)
      );
    }
    
    // Return fast path response
    console.log(`[API/Prospects] ⚡ FAST PATH: Returning ${Object.values(gamesByDate).flat().length} games without loading all schedules`);
    return NextResponse.json(
      { games: gamesByDate, source },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Generated-At': new Date().toISOString(),
          'X-Fast-Path': 'true',
        },
      }
    );
  } catch (err) {
    console.warn('[API/Prospects] Fast path query failed, falling back to loadAllSchedules:', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sourceParam = searchParams.get('source') || 'espn';
    const prospectIdsParam = searchParams.get('prospectIds');
    
    // Validate source parameter
    if (sourceParam !== 'espn' && sourceParam !== 'myboard') {
      return NextResponse.json(
        { error: 'Invalid source. Must be "espn" or "myboard"', games: {} },
        { status: 400 }
      );
    }
    
    // Validate prospectIds parameter
    if (!prospectIdsParam) {
      return NextResponse.json(
        { error: 'Missing prospectIds parameter. Provide comma-separated prospect IDs.', games: {} },
        { status: 400 }
      );
    }
    
    const source = sourceParam as RankingSource;
    const prospectIds = new Set(prospectIdsParam.split(',').map(id => id.trim()).filter(Boolean));
    
    console.log(`[API/Prospects] Fetching games for ${prospectIds.size} prospect(s): ${Array.from(prospectIds).join(', ')}`);
    
    // Get userId for watchlist players
    const { userId } = await auth();
    const clerkUserId = userId || undefined;
    
    // OPTIMIZATION: For watchlist players, query database directly for their teams
    // This is much faster than loading all schedules
    if (clerkUserId && source === 'myboard') {
      console.log(`[API/Prospects] Optimizing: Querying database directly for prospect teams...`);
      
      // Extract team names from prospect IDs
      const prospectTeams = new Set<string>();
      const prospectNames = new Set<string>();
      for (const prospectId of prospectIds) {
        const parts = prospectId.split('|');
        if (parts.length >= 2) {
          prospectNames.add(parts[0].trim());
          prospectTeams.add(parts[1].trim());
        }
      }
      
      console.log(`[API/Prospects] Looking for teams: ${Array.from(prospectTeams).join(', ')}`);
      console.log(`[API/Prospects] Looking for players: ${Array.from(prospectNames).join(', ')}`);
      
      // Try fast path - if it succeeds, return early
      const fastPathResult = await tryFastPath(clerkUserId, source, prospectIds, prospectNames, prospectTeams);
      if (fastPathResult) {
        return fastPathResult;
      }
    }
    
    // Load all schedules (we'll filter to specific prospects)
    // TODO: Optimize this to only load games for the specific teams
    console.time(`[API/Prospects] loadAllSchedules-${source}`);
    const { gamesByDate } = await loadAllSchedules(source, false, clerkUserId);
    console.timeEnd(`[API/Prospects] loadAllSchedules-${source}`);
    
    const totalGamesBeforeFilter = Object.values(gamesByDate).flat().length;
    console.log(`[API/Prospects] Loaded ${totalGamesBeforeFilter} total games across ${Object.keys(gamesByDate).length} dates before filtering`);
    
    // Debug: Check if any games have Partizan
    const partizanGames = Object.values(gamesByDate).flat().filter(g => {
      const homeName = (g.homeTeam?.displayName || g.homeTeam?.name || '').toLowerCase();
      const awayName = (g.awayTeam?.displayName || g.awayTeam?.name || '').toLowerCase();
      return homeName.includes('partizan') || awayName.includes('partizan');
    });
    console.log(`[API/Prospects] Found ${partizanGames.length} Partizan games in loaded schedules`);
    
    // Filter games to only include those with the specified prospect IDs
    console.time(`[API/Prospects] Filter games by prospect IDs`);
    const filteredGames = filterGamesByProspectIds(gamesByDate, prospectIds);
    console.timeEnd(`[API/Prospects] Filter games by prospect IDs`);
    
    const totalGamesAfterFilter = Object.values(filteredGames).flat().length;
    console.log(`[API/Prospects] Found ${totalGamesAfterFilter} games across ${Object.keys(filteredGames).length} dates after filtering`);
    
    // Debug: Log which prospect IDs we're looking for
    console.log(`[API/Prospects] Looking for prospect IDs: ${Array.from(prospectIds).join(', ')}`);
    console.log(`[API/Prospects] Extracted team names: ${Array.from(new Set(Array.from(prospectIds).map(id => extractTeamFromProspectId(id)).filter(Boolean))).join(', ')}`);
    
    // Decorate games with tracked players (big board + watchlist)
    if (clerkUserId) {
      console.time(`[API/Prospects] Decorate games with tracked players`);
      try {
        const { bigBoard, watchlist } = await getBigBoardAndWatchlistProspects(source, clerkUserId);
        const trackedMap = buildTrackedPlayersMap(bigBoard, watchlist);
        
        // Decorate filtered games
        const decoratedGamesByDate: Record<string, GameWithProspects[]> = {};
        for (const [dateKey, games] of Object.entries(filteredGames)) {
          const decorated = decorateGamesWithTrackedPlayers(games, trackedMap);
          // Merge decorated properties back into original games
          decoratedGamesByDate[dateKey] = games.map((game, idx) => ({
            ...game,
            ...decorated[idx],
          })) as GameWithProspects[];
        }
        
        // Replace filteredGames with decorated version
        Object.assign(filteredGames, decoratedGamesByDate);
        console.timeEnd(`[API/Prospects] Decorate games with tracked players`);
      } catch (err) {
        console.error('[API/Prospects] Failed to decorate games with tracked players:', err);
        // Continue without decoration
      }
    }
    
    // Query database directly for Theo Maledon's teams and games (AFTER all processing, BEFORE response)
    // This ensures it appears at the bottom of the terminal
    if (clerkUserId && Array.from(prospectIds).some(id => id.toLowerCase().includes('maledon') || id.toLowerCase().includes('theo'))) {
      try {
        const { supabaseAdmin, getSupabaseUserId } = await import('@/lib/supabase');
        const supabaseUserId = await getSupabaseUserId(clerkUserId);
        
        if (supabaseUserId) {
          // Query for Theo Maledon in prospects table
          const { data: prospects } = await supabaseAdmin
            .from('prospects')
            .select('id, full_name, team_name, international_team_id, source')
            .ilike('full_name', '%maledon%');
          
          console.log(`\n\n[API/Prospects] ========== THEO MALEDON DATABASE QUERY (AT BOTTOM) ==========`);
          if (prospects && prospects.length > 0) {
            console.log(`[API/Prospects] Found ${prospects.length} prospect(s) matching "Maledon":`);
            prospects.forEach((p: any) => {
              console.log(`[API/Prospects]   - Name: "${p.full_name}"`);
              console.log(`[API/Prospects]   - Team: "${p.team_name}"`);
              console.log(`[API/Prospects]   - International Team ID: ${p.international_team_id || 'NONE'}`);
              console.log(`[API/Prospects]   - Source: "${p.source || 'NONE'}"`);
            });
            
            // Query for games for his international team IDs
            const teamIds = prospects
              .filter((p: any) => p.international_team_id)
              .map((p: any) => p.international_team_id);
            
            if (teamIds.length > 0) {
              const { data: games } = await supabaseAdmin
                .from('international_team_schedules')
                .select('*')
                .in('team_id', teamIds)
                .order('date', { ascending: true });
              
              if (games && games.length > 0) {
                console.log(`[API/Prospects] Found ${games.length} games in international_team_schedules:`);
                
                // Group by team
                const gamesByTeam = new Map<string, any[]>();
                games.forEach((g: any) => {
                  // Find which team this game belongs to
                  const matchingProspect = prospects.find((p: any) => 
                    p.international_team_id === g.team_id
                  );
                  const teamName = matchingProspect?.team_name || 'Unknown';
                  if (!gamesByTeam.has(teamName)) {
                    gamesByTeam.set(teamName, []);
                  }
                  gamesByTeam.get(teamName)!.push(g);
                });
                
                gamesByTeam.forEach((teamGames, teamName) => {
                  console.log(`[API/Prospects]   ${teamName}: ${teamGames.length} games`);
                  // Show first few games
                  teamGames.slice(0, 3).forEach((g: any) => {
                    console.log(`[API/Prospects]     - ${g.date}: ${g.away_team_name} @ ${g.home_team_name}`);
                  });
                  if (teamGames.length > 3) {
                    console.log(`[API/Prospects]     ... and ${teamGames.length - 3} more games`);
                  }
                });
              } else {
                console.log(`[API/Prospects] ⚠️  No games found in international_team_schedules for team IDs: ${teamIds.join(', ')}`);
              }
            } else {
              console.log(`[API/Prospects] ⚠️  Theo Maledon has no international_team_id in database`);
            }
          } else {
            console.log(`[API/Prospects] ⚠️  No prospects found matching "Maledon" in database`);
          }
          console.log(`[API/Prospects] ============================================================\n\n`);
        }
      } catch (err) {
        console.error(`[API/Prospects] Error querying database for Theo Maledon:`, err);
      }
    }
    
    // Enrich today's games with live scores in background (fire-and-forget)
    const todayKey = localYMD(new Date());
    if (filteredGames[todayKey] && filteredGames[todayKey].length > 0) {
      enrichWithLiveScores(filteredGames[todayKey]).catch(err => 
        console.error('[API/Prospects] Background score enrichment failed:', err)
      );
    }
    
    // FINAL SUMMARY LOG (AT VERY BOTTOM OF TERMINAL)
    console.log(`\n\n[API/Prospects] ========== FINAL SUMMARY (AT VERY BOTTOM) ==========`);
    console.log(`[API/Prospects] Requested prospect IDs: ${Array.from(prospectIds).join(', ')}`);
    console.log(`[API/Prospects] Extracted team names: ${Array.from(new Set(Array.from(prospectIds).map(id => extractTeamFromProspectId(id)).filter(Boolean))).join(', ')}`);
    console.log(`[API/Prospects] Total games loaded before filter: ${totalGamesBeforeFilter}`);
    console.log(`[API/Prospects] Total games after filter: ${totalGamesAfterFilter}`);
    console.log(`[API/Prospects] Games across ${Object.keys(filteredGames).length} dates`);
    
    // Check for Theo Maledon specifically
    const maledonGames = Object.values(filteredGames).flat().filter(g => {
      const homeName = (g.homeTeam?.displayName || g.homeTeam?.name || '').toLowerCase();
      const awayName = (g.awayTeam?.displayName || g.awayTeam?.name || '').toLowerCase();
      return homeName.includes('france') || awayName.includes('france');
    });
    if (maledonGames.length > 0) {
      console.log(`[API/Prospects] Found ${maledonGames.length} games involving France (Theo Maledon's national team)`);
    }
    
    // Check for EuroLeague teams (common ones)
    const euroleagueTeams = ['real madrid', 'barcelona', 'olympiacos', 'panathinaikos', 'fenerbahce', 'cska', 'maccabi', 'asvel', 'valencia', 'baskonia'];
    const euroleagueGames = Object.values(filteredGames).flat().filter(g => {
      const homeName = (g.homeTeam?.displayName || g.homeTeam?.name || '').toLowerCase();
      const awayName = (g.awayTeam?.displayName || g.awayTeam?.name || '').toLowerCase();
      return euroleagueTeams.some(team => homeName.includes(team) || awayName.includes(team));
    });
    if (euroleagueGames.length > 0) {
      console.log(`[API/Prospects] Found ${euroleagueGames.length} EuroLeague games`);
    } else if (Array.from(prospectIds).some(id => id.toLowerCase().includes('maledon'))) {
      console.log(`[API/Prospects] ⚠️  No EuroLeague games found for Theo Maledon - only national team games?`);
    }
    
    console.log(`[API/Prospects] ============================================================\n\n`);
    
    const response = NextResponse.json(
      { games: filteredGames, source },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Generated-At': new Date().toISOString(),
        },
      }
    );
    
    return response;
  } catch (error) {
    console.error('[API/Prospects] Error fetching prospect games:', error);
    
    // ERROR SUMMARY AT BOTTOM TOO
    console.log(`\n\n[API/Prospects] ========== ERROR SUMMARY (AT BOTTOM) ==========`);
    console.error(`[API/Prospects] Error:`, error);
    console.log(`[API/Prospects] ============================================================\n\n`);
    
    return NextResponse.json(
      { error: 'Failed to load prospect games', games: {} },
      { status: 500 }
    );
  }
}

