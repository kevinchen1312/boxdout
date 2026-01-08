import { format } from 'date-fns';
import type { Prospect } from '@/app/types/prospect';
import type {
  ParsedScheduleEntry,
  AggregatedGameInternal,
  TeamDirectoryEntry,
} from './loadSchedules';
import {
  buildGameKey,
  sanitizeKey,
  simplifyTeamName,
  resolveTeamName,
  findTeamEntryInDirectory,
  createTeamInfo,
} from './loadSchedules';
import { getInjuryStatusForGame } from './detectInjuries';

interface ESPNEvent {
  id: string;
  date: string;
  competitions?: Array<{
    id: string;
    date: string;
    status: {
      type: {
        id: string;
        name: string;
        state: string;
        completed: boolean;
        description: string;
        detail: string;
        shortDetail: string;
      };
      displayClock?: string;
      period?: number;
    };
    competitors?: Array<{
      id: string;
      uid: string;
      homeAway: 'home' | 'away';
      score?: string | number;
      winner?: boolean;
      team: {
        id: string;
        uid: string;
        location: string;
        name: string;
        displayName: string;
        shortDisplayName: string;
        abbreviation: string;
        logos?: Array<{ href: string }>;
      };
    }>;
    broadcasts?: Array<{
      media: {
        shortName: string;
      };
      names?: string[];
    }>;
    venue?: {
      fullName: string;
      address?: {
        city?: string;
        state?: string;
      };
    };
    neutralSite?: boolean;
    notes?: Array<{
      type: string;
      headline: string;
    }>;
  }>;
}

interface ESPNScheduleResponse {
  events?: ESPNEvent[];
}

// Cache for ESPN schedule responses (per team, cleared on each build)
const scheduleResponseCache = new Map<string, { data: ESPNScheduleResponse; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Clear schedule cache (called when schedules are rebuilt)
export function clearESPNScheduleCache() {
  scheduleResponseCache.clear();
}

// Format time from ESPN API response
const formatTimeFromESPN = (eventDate: string, status?: { type?: { state?: string; name?: string; description?: string; shortDetail?: string } }): { timeStr: string; sortTimestamp: number | null; isoTime: string; status: string } => {
  const date = new Date(eventDate);
  
  // Check game state
  const state = status?.type?.state;
  
  // For live/in-progress games, show "LIVE" but keep original scheduled time for sorting
  if (state === 'in') {
    // Use the original scheduled time from event date (convert to ET) for sorting
    const etDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hours = etDate.getHours();
    const minutes = etDate.getMinutes();
    const sortTimestamp = hours * 60 + minutes;
    const isoTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    
    // Show "LIVE" instead of time
    return {
      timeStr: 'LIVE',
      sortTimestamp, // Keep original time for sorting (don't move to bottom)
      isoTime,
      status: 'LIVE',
    };
  }
  
  // Check if game is completed
  if (state === 'final' || state === 'post') {
    // Use the original scheduled time from event date (convert to ET)
    const etDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const timeStr = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    }).format(date);
    
    const hours = etDate.getHours();
    const minutes = etDate.getMinutes();
    const sortTimestamp = hours * 60 + minutes;
    const isoTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    
    return {
      timeStr: `${timeStr} ET`,
      sortTimestamp,
      isoTime,
      status: 'COMPLETED',
    };
  }
  
  // For future games, use the status shortDetail
  const shortDetail = status?.type?.shortDetail ?? '';
  if (!shortDetail || shortDetail.toLowerCase().includes('tbd') || shortDetail.toLowerCase().includes('tba')) {
    return {
      timeStr: 'TBD',
      sortTimestamp: Number.MAX_SAFE_INTEGER,
      isoTime: '00:00:00',
      status: 'TIME_TBD',
    };
  }
  
  // Parse time from shortDetail (format: "Nov 12, 2025 - 7:00 PM ET")
  const pieces = shortDetail.split('-');
  const timePart = pieces.length > 1 ? pieces[1].trim() : shortDetail.trim();
  let timeStr = timePart.replace('EST', 'ET').replace('EDT', 'ET');
  
  // Try to parse the time
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (timeMatch) {
    let hours = Number.parseInt(timeMatch[1], 10);
    const minutes = Number.parseInt(timeMatch[2], 10);
    const period = timeMatch[3].toUpperCase();
    
    if (period === 'PM' && hours !== 12) hours += 12;
    else if (period === 'AM' && hours === 12) hours = 0;
    
    const sortTimestamp = hours * 60 + minutes;
    const isoTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    
    // Ensure ET suffix is present
    if (!timeStr.toUpperCase().includes('ET')) {
      timeStr = `${timeStr} ET`;
    }
    
    return {
      timeStr,
      sortTimestamp,
      isoTime,
      status: 'SCHEDULED',
    };
  }
  
  return {
    timeStr: 'TBD',
    sortTimestamp: Number.MAX_SAFE_INTEGER,
    isoTime: '00:00:00',
    status: 'TIME_TBD',
  };
};

