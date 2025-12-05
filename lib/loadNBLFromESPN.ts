// NBL (National Basketball League - Australia) schedule loading from ESPN API
// Similar structure to college basketball but uses different endpoint

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

interface NBLEvent {
  id: string;
  date: string;
  name: string;
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
  }>;
}

interface NBLScheduleResponse {
  events?: NBLEvent[];
  team?: {
    id: string;
    displayName: string;
  };
}

// Cache for NBL schedule responses
const nblScheduleCache = new Map<string, { data: NBLScheduleResponse; timestamp: number }>();
const NBL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// NBL team name mappings to ESPN team IDs
const NBL_TEAM_IDS: Map<string, string> = new Map([
  ['Melbourne United', '5'],
  ['melbourne united', '5'],
  ['New Zealand Breakers', '6'],
  ['new zealand breakers', '6'],
  ['Adelaide 36ers', '1'],
  ['adelaide 36ers', '1'],
  ['Brisbane Bullets', '2'],
  ['brisbane bullets', '2'],
  ['Cairns Taipans', '3'],
  ['cairns taipans', '3'],
  ['Illawarra Hawks', '4'],
  ['illawarra hawks', '4'],
  ['Perth Wildcats', '7'],
  ['perth wildcats', '7'],
  ['South East Melbourne Phoenix', '8'],
  ['south east melbourne phoenix', '8'],
  ['southeast melbourne phoenix', '8'],
  ['Sydney Kings', '9'],
  ['sydney kings', '9'],
  ['Tasmania JackJumpers', '10'],
  ['tasmania jackjumpers', '10'],
]);

/**
 * Get NBL team ID from team name
 */
export function getNBLTeamId(teamName: string): string | undefined {
  // Try exact match first
  if (NBL_TEAM_IDS.has(teamName)) {
    return NBL_TEAM_IDS.get(teamName);
  }
  
  // Try case-insensitive match
  const lowerName = teamName.toLowerCase();
  for (const [name, id] of NBL_TEAM_IDS.entries()) {
    if (name.toLowerCase() === lowerName) {
      return id;
    }
  }
  
  // Try partial match
  for (const [name, id] of NBL_TEAM_IDS.entries()) {
    if (lowerName.includes(name.toLowerCase()) || name.toLowerCase().includes(lowerName)) {
      return id;
    }
  }
  
  return undefined;
}

/**
 * Check if a prospect is on an NBL team
 */
export function isNBLProspect(prospect: Prospect): boolean {
  const team = (prospect.teamDisplay || prospect.espnTeamName || prospect.team || '').toLowerCase();
  return team.includes('melbourne') || 
         team.includes('new zealand breakers') ||
         team.includes('adelaide') ||
         team.includes('brisbane') ||
         team.includes('cairns') ||
         team.includes('illawarra') ||
         team.includes('perth') ||
         team.includes('south east melbourne') ||
         team.includes('southeast melbourne') ||
         team.includes('sydney') ||
         team.includes('tasmania');
}

/**
 * Fetch NBL schedule from ESPN API
 */
