// System to detect injuries from ESPN game data
// 1. Check ESPN injury report endpoint (if available)
// 2. Check box scores for completed games to see if a player didn't play
// 3. Track long-term injuries to mark future games
// 4. Manual override for known injuries

import type { Prospect } from '@/app/types/prospect';

interface GameBoxScore {
  gameId: string;
  date: string;
  teamId: string;
  players: Array<{
    name: string;
    played: boolean;
    minutes?: string;
    stats?: any;
  }>;
}

interface InjuryRecord {
  prospectName: string;
  startDate: string; // When injury started
  endDate?: string; // When injury ended (if known)
  status: 'OUT' | 'QUESTIONABLE' | 'DOUBTFUL' | 'PROBABLE';
  source: 'boxscore' | 'manual' | 'roster';
}

// Cache for injury records
const injuryRecordsCache = new Map<string, InjuryRecord[]>();

// Cache for ESPN injury endpoint responses
const injuryEndpointCache = new Map<string, { data: any; timestamp: number }>();
const INJURY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch injury report from ESPN API for a specific team
 */
export async function fetchTeamInjuries(teamId: string): Promise<any[]> {
  const cacheKey = `injuries_${teamId}`;
  const cached = injuryEndpointCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < INJURY_CACHE_TTL) {
    return cached.data.injuries || [];
  }
  
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/injuries?team=${teamId}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    });
    
    if (!response.ok) {
      console.warn(`[Injury Detection] Failed to fetch injuries for team ${teamId}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const injuries = data?.injuries || [];
    
    // Cache the response
    injuryEndpointCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
    
    if (injuries.length > 0) {
      console.log(`[Injury Detection] Found ${injuries.length} injuries for team ${teamId}`);
    }
    
    return injuries;
  } catch (error) {
    console.error(`[Injury Detection] Error fetching injuries for team ${teamId}:`, error);
    return [];
  }
}

/**
 * Check if a prospect is listed in ESPN injury report
 */
export async function checkInjuryReport(
  prospect: Prospect,
  gameDate: string
): Promise<'OUT' | 'QUESTIONABLE' | 'DOUBTFUL' | 'PROBABLE' | undefined> {
  if (!prospect.teamId) return undefined;
  
  const injuries = await fetchTeamInjuries(prospect.teamId);
  if (injuries.length === 0) return undefined;
  
  // Match prospect name to injury report
  const prospectNameLower = prospect.name.toLowerCase();
  const prospectVariants = [
    prospect.name,
    prospect.name.split(' ').reverse().join(' '), // "Mullins, Braylon" format
    prospect.name.split(' ')[0], // First name only
    prospect.name.split(' ').slice(-1)[0], // Last name only
  ];
  
  for (const injury of injuries) {
    // ESPN injury structure may vary - check multiple possible fields
    const playerName = injury.player?.displayName || 
                      injury.player?.fullName || 
                      injury.displayName || 
                      injury.name || 
                      '';
    
    if (!playerName) continue;
    
    const playerNameLower = playerName.toLowerCase();
    
    // Check if this injury matches our prospect
    const nameMatches = prospectVariants.some(variant => 
      playerNameLower.includes(variant.toLowerCase()) ||
      variant.toLowerCase().includes(playerNameLower)
    );
    
    if (nameMatches) {
      // Extract injury status from ESPN injury object
      const status = injury.status || injury.type || injury.severity || '';
      const statusUpper = status.toUpperCase();
      
      // Check if injury is active for this game date
      const injuryDate = injury.date || injury.startDate;
      const returnDate = injury.returnDate || injury.endDate;
      
      if (injuryDate) {
        const injuryDateObj = new Date(injuryDate);
        const gameDateObj = new Date(gameDate);
        if (gameDateObj < injuryDateObj) {
          // Injury hasn't started yet
          continue;
        }
      }
      
      if (returnDate) {
        const returnDateObj = new Date(returnDate);
        const gameDateObj = new Date(gameDate);
        if (gameDateObj > returnDateObj) {
          // Player has returned from injury
          continue;
        }
      }
      
      // Map ESPN status to our status format
      if (statusUpper.includes('OUT') || statusUpper === 'OUT') {
        console.log(`[Injury Detection] Found injury report: ${prospect.name} is OUT (${status})`);
        return 'OUT';
      } else if (statusUpper.includes('QUESTIONABLE')) {
        return 'QUESTIONABLE';
      } else if (statusUpper.includes('DOUBTFUL')) {
        return 'DOUBTFUL';
      } else if (statusUpper.includes('PROBABLE')) {
        return 'PROBABLE';
      } else if (statusUpper.includes('INJURED') || statusUpper.includes('INJURY')) {
        // Default to OUT if injury is mentioned but status unclear
        return 'OUT';
      }
    }
  }
  
  return undefined;
}

/**
 * Fetch box score for a completed game to check if a player participated
 */
export async function fetchGameBoxScore(
  gameId: string,
  teamId: string
): Promise<GameBoxScore | null> {
  try {
    // Try multiple ESPN API endpoints for box score data
    const endpoints = [
      `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard/${gameId}`,
      `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/events/${gameId}`,
    ];

    let data: any = null;
    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
          },
          cache: 'no-store',
        });

        if (response.ok) {
          data = await response.json();
          break;
        }
      } catch (err) {
        continue;
      }
    }

    if (!data) {
      return null;
    }

    const competition = data?.competitions?.[0] || data?.events?.[0]?.competitions?.[0];
    if (!competition) return null;

    // Find the team's competitor
    const competitor = competition.competitors?.find(
      (c: any) => c.team?.id === teamId
    );
    if (!competitor) return null;

    // Get player statistics from box score
    const players: GameBoxScore['players'] = [];
    
    // Check multiple possible locations for box score data
    const boxscore = data.boxscore || competition.boxscore;
    const statistics = competitor.statistics || boxscore?.statistics || competitor.athletes;
    
    if (statistics && Array.isArray(statistics)) {
      // Try to find player stats in statistics array
      for (const stat of statistics) {
        if (stat.name === 'playerStats' && stat.athletes) {
          for (const athlete of stat.athletes) {
            const name = athlete.athlete?.displayName || athlete.athlete?.fullName || athlete.displayName || athlete.fullName;
            const minutes = athlete.stats?.find((s: any) => s.name === 'minutes' || s.name === 'MIN')?.value || athlete.minutes;
            const played = minutes !== undefined && minutes !== null && parseFloat(String(minutes)) > 0;
            
            if (name) {
              players.push({
                name,
                played,
                minutes: minutes?.toString(),
                stats: athlete.stats,
              });
            }
          }
        }
      }
    }

    // If no players found, return null (box score may not be available yet)
    if (players.length === 0) {
      return null;
    }

    return {
      gameId,
      date: competition.date || data.date,
      teamId,
      players,
    };
  } catch (error) {
    console.error(`[Injury Detection] Failed to fetch box score for game ${gameId}:`, error);
    return null;
  }
}

/**
 * Check if a prospect missed a completed game (indicating possible injury)
 */
export async function checkIfPlayerMissedGame(
  prospect: Prospect,
  gameId: string,
  gameDate: string
): Promise<boolean> {
  if (!prospect.teamId) return false;

  // Only check completed games
  const gameDateObj = new Date(gameDate);
  const today = new Date();
  if (gameDateObj > today) return false; // Future game

  const boxScore = await fetchGameBoxScore(gameId, prospect.teamId);
  if (!boxScore) return false;

  // Check if prospect is in the box score
  const prospectVariants = [
    prospect.name,
    prospect.name.split(' ').reverse().join(' '), // "Mullins, Braylon" format
  ];

  const playerInBoxScore = boxScore.players.find((p) =>
    prospectVariants.some((variant) =>
      p.name.toLowerCase().includes(variant.toLowerCase()) ||
      variant.toLowerCase().includes(p.name.toLowerCase())
    )
  );

  // If player is not in box score at all, they likely didn't play
  if (!playerInBoxScore) {
    console.log(`[Injury Detection] ${prospect.name} not found in box score for game ${gameId}`);
    return true;
  }

  // If player is in box score but didn't play (0 minutes or DNP)
  if (!playerInBoxScore.played) {
    console.log(`[Injury Detection] ${prospect.name} found in box score but didn't play (0 minutes)`);
    return true;
  }

  return false;
}

