import { supabaseAdmin, getSupabaseUserId } from './supabase';
import { format, parseISO } from 'date-fns';
import type { TeamDirectoryEntry } from './loadSchedules';

interface GameData {
  game_id: string;
  date: string;
  date_key: string;
  home_team: string;
  away_team: string;
  tipoff?: string | null;
  tv?: string | null;
  venue?: string | null;
  location_type: 'home' | 'away' | 'neutral' | null;
  source: string;
}

const TEAM_DIRECTORY_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?groups=50&limit=500';

let teamDirectoryCache: Map<string, TeamDirectoryEntry> | null = null;

const normalizeForLookup = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const getTeamDirectory = async (): Promise<Map<string, TeamDirectoryEntry>> => {
  if (teamDirectoryCache) {
    return teamDirectoryCache;
  }

  const response = await fetch(TEAM_DIRECTORY_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to load team directory (${response.status})`);
  }

  const data = await response.json();
  const teams: Array<{ team?: any }> =
    data?.sports?.[0]?.leagues?.[0]?.teams ?? [];

  const directory = new Map<string, TeamDirectoryEntry>();

  for (const item of teams) {
    const team = item?.team ?? item;
    if (!team?.id) continue;

    let logoUrl: string | undefined;
    if (team.logos && team.logos.length > 0) {
      logoUrl = team.logos[0].href;
    } else if (team.logo) {
      logoUrl = team.logo;
    } else {
      logoUrl = `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.id}.png`;
    }

    const entry: TeamDirectoryEntry = {
      id: String(team.id),
      displayName: team.displayName ?? '',
      shortDisplayName: team.shortDisplayName ?? '',
      name: team.name ?? '',
      nickname: team.nickname ?? '',
      location: team.location ?? '',
      slug: team.slug ?? '',
      logo: logoUrl,
    };

    const normalized = normalizeForLookup(entry.displayName);
    if (!directory.has(normalized)) {
      directory.set(normalized, entry);
    }
  }

  teamDirectoryCache = directory;
  return directory;
};

const findTeamEntry = async (teamName: string): Promise<TeamDirectoryEntry | null> => {
  // Validate input
  if (!teamName || typeof teamName !== 'string' || teamName.trim() === '') {
    console.warn(`[findTeamEntry] Invalid team name provided: "${teamName}"`);
    return null;
  }

  try {
    const directory = await getTeamDirectory();
    const normalized = normalizeForLookup(teamName);
    
    console.log(`[findTeamEntry] Looking for team: "${teamName}" (normalized: "${normalized}")`);
    
    // Try exact match first
    if (directory.has(normalized)) {
      const found = directory.get(normalized)!;
      console.log(`[findTeamEntry] Exact match found: ${found.displayName} (ID: ${found.id})`);
      return found;
    }
    
    // Try partial matches (handle variations like "California (Berkeley)" -> "California" or "Cal")
    // Also handle "Michigan State Spartans" -> "Michigan State"
    // Only match if the partial match is substantial (at least 4 characters)
    if (normalized.length >= 4) {
      for (const [key, entry] of directory.entries()) {
        // Only match if one contains the other and the match is substantial
        if ((key.includes(normalized) && normalized.length >= 4) || 
            (normalized.includes(key) && key.length >= 4)) {
          console.log(`[findTeamEntry] Partial match found: ${entry.displayName} (ID: ${entry.id}) for "${teamName}"`);
          return entry;
        }
      }
    }
    
    // Special handling for common team name variations
    // Also try removing common suffixes like "Spartans", "Bears", etc.
    const lowerName = teamName.toLowerCase().trim();
    
    // Try removing common team name suffixes
    const suffixesToRemove = [
      ' spartans', ' bears', ' lions', ' tigers', ' wildcats', ' bulldogs', 
      ' eagles', ' hawks', ' owls', ' panthers', ' warriors', ' knights', 
      ' pirates', ' raiders', ' cougars', ' hornets', ' jayhawks', 
      ' tar heels', ' blue devils', ' crimson tide', ' fighting irish',
      ' wolverines', ' buckeyes', ' longhorns', ' aggies', ' sooners',
      ' seminoles', ' hurricanes', ' gators', ' volunteers', ' razorbacks'
    ];
    
    for (const suffix of suffixesToRemove) {
      if (lowerName.endsWith(suffix)) {
        const withoutSuffix = lowerName.slice(0, -suffix.length).trim();
        if (withoutSuffix.length >= 3) { // Ensure we have a meaningful name after removing suffix
          const normalizedWithoutSuffix = normalizeForLookup(withoutSuffix);
          if (directory.has(normalizedWithoutSuffix)) {
            const found = directory.get(normalizedWithoutSuffix)!;
            console.log(`[findTeamEntry] Found match by removing suffix "${suffix}": ${found.displayName} (ID: ${found.id}) for "${teamName}"`);
            return found;
          }
        }
      }
    }
    
    // Common team name variations and abbreviations
    const variations: Record<string, string[]> = {
      'california': ['cal', 'california', 'berkeley', 'california berkeley'],
      'cal': ['california', 'berkeley', 'california berkeley'],
      'michiganstate': ['michigan state', 'michigan state spartans', 'msu', 'michigan st'],
      'northcarolinastate': ['nc state', 'ncst', 'north carolina state', 'north carolina state wolfpack'],
      'ncstate': ['nc state', 'ncst', 'north carolina state', 'north carolina state wolfpack'],
      'northcarolina': ['unc', 'north carolina', 'north carolina tar heels'],
      'kentucky': ['uk', 'kentucky', 'kentucky wildcats'],
      'kansas': ['ku', 'kansas', 'kansas jayhawks'],
      'duke': ['duke', 'duke blue devils'],
      'georgiatech': ['georgia tech', 'georgia institute of technology', 'gt'],
      'virginiatech': ['virginia tech', 'vt', 'virginia polytechnic'],
    };
    
    for (const [base, variants] of Object.entries(variations)) {
      if (variants.some(v => lowerName.includes(v.toLowerCase()))) {
        const baseNormalized = normalizeForLookup(base);
        if (directory.has(baseNormalized)) {
          const found = directory.get(baseNormalized)!;
          console.log(`[findTeamEntry] Variation match found: ${found.displayName} (ID: ${found.id}) for "${teamName}"`);
          return found;
        }
        // Try to find by variants
        for (const variant of variants) {
          const variantNormalized = normalizeForLookup(variant);
          if (directory.has(variantNormalized)) {
            const found = directory.get(variantNormalized)!;
            console.log(`[findTeamEntry] Variant match found: ${found.displayName} (ID: ${found.id}) for "${teamName}"`);
            return found;
          }
        }
      }
    }
    
    console.warn(`[findTeamEntry] No match found for team: "${teamName}"`);
    return null;
  } catch (error) {
    console.error(`[findTeamEntry] Error finding team entry for "${teamName}":`, error);
    return null;
  }
};

const fetchGamesFromESPN = async (teamId: string): Promise<GameData[]> => {
  // Validate teamId
  if (!teamId || typeof teamId !== 'string' || teamId.trim() === '') {
    throw new Error('Invalid teamId: must be a non-empty string');
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}/schedule`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Team not found (404): Team ID ${teamId} does not exist in ESPN database`);
      } else if (response.status === 429) {
        throw new Error(`Rate limited (429): Too many requests to ESPN API`);
      } else {
        throw new Error(`ESPN API returned ${response.status} ${response.statusText}`);
      }
    }

    const data = await response.json();
    
    // Validate response structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response from ESPN API: expected object');
    }

    const events = data.events || [];
    
    // Validate events is an array
    if (!Array.isArray(events)) {
      console.warn(`[fetchGamesFromESPN] Expected events array, got ${typeof events} for team ${teamId}`);
      return [];
    }

    const games: GameData[] = [];

    for (const event of events) {
      // Skip if event is missing required structure
      if (!event || typeof event !== 'object') continue;

      const comp = event.competitions?.[0];
      
      // Only process scheduled/pre games (not completed or in-progress)
      if (!comp || comp.status?.type?.state !== 'pre') continue;

      const competitors = comp.competitors || [];
      
      // Validate competitors is an array
      if (!Array.isArray(competitors)) continue;

      const home = competitors.find((c: any) => c.homeAway === 'home');
      const away = competitors.find((c: any) => c.homeAway === 'away');

      // Skip if missing home or away team
      if (!home || !away || !home.team || !away.team) continue;

      const eventDate = event.date || comp.date || comp.startDate;
      if (!eventDate) continue;

      // Validate and parse date
      let date: Date;
      try {
        date = parseISO(eventDate);
        if (Number.isNaN(date.getTime())) {
          console.warn(`[fetchGamesFromESPN] Invalid date format: ${eventDate}`);
          continue;
        }
      } catch (e) {
        console.warn(`[fetchGamesFromESPN] Error parsing date ${eventDate}:`, e);
        continue;
      }

      const dateKey = format(date, 'yyyy-MM-dd');

      // Format tipoff time
      // ESPN API returns dates in UTC (ISO 8601 format)
      // We need to determine the game's local timezone based on venue/location
      // For now, we'll check if it's a west coast game and use PT, otherwise ET
      // This matches how ESPN typically displays games
      let tipoff: string | null = null;
      if (eventDate) {
        try {
          const tipoffDate = new Date(eventDate);
          if (!Number.isNaN(tipoffDate.getTime())) {
            // Determine timezone based on venue (if available)
            // For west coast teams/venues, use PT; otherwise ET
            const venue = comp.venue;
            const isWestCoast = venue && (
              venue.address?.state === 'CA' || 
              venue.address?.state === 'OR' || 
              venue.address?.state === 'WA' ||
              venue.fullName?.toLowerCase().includes('california') ||
              venue.fullName?.toLowerCase().includes('oregon') ||
              venue.fullName?.toLowerCase().includes('washington')
            );
            
            const timezone = isWestCoast ? 'America/Los_Angeles' : 'America/New_York';
            const timezoneLabel = isWestCoast ? 'PT' : 'ET';
            
            const localTimeString = tipoffDate.toLocaleString('en-US', {
              timeZone: timezone,
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            });
            
            // Extract time and period from "11/27/2025, 1:30 PM" format
            const timeMatch = localTimeString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (timeMatch) {
              tipoff = `${timeMatch[1]}:${timeMatch[2]} ${timeMatch[3]} ${timezoneLabel}`;
            } else {
              // Fallback: use ET
              const etTimeString = tipoffDate.toLocaleString('en-US', {
                timeZone: 'America/New_York',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              });
              const etMatch = etTimeString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
              if (etMatch) {
                tipoff = `${etMatch[1]}:${etMatch[2]} ${etMatch[3]} ET`;
              }
            }
          }
        } catch (e) {
          // Ignore date parsing errors, tipoff will remain null
        }
      }

      // Get TV info
      let tv: string | null = null;
      const broadcasts = comp.broadcasts || [];
      if (Array.isArray(broadcasts) && broadcasts.length > 0) {
        const networkNames = broadcasts
          .map((b: any) => {
            if (b && typeof b === 'object') {
              return b.names?.[0] || b.shortName;
            }
            return null;
          })
          .filter(Boolean);
        if (networkNames.length > 0) {
          tv = networkNames.join(' / ');
        }
      }

      // Get venue
      const venue = comp.venue?.fullName || null;

      // Determine location type based on which team is the requested team
      let locationType: 'home' | 'away' | 'neutral' | null = null;
      const teamIdStr = String(teamId);
      if (home.team?.id === teamIdStr) {
        locationType = 'home';
      } else if (away.team?.id === teamIdStr) {
        locationType = 'away';
      } else {
        locationType = 'neutral';
      }

      // Get team names with fallbacks
      const homeTeamName = home.team?.displayName || home.team?.name || home.team?.location || 'Unknown';
      const awayTeamName = away.team?.displayName || away.team?.name || away.team?.location || 'Unknown';

      // Skip if team names are invalid
      if (homeTeamName === 'Unknown' || awayTeamName === 'Unknown') {
        console.warn(`[fetchGamesFromESPN] Skipping game with invalid team names: ${homeTeamName} vs ${awayTeamName}`);
        continue;
      }

      // Create unique game ID
      const gameId = `${dateKey}-${homeTeamName}-vs-${awayTeamName}`.replace(/[^a-zA-Z0-9-]/g, '-');

      games.push({
        game_id: gameId,
        date: dateKey,
        date_key: dateKey,
        home_team: homeTeamName,
        away_team: awayTeamName,
        tipoff,
        tv,
        venue,
        location_type: locationType,
        source: 'espn',
      });
    }

    console.log(`[fetchGamesFromESPN] Found ${games.length} games for team ${teamId}`);
    return games;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[fetchGamesFromESPN] Error fetching games from ESPN for team ${teamId}:`, errorMessage);
    throw error;
  }
};