// Format date from ESPN API ISO string
// IMPORTANT: Use Eastern Time to determine the calendar date, not UTC or server local time
// This ensures games at 9pm ET don't get placed on the next day's calendar (which would happen in UTC)
const formatDateFromESPN = (isoString: string): { date: Date; dateKey: string } => {
  const date = new Date(isoString);
  
  // Convert to Eastern Time to get the correct calendar date
  // This is the reference timezone for US sports scheduling
  const etDateString = date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  // en-CA locale gives us YYYY-MM-DD format directly
  const dateKey = etDateString;
  
  return { date, dateKey };
};

// Fetch schedule from ESPN API (with caching)
export const fetchScheduleFromESPN = async (
  teamId: string,
  season?: string
): Promise<ESPNScheduleResponse> => {
  const cacheKey = `${teamId}-${season || 'default'}`;
  const cached = scheduleResponseCache.get(cacheKey);
  
  // Check if cache is still valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[ESPN API] Using cached schedule for team ${teamId}`);
    return cached.data;
  }
  
  const url = new URL(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}/schedule`
  );
  
  if (season) {
    url.searchParams.set('season', season);
  }
  
  console.log(`[ESPN API] Fetching schedule for team ${teamId}...`);
  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    next: { revalidate: 300 }, // Cache for 5 minutes
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch schedule for team ${teamId}: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // Cache the response
  scheduleResponseCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
  
  return data;
};

// Convert ESPN API event to ParsedScheduleEntry
export const convertESPNEventToScheduleEntry = async (
  event: ESPNEvent,
  prospect: Prospect,
  teamId: string,
  teamDisplay: string,
  directory: Map<string, TeamDirectoryEntry>
): Promise<ParsedScheduleEntry | null> => {
  const competition = event.competitions?.[0];
  if (!competition) return null;
  
  // Filter out games that aren't scheduled yet or are invalid
  const state = competition.status?.type?.state;
  if (!state || !['pre', 'in', 'post', 'final'].includes(state)) {
    return null;
  }
  
  // Log state for debugging
  console.log(`[ESPN API] Game state: ${state} for ${event.competitions?.[0]?.competitors?.[0]?.team?.displayName} vs ${event.competitions?.[0]?.competitors?.[1]?.team?.displayName}`);
  
  const competitors = competition.competitors ?? [];
  const homeComp = competitors.find((c) => c.homeAway === 'home');
  const awayComp = competitors.find((c) => c.homeAway === 'away');
  
  if (!homeComp || !awayComp) return null;
  
  const isHome = homeComp.team.id === teamId;
  const isNeutral = Boolean(competition.neutralSite);
  const opponentTeam = isHome ? awayComp.team : homeComp.team;
  const opponentDisplay = opponentTeam.displayName || opponentTeam.name || 'TBD';
  
  // Extract scores for completed games and live games
  const isCompleted = state === 'final' || state === 'post';
  const isLive = state === 'in';
  
  // ESPN API may return score in different formats - check multiple possible locations
  let homeScore: string | undefined;
  let awayScore: string | undefined;
  
  if (isCompleted || isLive) {
    // Check direct score field (could be number or string)
    // ESPN API structure: competitor.score or competitor.score?.displayValue
    const homeScoreRaw = (homeComp as any).score;
    const awayScoreRaw = (awayComp as any).score;
    
    if (homeScoreRaw !== undefined && homeScoreRaw !== null) {
      // Handle both string and number, and nested objects
      if (typeof homeScoreRaw === 'object' && homeScoreRaw.displayValue) {
        homeScore = String(homeScoreRaw.displayValue);
      } else {
        homeScore = String(homeScoreRaw);
      }
    }
    
    if (awayScoreRaw !== undefined && awayScoreRaw !== null) {
      if (typeof awayScoreRaw === 'object' && awayScoreRaw.displayValue) {
        awayScore = String(awayScoreRaw.displayValue);
      } else {
        awayScore = String(awayScoreRaw);
      }
    }
    
    // Also check for score in status detail (ESPN sometimes includes it there)
    // Format examples: "Final - 75-68", "Final", "Team1 75, Team2 68"
    // NOTE: DO NOT parse game clocks like "6:51 - 2nd Half" as scores!
    // Only use this fallback if BOTH scores are missing (not just one)
    if (!homeScore && !awayScore) {
      const statusDetail = competition.status?.type?.detail || competition.status?.type?.shortDetail || '';
      
      // Skip if this looks like a live game status with a clock
      const isGameClock = /\d{1,2}:\d{2}/.test(statusDetail);
      
      if (!isGameClock && isCompleted) {
        // Only parse for completed games, not live games
        // Look for patterns like "75-68", "75, 68" in completed game status
        // Match 2-3 digit numbers separated by dash, comma, or space
        const scoreMatch = statusDetail.match(/\b(\d{2,3})[\s,-]+(\d{2,3})\b/);
        
        if (scoreMatch) {
          const score1 = scoreMatch[1];
          const score2 = scoreMatch[2];
          // ESPN typically lists scores as "Away-Home" or "Away, Home"
          // Check if status detail mentions team names to determine order
          const awayTeamInDetail = statusDetail.toLowerCase().includes(awayComp.team.displayName.toLowerCase().split(' ')[0]);
          const homeTeamInDetail = statusDetail.toLowerCase().includes(homeComp.team.displayName.toLowerCase().split(' ')[0]);
          
          if (awayTeamInDetail && !homeTeamInDetail) {
            // Away team mentioned first, so first score is away
            awayScore = score1;
            homeScore = score2;
          } else {
            // Default: assume away score first, home score second
            awayScore = score1;
            homeScore = score2;
          }
        }
      }
    }
    
    // Debug logging to see what we're getting from ESPN API (always log, not just dev)
    console.log(`\n[ESPN API] ========== PROCESSING GAME ==========`);
    console.log(`[ESPN API] Game: ${awayComp.team.displayName} @ ${homeComp.team.displayName}`);
    console.log(`[ESPN API] State: ${state}, isCompleted: ${isCompleted}, isLive: ${isLive}`);
    console.log(`[ESPN API] homeComp object keys:`, Object.keys(homeComp || {}));
    console.log(`[ESPN API] homeComp.score raw:`, JSON.stringify(homeScoreRaw));
    console.log(`[ESPN API] awayComp.score raw:`, JSON.stringify(awayScoreRaw));
    console.log(`[ESPN API] homeComp.score type:`, typeof homeScoreRaw);
    console.log(`[ESPN API] awayComp.score type:`, typeof awayScoreRaw);
    console.log(`[ESPN API] Extracted scores - home: '${homeScore}', away: '${awayScore}'`);
    console.log(`[ESPN API] Status detail:`, competition.status?.type?.detail);
    console.log(`[ESPN API] Status shortDetail:`, competition.status?.type?.shortDetail);
    if (!homeScore || !awayScore) {
      console.log(`[ESPN API] ⚠️  Missing scores! Full homeComp:`, JSON.stringify(homeComp, null, 2).substring(0, 800));
      console.log(`[ESPN API] ⚠️  Missing scores! Full awayComp:`, JSON.stringify(awayComp, null, 2).substring(0, 800));
    }
    console.log(`[ESPN API] ==========================================\n`);
  }
  
  // Format date
  const { date, dateKey } = formatDateFromESPN(event.date);
  
  // Check if game is today (for live game display)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const gameDate = new Date(date);
  gameDate.setHours(0, 0, 0, 0);
  const isToday = gameDate.getTime() === today.getTime();
  
  // Format time
  const { timeStr, sortTimestamp, isoTime, status: timeStatus } = formatTimeFromESPN(event.date, competition.status);
  
  // For live games on current day only, show box score instead of just "LIVE"
  // Note: Scores are already set in homeTeamInfo.score and awayTeamInfo.score below
  // The tipoff field should show the time, not the score - scores are displayed separately
  let displayTime = timeStr;
  if (isToday && timeStatus === 'LIVE' && !homeScore && !awayScore) {
    displayTime = 'LIVE'; // Show LIVE if no score yet (today only)
  }
  // Don't override displayTime with scores - scores are shown via team.score properties
  
  // Capture live game status details (clock, period, status detail)
  let gameClock: string | undefined;
  let gamePeriod: number | undefined;
  let gameStatusDetail: string | undefined;
  
  if (isLive || isCompleted) {
    gameClock = competition.status?.displayClock;
    gamePeriod = competition.status?.period;
    gameStatusDetail = competition.status?.type?.detail || competition.status?.type?.shortDetail;
  }
  
  // Get TV/broadcast info
  const tvNames = (competition.broadcasts ?? [])
    .map((b) => b.media?.shortName || b.names?.[0])
    .filter(Boolean);
  const tv = tvNames.length > 0 ? Array.from(new Set(tvNames)).join(' / ') : undefined;
  
  // Get venue info
  const venueParts: string[] = [];
  if (competition.venue?.fullName) {
    venueParts.push(competition.venue.fullName);
  }
  if (competition.venue?.address?.city && competition.venue?.address?.state) {
    venueParts.push(`${competition.venue.address.city}, ${competition.venue.address.state}`);
  } else if (competition.venue?.address?.city) {
    venueParts.push(competition.venue.address.city);
  }
  const venue = venueParts.length > 0 ? venueParts.join(' • ') : undefined;
  
  // Get event note
  const note = competition.notes?.find((n) => n.type === 'event')?.headline;
  
  // Determine location type
  const prefix = isNeutral ? 'vs' : isHome ? 'vs' : 'at';
  const locationType = isNeutral ? 'neutral' : isHome ? 'home' : 'away';
  
  // Resolve team names
  const resolvedTeam = resolveTeamName(teamDisplay, directory);
  const resolvedOpponent = resolveTeamName(opponentDisplay, directory);
  const simplifiedTeam = simplifyTeamName(resolvedTeam);
  const simplifiedOpponent = simplifyTeamName(resolvedOpponent);
  
  // Determine prospect side
  const prospectIsHome =
    locationType === 'home' ||
    (locationType === 'neutral' && sanitizeKey(resolvedTeam) <= sanitizeKey(resolvedOpponent));
  
  // Determine home/away team names
  let homeTeamName: string;
  let awayTeamName: string;
  
  if (locationType === 'away') {
    homeTeamName = simplifiedOpponent;
    awayTeamName = simplifiedTeam;
  } else if (locationType === 'home') {
    homeTeamName = simplifiedTeam;
    awayTeamName = simplifiedOpponent;
  } else {
    const sortedTeams = [simplifiedTeam, simplifiedOpponent].sort((a, b) => a.localeCompare(b));
    homeTeamName = sortedTeams[0];
    awayTeamName = sortedTeams[1];
  }
  
  // Build game key
  // Use full ISO timestamp for proper client-side sorting
  // event.date from ESPN is already in UTC format (e.g., "2025-12-13T17:00:00Z")
  const eventDate = new Date(event.date);
  const tipoffTime = eventDate.toISOString(); // Full UTC ISO timestamp
  const timeKey = sortTimestamp === Number.MAX_SAFE_INTEGER ? 'TBD' : isoTime;
  // ESPN college games - use 'ncaa' as league identifier
  const key = buildGameKey(dateKey, timeKey, homeTeamName, awayTeamName, venue, 'ncaa');
  
  // Look up team entries for logos
  const homeTeamEntry = findTeamEntryInDirectory(directory, homeTeamName);
  const awayTeamEntry = findTeamEntryInDirectory(directory, awayTeamName);
  
  // Create team info objects
  const homeTeamInfo = await createTeamInfo(homeTeamName, homeTeamEntry);
  const awayTeamInfo = await createTeamInfo(awayTeamName, awayTeamEntry);
  
  // Extract logos from ESPN API (more reliable than directory lookups)
  if (homeComp.team.logos && homeComp.team.logos.length > 0) {
    homeTeamInfo.logo = homeComp.team.logos[0].href;
  }
  if (awayComp.team.logos && awayComp.team.logos.length > 0) {
    awayTeamInfo.logo = awayComp.team.logos[0].href;
  }
  
  // Add scores for completed games and live games
  if (isCompleted || isLive) {
    if (homeScore) {
      homeTeamInfo.score = homeScore;
    }
    if (awayScore) {
      awayTeamInfo.score = awayScore;
    }
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ESPN API] Game ${homeTeamName} vs ${awayTeamName}: homeScore=${homeScore}, awayScore=${awayScore}, isCompleted=${isCompleted}, isLive=${isLive}, state=${state}`);
    }
  }
  
  // Determine game status
  let gameStatus: string;
  if (isToday && isLive) {
    gameStatus = 'LIVE';
  } else if (isCompleted) {
    gameStatus = 'COMPLETED';
  } else if (timeStatus === 'TIME_TBD') {
    gameStatus = 'TIME_TBD';
  } else {
    gameStatus = 'SCHEDULED';
  }
  
  const game: AggregatedGameInternal = {
    id: `${dateKey}-${homeTeamName}-vs-${awayTeamName}`,
    date: tipoffTime,
    homeTeam: homeTeamInfo,
    awayTeam: awayTeamInfo,
    status: gameStatus,
    venue,
    prospects: [],
    homeProspects: [],
    awayProspects: [],
    tipoff: displayTime,
    tv,
    note,
    highlight: undefined,
    dateKey,
    locationType,
    sortTimestamp: sortTimestamp === Number.MAX_SAFE_INTEGER ? null : sortTimestamp,
    // Live game status
    clock: gameClock,
    period: gamePeriod,
    statusDetail: gameStatusDetail,
    // ESPN game ID for fetching live details
    espnId: event.id,
    _prospectRanks: new Set<number>(),
    _homeProspectRanks: new Set<number>(),
    _awayProspectRanks: new Set<number>(),
  };
  
  // Check injury status for this specific game
  // This will check manual injuries and for completed games, check box scores
  try {
    const injuryStatus = await getInjuryStatusForGame(prospect, event.id, dateKey);
    if (injuryStatus) {
      // Set injury status on prospect for this game
      prospect.injuryStatus = injuryStatus;
      console.log(`[ESPN API] ✓ Set injury status for "${prospect.name}" in game ${event.id}: ${injuryStatus}`);
    } else if (prospect.injuryStatus) {
      // Log if prospect already has injury status
      console.log(`[ESPN API] Prospect "${prospect.name}" already has injury status: ${prospect.injuryStatus}`);
    }
  } catch (error) {
    // Don't fail the whole game if injury check fails
    console.warn(`[ESPN API] Failed to check injury status for ${prospect.name} in game ${event.id}:`, error);
  }
  
  return {
    key,
    game,
    prospect,
    prospectSide: prospectIsHome ? 'home' : 'away',
  };
};

