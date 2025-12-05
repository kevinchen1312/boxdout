import { NextRequest, NextResponse } from 'next/server';
import { loadAllSchedules } from '@/lib/loadSchedules';
import type { RankingSource } from '@/lib/loadProspects';
import { auth } from '@clerk/nextjs/server';
import { enrichWithLiveScores } from '@/lib/loadSchedulesFromScoreboard';
import { localYMD } from '@/app/utils/dateKey';
import { getBigBoardAndWatchlistProspects, buildTrackedPlayersMap, decorateGamesWithTrackedPlayers } from '@/lib/trackedPlayers';
import type { GameWithProspects } from '@/app/utils/gameMatching';

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
      
      // Try to query international_team_schedules directly for these teams
      // This will be much faster than loadAllSchedules
      try {
        const { supabaseAdmin, getSupabaseUserId } = await import('@/lib/supabase');
        const supabaseUserId = await getSupabaseUserId(clerkUserId);
        
        if (supabaseUserId) {
          // Query for international roster players matching these names/teams
          const { data: rankings } = await supabaseAdmin
            .from('user_rankings')
            .select(`
              rank,
              prospects!inner(
                id,
                full_name,
                team_name,
                international_team_id,
                source
              )
            `)
            .eq('user_id', supabaseUserId);
          
          if (rankings && rankings.length > 0) {
            // Find matching prospects
            const matchingRankings = rankings.filter((r: any) => {
              const name = (r.prospects?.full_name || '').toLowerCase().trim();
              const team = (r.prospects?.team_name || '').toLowerCase().trim();
              return Array.from(prospectNames).some(pn => name.includes(pn.toLowerCase())) ||
                     Array.from(prospectTeams).some(pt => team.includes(pt.toLowerCase()));
            });
            
            if (matchingRankings.length > 0) {
              console.log(`[API/Prospects] Found ${matchingRankings.length} matching prospects in database`);
              
              // Get team IDs for international roster players
              const teamIds = matchingRankings
                .filter((r: any) => r.prospects?.international_team_id && r.prospects?.source === 'international-roster')
                .map((r: any) => r.prospects.international_team_id);
              
              if (teamIds.length > 0) {
                console.log(`[API/Prospects] Querying international_team_schedules for ${teamIds.length} team IDs: ${teamIds.join(', ')}`);
                
                // DEBUG: Log what teams we found for Theo Maledon
                matchingRankings.forEach((r: any) => {
                  const name = r.prospects?.full_name || '';
                  const team = r.prospects?.team_name || '';
                  const teamId = r.prospects?.international_team_id;
                  if (name.toLowerCase().includes('maledon') || name.toLowerCase().includes('theo')) {
                    console.log(`[API/Prospects] DEBUG Theo Maledon: name="${name}", team="${team}", teamId=${teamId}, source="${r.prospects?.source}"`);
                  }
                });
                
                // Query games directly
                const { data: gamesData } = await supabaseAdmin
                  .from('international_team_schedules')
                  .select('*')
                  .in('team_id', teamIds)
                  .order('date', { ascending: true });
                
                if (gamesData && gamesData.length > 0) {
                  console.log(`[API/Prospects] ✓ Found ${gamesData.length} games directly from database (FAST PATH)`);
                  
                  // DEBUG: Check what teams these games are for
                  const uniqueTeams = new Set<string>();
                  gamesData.forEach((g: any) => {
                    uniqueTeams.add(g.home_team_name);
                    uniqueTeams.add(g.away_team_name);
                  });
                  console.log(`[API/Prospects] DEBUG Games are for teams: ${Array.from(uniqueTeams).join(', ')}`);
                  
                  // TODO: Convert these games to GameWithProspects format and return early
                  // For now, fall through to loadAllSchedules for proper formatting
                } else {
                  console.log(`[API/Prospects] ⚠️ No games found in international_team_schedules for team IDs: ${teamIds.join(', ')}`);
                }
              } else {
                console.log(`[API/Prospects] ⚠️ No international_team_id found for matching prospects`);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[API/Prospects] Fast path query failed, falling back to loadAllSchedules:', err);
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
          decoratedGamesByDate[dateKey] = decorateGamesWithTrackedPlayers(games, trackedMap);
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