/**
 * Fetch and store games for a prospect's team
 * @param prospectId - UUID of the prospect
 * @param teamId - ESPN team ID (string)
 * @returns Success status and game count
 */
export async function fetchAndStoreProspectGames(
  prospectId: string,
  teamId: string
): Promise<{ success: boolean; gamesCount: number; error?: string }> {
  try {
    // Validate inputs
    if (!prospectId || !teamId) {
      return {
        success: false,
        gamesCount: 0,
        error: 'Missing required parameters: prospectId and teamId are required',
      };
    }

    let games: GameData[] = [];
    const maxRetries = 2;
    let retryCount = 0;

    // Fetch games from ESPN API with retry logic
    while (retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          console.log(`[fetchAndStoreProspectGames] Retry ${retryCount} of ${maxRetries} for ESPN API (team ${teamId})`);
          // Exponential backoff: wait 1s, 2s, etc.
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }

        games = await fetchGamesFromESPN(teamId);
        break; // Success, exit retry loop
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[fetchAndStoreProspectGames] ESPN API failed for team ${teamId} (attempt ${retryCount + 1}):`, errorMessage);
        
        retryCount++;
        
        // If this was the last retry, return error
        if (retryCount > maxRetries) {
          return {
            success: false,
            gamesCount: 0,
            error: `Failed to fetch schedule from ESPN after ${maxRetries + 1} attempts: ${errorMessage}`,
          };
        }
      }
    }

    if (games.length === 0) {
      console.warn(`[fetchAndStoreProspectGames] No games found for team ${teamId} (prospect ${prospectId})`);
      return {
        success: false,
        gamesCount: 0,
        error: 'No games found for this team. The team may not have any scheduled games, or the season may not have started yet.',
      };
    }

    // Store games in database
    const gamesToInsert = games.map(game => ({
      prospect_id: prospectId,
      ...game,
    }));

    // Delete existing games for this prospect first to ensure we don't have stale/incorrect data
    // This is important because game times/timezones might have been stored incorrectly before
    const { error: deleteError } = await supabaseAdmin
      .from('prospect_games')
      .delete()
      .eq('prospect_id', prospectId);
    
    if (deleteError) {
      console.error(`[fetchAndStoreProspectGames] Error deleting old games for prospect ${prospectId}:`, deleteError);
      // Continue anyway - upsert will handle duplicates
    } else {
      console.log(`[fetchAndStoreProspectGames] Deleted old games for prospect ${prospectId} before inserting new ones`);
    }

    // Insert new games (no need for upsert since we deleted old ones)
    const { error: insertError } = await supabaseAdmin
      .from('prospect_games')
      .insert(gamesToInsert)
      .select('game_id');
    
    const count = gamesToInsert.length;

    if (insertError) {
      console.error(`[fetchAndStoreProspectGames] Error storing prospect games for prospect ${prospectId}:`, {
        error: insertError.message,
        code: insertError.code,
        details: insertError.details,
        gamesCount: games.length,
      });
      return {
        success: false,
        gamesCount: 0,
        error: `Failed to store games in database: ${insertError.message}`,
      };
    }

    console.log(`[fetchAndStoreProspectGames] Successfully stored ${games.length} games for prospect ${prospectId} (team ${teamId})`);
    
    return {
      success: true,
      gamesCount: games.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[fetchAndStoreProspectGames] Unexpected error fetching prospect games for prospect ${prospectId}:`, errorMessage);
    return {
      success: false,
      gamesCount: 0,
      error: `Unexpected error: ${errorMessage}`,
    };
  }
}