async function fetchNBLSchedule(teamId: string, season?: string): Promise<NBLScheduleResponse> {
  const cacheKey = `${teamId}_${season || 'current'}`;
  const cached = nblScheduleCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < NBL_CACHE_TTL) {
    return cached.data;
  }
  
  const url = new URL(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nbl/teams/${teamId}/schedule`
  );
  if (season) {
    url.searchParams.set('season', season);
  }
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch NBL schedule for team ${teamId}: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // Cache the response
  nblScheduleCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
  
  return data;
}

/**
 * Convert NBL event to schedule entry (similar to college basketball)
 */
export const convertNBLEventToScheduleEntry = async (
  event: NBLEvent,
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
  
  const competitors = competition.competitors ?? [];
  const homeComp = competitors.find((c) => c.homeAway === 'home');
  const awayComp = competitors.find((c) => c.homeAway === 'away');
  
  if (!homeComp || !awayComp) return null;
  
  const isHome = homeComp.team.id === teamId;
  const isNeutral = Boolean(competition.neutralSite);
  const opponentTeam = isHome ? awayComp.team : homeComp.team;
  const opponentDisplay = opponentTeam.displayName || opponentTeam.name || 'TBD';
  
  // Extract scores for completed games
  const isCompleted = state === 'final' || state === 'post';
  let homeScore: string | undefined;
  let awayScore: string | undefined;
  
  if (isCompleted) {
    const homeScoreRaw = (homeComp as any).score;
    const awayScoreRaw = (awayComp as any).score;
    
    if (homeScoreRaw !== undefined && homeScoreRaw !== null) {
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
  }
  
  // Format time in user's local timezone (NBL times come as UTC)
  const eventDate = new Date(event.date);
  
  // Convert to local timezone and get the date (game might be on different date locally)
  const dateKey = format(eventDate, 'yyyy-MM-dd');
  
  // Format time in user's local timezone (no timezone label)
  const timeStr = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(eventDate);
  
  const isoTime = format(eventDate, 'HH:mm:ss');
  
  // Calculate sort timestamp using local time
  const sortTimestamp = eventDate.getHours() * 60 + eventDate.getMinutes();
  
  // Get TV/broadcast info
  const broadcasts = competition.broadcasts || [];
  const tv = broadcasts.map((b) => b.media?.shortName).filter(Boolean).join(', ') || undefined;
  
  // Get venue
  const venue = competition.venue?.fullName || undefined;
  
  // Determine location type
  const locationType = isNeutral ? 'neutral' : (isHome ? 'home' : 'away');
  
  // Resolve team names
  const resolvedTeam = resolveTeamName(teamDisplay, directory);
  const resolvedOpponent = resolveTeamName(opponentDisplay, directory);
  const simplifiedTeam = simplifyTeamName(resolvedTeam);
  const simplifiedOpponent = simplifyTeamName(resolvedOpponent);
  
  // Determine prospect side
  const prospectIsHome = locationType === 'home' ||
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
  const tipoffTime = `${dateKey}T${isoTime}`;
  const timeKey = sortTimestamp === Number.MAX_SAFE_INTEGER ? 'TBD' : isoTime;
  // NBL (Australian) games - use 'nbl' as league identifier to prevent collision with international teams
  const key = buildGameKey(dateKey, timeKey, homeTeamName, awayTeamName, venue, 'nbl');
  
  // Look up team entries for logos
  const homeTeamEntry = findTeamEntryInDirectory(directory, homeTeamName);
  const awayTeamEntry = findTeamEntryInDirectory(directory, awayTeamName);
  
  // Create team info objects
  const homeTeamInfo = await createTeamInfo(homeTeamName, homeTeamEntry);
  const awayTeamInfo = await createTeamInfo(awayTeamName, awayTeamEntry);
  
  // Extract logos from NBL API (ESPN endpoint for NBL)
  if (homeComp.team.logos && homeComp.team.logos.length > 0) {
    homeTeamInfo.logo = homeComp.team.logos[0].href;
  }
  if (awayComp.team.logos && awayComp.team.logos.length > 0) {
    awayTeamInfo.logo = awayComp.team.logos[0].href;
  }
  
  // Add scores for completed games
  if (isCompleted) {
    if (homeScore) {
      homeTeamInfo.score = homeScore;
    }
    if (awayScore) {
      awayTeamInfo.score = awayScore;
    }
  }
  
  const game: AggregatedGameInternal = {
    id: `${dateKey}-${homeTeamName}-vs-${awayTeamName}`,
    date: tipoffTime,
    homeTeam: homeTeamInfo,
    awayTeam: awayTeamInfo,
    status: state === 'final' || state === 'post' ? 'FINAL' : 'SCHEDULED',
    venue,
    prospects: [],
    homeProspects: [],
    awayProspects: [],
    tipoff: timeStr,
    tv,
    note: undefined,
    highlight: undefined,
    dateKey,
    locationType,
    sortTimestamp: sortTimestamp === Number.MAX_SAFE_INTEGER ? null : sortTimestamp,
    _prospectRanks: new Set<number>(),
    _homeProspectRanks: new Set<number>(),
    _awayProspectRanks: new Set<number>(),
  };
  
  // Check injury status for this game
  try {
    const injuryStatus = await getInjuryStatusForGame(prospect, event.id, dateKey);
    if (injuryStatus) {
      prospect.injuryStatus = injuryStatus;
      console.log(`[NBL API] ✓ Set injury status for "${prospect.name}" in game ${event.id}: ${injuryStatus}`);
    }
  } catch (error) {
    console.warn(`[NBL API] Failed to check injury status for ${prospect.name} in game ${event.id}:`, error);
  }
  
  return {
    key,
    game,
    prospect,
    prospectSide: prospectIsHome ? 'home' : 'away',
  };
};

/**
 * Fetch and convert all NBL schedule entries for a prospect
 */
export const fetchNBLProspectSchedule = async (
  prospect: Prospect,
  teamId: string,
  teamDisplay: string,
  directory: Map<string, TeamDirectoryEntry>,
  season?: string
): Promise<ParsedScheduleEntry[]> => {
  try {
    const scheduleData = await fetchNBLSchedule(teamId, season);
    const events = (scheduleData.events ?? [])
      .filter((event) => {
        const state = event.competitions?.[0]?.status?.type?.state;
        return state === 'pre' || state === 'in' || state === 'post' || state === 'final';
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    
    const entries: ParsedScheduleEntry[] = [];
    
    for (const event of events) {
      try {
        const entry = await convertNBLEventToScheduleEntry(
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
        console.error(`[NBL API] Failed to convert event ${event.id} for ${prospect.name}:`, error);
      }
    }
    
    return entries;
  } catch (error) {
    console.error(`[NBL API] Failed to fetch schedule for ${prospect.name} (team ${teamId}):`, error);
    return [];
  }
};