/**
 * Get injury status for a prospect on a specific game date
 * Checks in order:
 * 1. Manual injuries (highest priority)
 * 2. ESPN injury report endpoint
 * 3. Box scores for completed games
 */
export async function getInjuryStatusForGame(
  prospect: Prospect,
  gameId: string,
  gameDate: string
): Promise<'OUT' | 'QUESTIONABLE' | 'DOUBTFUL' | 'PROBABLE' | undefined> {
  // 1. First check manual injuries (highest priority - manual override)
  const { getManualInjuryStatus } = await import('./manualInjuries');
  const manualStatus = getManualInjuryStatus(prospect.name);
  if (manualStatus) {
    console.log(`[Injury Detection] Manual injury found for "${prospect.name}": ${manualStatus}`);
    return manualStatus;
  }

  // 2. Check ESPN injury report endpoint
  const injuryReportStatus = await checkInjuryReport(prospect, gameDate);
  if (injuryReportStatus) {
    console.log(`[Injury Detection] Injury report found for "${prospect.name}": ${injuryReportStatus}`);
    return injuryReportStatus;
  }

  // 3. For completed games, check if player missed the game (box score)
  const gameDateObj = new Date(gameDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  gameDateObj.setHours(0, 0, 0, 0);

  if (gameDateObj <= today) {
    // Past or today's game - check box score
    const missedGame = await checkIfPlayerMissedGame(prospect, gameId, gameDate);
    if (missedGame) {
      console.log(`[Injury Detection] Player "${prospect.name}" missed game ${gameId} (box score check)`);
      return 'OUT';
    }
  }

  return undefined;
}

/**
 * Batch check multiple games for injury status
 */
export async function batchCheckInjuries(
  prospects: Prospect[],
  games: Array<{ id: string; date: string; teamId?: string }>
): Promise<Map<string, Map<string, 'OUT' | 'QUESTIONABLE' | 'DOUBTFUL' | 'PROBABLE'>>> {
  const injuryMap = new Map<string, Map<string, 'OUT' | 'QUESTIONABLE' | 'DOUBTFUL' | 'PROBABLE'>>();

  // Process in batches to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < games.length; i += batchSize) {
    const batch = games.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (game) => {
        for (const prospect of prospects) {
          if (game.teamId && prospect.teamId === game.teamId) {
            const status = await getInjuryStatusForGame(prospect, game.id, game.date);
            if (status) {
              if (!injuryMap.has(prospect.name)) {
                injuryMap.set(prospect.name, new Map());
              }
              injuryMap.get(prospect.name)!.set(game.id, status);
            }
          }
        }
      })
    );
  }

  return injuryMap;
}