/**
 * Resolve team_id from team name using team directory
 * @param teamName - Name of the team
 * @returns Team ID if found, null otherwise
 */
export async function resolveTeamIdFromName(teamName: string): Promise<string | null> {
  try {
    console.log(`[resolveTeamIdFromName] Resolving team ID for: "${teamName}"`);
    const teamEntry = await findTeamEntry(teamName);
    if (teamEntry) {
      console.log(`[resolveTeamIdFromName] Successfully resolved "${teamName}" to team ID: ${teamEntry.id} (${teamEntry.displayName})`);
      return teamEntry.id;
    } else {
      console.warn(`[resolveTeamIdFromName] Could not resolve team ID for: "${teamName}"`);
      return null;
    }
  } catch (error) {
    console.error(`[resolveTeamIdFromName] Error resolving team ID for ${teamName}:`, error);
    return null;
  }
}

export interface BackfillResult {
  success: boolean;
  totalProspects: number;
  prospectsProcessed: number;
  prospectsWithGames: number;
  prospectsWithoutGames: number;
  totalGamesAdded: number;
  errors: Array<{ prospectId: string; prospectName: string; error: string }>;
}

/**
 * Backfill games for existing watchlist players who don't have games yet
 * @param clerkUserId - Clerk user ID
 * @returns Summary of backfill operation
 */