// Fetch and convert all schedule entries for a prospect
export const fetchProspectScheduleFromESPN = async (
  prospect: Prospect,
  teamId: string,
  teamDisplay: string,
  directory: Map<string, TeamDirectoryEntry>,
  season?: string
): Promise<ParsedScheduleEntry[]> => {
  try {
    const scheduleData = await fetchScheduleFromESPN(teamId, season);
    const events = (scheduleData.events ?? [])
      .filter((event) => {
        const state = event.competitions?.[0]?.status?.type?.state;
        return state === 'pre' || state === 'in' || state === 'post' || state === 'final';
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    
    const entries: ParsedScheduleEntry[] = [];
    
    for (const event of events) {
      try {
        const entry = await convertESPNEventToScheduleEntry(
          event,
          prospect,
          teamId,
          teamDisplay,
          directory
        );
        if (entry) {
          entries.push(entry);
        }
      } catch (error) {
        // Log error but continue processing other games - don't let one bad game stop everything
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[ESPN API] Failed to convert event ${event.id} for ${prospect.name}: ${errorMessage}`);
        // Continue to next game instead of throwing
      }
    }
    
    return entries;
  } catch (error) {
    console.error(`[ESPN API] Failed to fetch schedule for ${prospect.name} (team ${teamId}):`, error);
    return [];
  }
};