export async function backfillWatchlistPlayerGames(clerkUserId: string): Promise<BackfillResult> {
  const result: BackfillResult = {
    success: true,
    totalProspects: 0,
    prospectsProcessed: 0,
    prospectsWithGames: 0,
    prospectsWithoutGames: 0,
    totalGamesAdded: 0,
    errors: [],
  };

  try {
    // Get Supabase user ID
    const supabaseUserId = await getSupabaseUserId(clerkUserId);
    if (!supabaseUserId) {
      throw new Error('User not found in Supabase');
    }

    // Get all watchlist prospects for this user (source: 'external' or 'espn')
    const { data: allRankings, error: rankingsError } = await supabaseAdmin
      .from('user_rankings')
      .select(`
        prospect_id,
        rank,
        prospects (
          id,
          full_name,
          position,
          team_name,
          team_id,
          league,
          source
        )
      `)
      .eq('user_id', supabaseUserId);

    if (rankingsError) {
      throw new Error(`Failed to fetch watchlist rankings: ${rankingsError.message}`);
    }

    // Filter to only watchlist prospects (source: 'external' or 'espn')
    const watchlistRankings = (allRankings || []).filter((r: any) => {
      return r.prospects && (r.prospects.source === 'external' || r.prospects.source === 'espn');
    });

    result.totalProspects = watchlistRankings.length;
    console.log(`[backfillWatchlistPlayerGames] Found ${result.totalProspects} watchlist prospects for user ${clerkUserId}`);

    if (watchlistRankings.length === 0) {
      return result;
    }

    // Get all prospect IDs that already have games
    const watchlistProspectIds = watchlistRankings
      .map((r: any) => r.prospects.id)
      .filter(Boolean);

    const { data: existingGames, error: gamesCheckError } = await supabaseAdmin
      .from('prospect_games')
      .select('prospect_id')
      .in('prospect_id', watchlistProspectIds);

    if (gamesCheckError) {
      console.warn(`[backfillWatchlistPlayerGames] Error checking existing games:`, gamesCheckError);
    }

    const prospectsWithGamesSet = new Set(
      (existingGames || []).map((g: any) => g.prospect_id)
    );

    // Process each watchlist prospect
    for (const ranking of watchlistRankings) {
      const prospectData = (ranking as any).prospects;
      if (!prospectData) continue;

      const prospectId = prospectData.id;
      const prospectName = prospectData.full_name || 'Unknown';

      result.prospectsProcessed++;

      // Skip if prospect already has games
      if (prospectsWithGamesSet.has(prospectId)) {
        result.prospectsWithGames++;
        console.log(`[backfillWatchlistPlayerGames] Skipping ${prospectName} - already has games`);
        continue;
      }

      result.prospectsWithoutGames++;
      console.log(`[backfillWatchlistPlayerGames] Processing ${prospectName} (${prospectId}) - no games found`);

      // Resolve team_id if missing
      let teamId = prospectData.team_id;
      const teamName = prospectData.team_name;

      if (!teamId && teamName) {
        console.log(`[backfillWatchlistPlayerGames] Resolving team_id for ${prospectName} (team: ${teamName})`);
        teamId = await resolveTeamIdFromName(teamName);

        if (teamId) {
          // Update prospect with team_id
          const { error: updateError } = await supabaseAdmin
            .from('prospects')
            .update({ team_id: teamId })
            .eq('id', prospectId);

          if (updateError) {
            console.warn(`[backfillWatchlistPlayerGames] Error updating team_id for ${prospectName}:`, updateError);
          } else {
            console.log(`[backfillWatchlistPlayerGames] Updated ${prospectName} with team_id: ${teamId}`);
          }
        } else {
          const errorMsg = `Could not resolve team_id for team: ${teamName}`;
          console.warn(`[backfillWatchlistPlayerGames] ${errorMsg}`);
          result.errors.push({
            prospectId,
            prospectName,
            error: errorMsg,
          });
          continue;
        }
      }

      if (!teamId) {
        const errorMsg = 'No team_id available and team_name is missing';
        console.warn(`[backfillWatchlistPlayerGames] ${errorMsg} for ${prospectName}`);
        result.errors.push({
          prospectId,
          prospectName,
          error: errorMsg,
        });
        continue;
      }

      // Fetch and store games
      try {
        console.log(`[backfillWatchlistPlayerGames] Fetching games for ${prospectName} (team_id: ${teamId})`);
        const scheduleResult = await fetchAndStoreProspectGames(prospectId, teamId);

        if (scheduleResult.success) {
          result.totalGamesAdded += scheduleResult.gamesCount;
          result.prospectsWithGames++;
          console.log(`[backfillWatchlistPlayerGames] Successfully added ${scheduleResult.gamesCount} games for ${prospectName}`);
        } else {
          const errorMsg = scheduleResult.error || 'Unknown error';
          console.warn(`[backfillWatchlistPlayerGames] Failed to fetch games for ${prospectName}:`, errorMsg);
          result.errors.push({
            prospectId,
            prospectName,
            error: errorMsg,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[backfillWatchlistPlayerGames] Error fetching games for ${prospectName}:`, err);
        result.errors.push({
          prospectId,
          prospectName,
          error: errorMsg,
        });
      }
    }

    console.log(`[backfillWatchlistPlayerGames] Backfill complete:`, {
      totalProspects: result.totalProspects,
      prospectsProcessed: result.prospectsProcessed,
      prospectsWithGames: result.prospectsWithGames,
      prospectsWithoutGames: result.prospectsWithoutGames,
      totalGamesAdded: result.totalGamesAdded,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[backfillWatchlistPlayerGames] Fatal error:`, errorMessage);
    result.success = false;
    result.errors.push({
      prospectId: 'unknown',
      prospectName: 'System Error',
      error: errorMessage,
    });
    return result;
  }
}

