import fs from 'fs';
import path from 'path';
import { parse, format } from 'date-fns';
import type { Prospect } from '@/app/types/prospect';
import type { GameWithProspects, TeamInfo } from '@/app/utils/gameMatching';
import { getProspectsByRank } from './loadProspects';

interface ParsedScheduleEntry {
  key: string;
  game: AggregatedGameInternal;
  prospect: Prospect;
  prospectSide: 'home' | 'away';
}

interface AggregatedGameInternal extends GameWithProspects {
  sortTimestamp: number | null;
  _prospectRanks: Set<number>;
  _homeProspectRanks: Set<number>;
  _awayProspectRanks: Set<number>;
}

interface LoadedSchedules {
  gamesByDate: Record<string, GameWithProspects[]>;
  allGames: GameWithProspects[];
}

const SCHEDULE_SUFFIX = '_schedule.txt';
const DATE_FORMAT = 'MMM d, yyyy';

const NEUTRAL_NOTE_KEYWORDS = [
  'classic',
  'championship',
  'invitational',
  'battle',
  'series',
  'showdown',
  'shootout',
  'tournament',
  'tip-off',
  'tipoff',
  'festival',
  'showcase',
  'hall of fame',
  'duel',
  'legacy',
  'matchup',
  'hoops',
  'players era',
  'orange bowl',
  'memorial',
  'hoophall',
  'event',
];

const NON_NEUTRAL_NOTE_KEYWORDS = ['flex game'];

let cachedSchedules: LoadedSchedules | null = null;
let buildPromise: Promise<LoadedSchedules> | null = null;
let cacheTimestamp: number | null = null;

// Function to clear the cache and force reload
export const clearScheduleCache = () => {
  cachedSchedules = null;
  buildPromise = null;
  cacheTimestamp = null;
};

// Check if any schedule file has been modified since cache was created
const shouldInvalidateCache = (): boolean => {
  if (!cacheTimestamp) return false;
  
  const rootDir = process.cwd();
  const files = fs.readdirSync(rootDir).filter((file) => file.endsWith(SCHEDULE_SUFFIX));
  
  for (const file of files) {
    const filePath = path.join(rootDir, file);
    try {
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs > cacheTimestamp) {
        return true;
      }
    } catch {
      // File might have been deleted, invalidate cache
      return true;
    }
  }
  
  return false;
};

type TeamDirectoryEntry = {
  id: string;
  displayName: string;
  shortDisplayName?: string;
  name?: string;
  nickname?: string;
  location?: string;
  slug?: string;
  logo?: string;
};

let teamDirectoryCache: Map<string, TeamDirectoryEntry> | null = null;
const jerseyCache = new Map<string, Map<string, string>>();
const scoreboardCache = new Map<string, any[]>();
const SCOREBOARD_GROUPS = '50';

const sanitizeKey = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildGameKey = (
  dateKey: string,
  timeKey: string,
  teamA: string,
  teamB: string,
  venue?: string
): string => {
  const teams = [sanitizeKey(teamA), sanitizeKey(teamB)]
    .sort()
    .join('__');
  const venueKey = venue ? sanitizeKey(venue) : 'no-venue';
  const tipoffKey = timeKey || 'tbd';
  return `${dateKey}__${tipoffKey}__${teams}__${venueKey}`;
};

const createTeamInfo = (displayName: string, teamEntry?: TeamDirectoryEntry): TeamInfo => ({
  name: displayName,
  displayName,
  logo: teamEntry?.logo,
});

const simplifyTeamName = (value: string): string => {
  return value.trim();
};
const normalizeForLookup = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const createNameVariants = (value: string): string[] => {
  const base = normalizeForLookup(value);
  const variants = new Set<string>([base]);
  const suffixes = ['jr', 'sr', 'ii', 'iii', 'iv', 'v'];

  for (const suffix of suffixes) {
    if (base.endsWith(suffix)) {
      variants.add(base.slice(0, base.length - suffix.length));
    }
  }

  return Array.from(variants).filter(Boolean);
};

const addTeamKeys = (
  map: Map<string, TeamDirectoryEntry>,
  entry: TeamDirectoryEntry,
  values: Array<string | undefined>
) => {
  for (const value of values) {
    if (!value) continue;
    const normalizedValue = value.replace(/-/g, ' ');
    const key = normalizeForLookup(normalizedValue);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, entry);
    }
  }
};

const TEAM_DIRECTORY_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?groups=50&limit=500';

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

    // Extract logo URL from ESPN API response
    let logoUrl: string | undefined;
    if (team.logos && team.logos.length > 0) {
      // Use the first logo (usually the primary logo)
      logoUrl = team.logos[0].href;
    } else if (team.logo) {
      logoUrl = team.logo;
    } else {
      // Fallback: construct logo URL from team ID
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

    addTeamKeys(directory, entry, [
      entry.displayName,
      entry.shortDisplayName,
      entry.slug,
      `${entry.location} ${entry.name}`,
      `${entry.location} ${entry.nickname}`,
      `${entry.shortDisplayName} ${entry.name}`,
    ]);
  }

  teamDirectoryCache = directory;
  return directory;
};

const findTeamEntryInDirectory = (
  directory: Map<string, TeamDirectoryEntry>,
  teamName: string
): TeamDirectoryEntry | undefined => {
  const normalized = normalizeForLookup(teamName);
  if (!normalized) return undefined;

  if (directory.has(normalized)) {
    return directory.get(normalized);
  }

  for (const [key, entry] of directory.entries()) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return entry;
    }
  }

  return undefined;
};

const findTeamEntry = async (teamName: string): Promise<TeamDirectoryEntry | undefined> => {
  const directory = await getTeamDirectory();
  return findTeamEntryInDirectory(directory, teamName);
};

const getRosterForTeam = async (teamId: string): Promise<Map<string, string>> => {
  if (jerseyCache.has(teamId)) {
    return jerseyCache.get(teamId)!;
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}?lang=en&region=us&season=2026&enable=roster`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    jerseyCache.set(teamId, new Map());
    return jerseyCache.get(teamId)!;
  }

  const data = await response.json();
  const athletes: any[] = data?.team?.athletes ?? [];

  const rosterMap = new Map<string, string>();

  for (const athlete of athletes) {
    const fullName: string | undefined = athlete?.fullName ?? athlete?.displayName;
    const jersey: string | number | undefined = athlete?.jersey ?? athlete?.uniform;
    if (!fullName || jersey == null) continue;

    const variants = createNameVariants(fullName);
    for (const variant of variants) {
      if (!rosterMap.has(variant)) {
        rosterMap.set(variant, String(jersey));
      }
    }
  }

  jerseyCache.set(teamId, rosterMap);
  return rosterMap;
};
const parseHeader = (headerLine: string): { name: string; teamDisplay: string } | null => {
  const match = headerLine.match(/^(.*?)\s+2025-26\s+(.*?)\s+Schedule$/);
  if (!match) return null;

  const name = match[1].trim();
  const teamDisplay = match[2].trim();

  return { name, teamDisplay };
};

const parseRank = (line: string): number | null => {
  const match = line.match(/Rank:\s*#(\d+)/i);
  if (!match) return null;
  const rank = Number.parseInt(match[1], 10);
  return Number.isNaN(rank) ? null : rank;
};

const cleanOpponentName = (raw: string): string => raw.replace(/\*+$/, '').trim();

const isNeutralFromNote = (note?: string): boolean => {
  if (!note) return false;
  const lowered = note.toLowerCase();
  if (NON_NEUTRAL_NOTE_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
    return false;
  }
  return NEUTRAL_NOTE_KEYWORDS.some((keyword) => lowered.includes(keyword));
};

const parseTime = (timeLabel: string): { sortTimestamp: number | null; isoTime: string; status: string } => {
  const trimmed = timeLabel.trim();
  if (/^tb[ad]/i.test(trimmed)) {
    return {
      sortTimestamp: Number.MAX_SAFE_INTEGER,
      isoTime: '00:00:00',
      status: 'TIME_TBD',
    };
  }

  const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!timeMatch) {
    return {
      sortTimestamp: Number.MAX_SAFE_INTEGER,
      isoTime: '00:00:00',
      status: 'TIME_TBD',
    };
  }

  let hours = Number.parseInt(timeMatch[1], 10);
  const minutes = Number.parseInt(timeMatch[2], 10);
  const period = timeMatch[3].toUpperCase();

  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  const isoTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  const sortTimestamp = hours * 60 + minutes;

  return {
    sortTimestamp,
    isoTime,
    status: 'SCHEDULED',
  };
};

const parseTvVenueNote = (
  segment: string
): { tv?: string; venue?: string; note?: string } => {
  if (!segment) return {};

  let working = segment.trim();

  let note: string | undefined;
  const noteStart = working.indexOf('[');
  if (noteStart >= 0 && working.includes(']')) {
    const noteEnd = working.lastIndexOf(']');
    note = working.slice(noteStart + 1, noteEnd).trim();
    working = working.slice(0, noteStart).trim();
  }

  let tv: string | undefined;
  let venue: string | undefined;

  const parseTvAndVenue = (input: string) => {
    const venueStart = input.indexOf('(');
    if (venueStart >= 0 && input.includes(')')) {
      const venueEnd = input.lastIndexOf(')');
      const venueCandidate = input.slice(venueStart + 1, venueEnd).trim();
      const tvCandidate = input.slice(0, venueStart).trim();
      return { tvCandidate, venueCandidate };
    }
    return { tvCandidate: input.trim(), venueCandidate: undefined };
  };

  if (!working.toUpperCase().startsWith('TV:')) {
    const { tvCandidate, venueCandidate } = parseTvAndVenue(working);
    if (tvCandidate) {
      tv = tvCandidate;
    }
    if (venueCandidate) {
      venue = venueCandidate;
    }
  } else {
    working = working.slice(3).trim();
    if (working.startsWith(':')) {
      working = working.slice(1).trim();
    }

    const { tvCandidate, venueCandidate } = parseTvAndVenue(working);
    if (tvCandidate) {
      tv = tvCandidate;
    }
    if (venueCandidate) {
      venue = venueCandidate;
    }
  }

  return {
    tv: tv && tv.length > 0 ? tv : undefined,
    venue: venue && venue.length > 0 ? venue : undefined,
    note,
  };
};

const determineLocationType = (
  prefix: 'vs' | 'at',
  note?: string
): 'home' | 'away' | 'neutral' => {
  if (prefix === 'at') {
    return 'away';
  }

  if (note && isNeutralFromNote(note)) {
    return 'neutral';
  }

  return 'home';
};

const resolveTeamName = (
  rawName: string,
  directory: Map<string, TeamDirectoryEntry>
): string => {
  const entry = findTeamEntryInDirectory(directory, rawName);
  if (entry) {
    return (
      entry.location ||
      entry.shortDisplayName ||
      entry.displayName ||
      rawName.trim()
    );
  }
  return rawName.trim();
};

const parseLine = (
  line: string,
  teamDisplay: string,
  prospect: Prospect,
  directory: Map<string, TeamDirectoryEntry>
): ParsedScheduleEntry | null => {
  if (!line.includes(' — ')) return null;

  const segments = line.split(' — ').map((segment) => segment.trim());
  if (segments.length < 3) return null;

  const [dateLabel, matchupSegment, timeSegment, ...rest] = segments;
  const date = parse(dateLabel, DATE_FORMAT, new Date());
  if (Number.isNaN(date.getTime())) return null;
  const dateKey = format(date, 'yyyy-MM-dd');

  const matchupMatch = matchupSegment.match(/^(vs|at)\s+(.*)$/i);
  if (!matchupMatch) return null;
  const prefix = matchupMatch[1].toLowerCase() as 'vs' | 'at';
  const opponentDisplay = cleanOpponentName(matchupMatch[2]);
  const resolvedTeam = resolveTeamName(teamDisplay, directory);
  const resolvedOpponent = resolveTeamName(opponentDisplay, directory);
  const simplifiedTeam = simplifyTeamName(resolvedTeam);
  const simplifiedOpponent = simplifyTeamName(resolvedOpponent);

  const { sortTimestamp, isoTime, status } = parseTime(timeSegment);

  const extraSegment = rest.join(' — ');
  const { tv, venue, note } = parseTvVenueNote(extraSegment);

  const locationType = determineLocationType(prefix, note);

  const prospectIsHome =
    locationType === 'home' ||
    (locationType === 'neutral' &&
      sanitizeKey(resolvedTeam) <= sanitizeKey(resolvedOpponent));

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

  const tipoffTime = `${dateKey}T${isoTime}`;
  const timeKey = sortTimestamp === Number.MAX_SAFE_INTEGER ? 'TBD' : isoTime;
  const key = buildGameKey(dateKey, timeKey, homeTeamName, awayTeamName, venue);

  // Look up team entries in directory to get logos
  const homeTeamEntry = findTeamEntryInDirectory(directory, homeTeamName);
  const awayTeamEntry = findTeamEntryInDirectory(directory, awayTeamName);

  const game: AggregatedGameInternal = {
    id: `${dateKey}-${homeTeamName}-vs-${awayTeamName}`,
    date: tipoffTime,
    homeTeam: createTeamInfo(homeTeamName, homeTeamEntry),
    awayTeam: createTeamInfo(awayTeamName, awayTeamEntry),
    status,
    venue,
    prospects: [],
    homeProspects: [],
    awayProspects: [],
    tipoff: timeSegment,
    tv,
    note,
    highlight: undefined,
    dateKey,
    locationType,
    sortTimestamp: sortTimestamp === Number.MAX_SAFE_INTEGER ? null : sortTimestamp,
    _prospectRanks: new Set<number>(),
    _homeProspectRanks: new Set<number>(),
    _awayProspectRanks: new Set<number>(),
  };

  return {
    key,
    game,
    prospect,
    prospectSide: prospectIsHome ? 'home' : 'away',
  };
};

const mergeProspectIntoGame = (
  entry: ParsedScheduleEntry,
  existingGame?: AggregatedGameInternal
): AggregatedGameInternal => {
  const { game, prospect, prospectSide } = entry;

  const target = existingGame ?? game;

  if (existingGame) {
    if (
      (existingGame.tipoff?.toUpperCase().includes('TBD') || !existingGame.tipoff) &&
      game.tipoff &&
      !game.tipoff.toUpperCase().includes('TBD')
    ) {
      existingGame.tipoff = game.tipoff;
    }

    if (!existingGame.tv && game.tv) {
      existingGame.tv = game.tv;
    }

    if (!existingGame.note && game.note) {
      existingGame.note = game.note;
    }

    if (!existingGame.venue && game.venue) {
      existingGame.venue = game.venue;
    }

    if (existingGame.status === 'TIME_TBD' && game.status !== 'TIME_TBD') {
      existingGame.status = game.status;
    }

    if (existingGame.sortTimestamp == null && game.sortTimestamp != null) {
      existingGame.sortTimestamp = game.sortTimestamp;
    }
  }

  if (!target._prospectRanks.has(prospect.rank)) {
    target._prospectRanks.add(prospect.rank);
    target.prospects.push(prospect);
  }

  if (prospectSide === 'home') {
    if (!target._homeProspectRanks.has(prospect.rank)) {
      target._homeProspectRanks.add(prospect.rank);
      target.homeProspects.push(prospect);
    }
  } else {
    if (!target._awayProspectRanks.has(prospect.rank)) {
      target._awayProspectRanks.add(prospect.rank);
      target.awayProspects.push(prospect);
    }
  }

  return target;
};

const parseScheduleFile = (
  filePath: string,
  prospectsByRank: Map<number, Prospect>,
  directory: Map<string, TeamDirectoryEntry>
): ParsedScheduleEntry[] => {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  if (!lines.length) return [];

  const headerInfo = parseHeader(lines[0]);
  if (!headerInfo) return [];

  const rankLine = lines.find((line) => line.startsWith('Rank:'));
  if (!rankLine) return [];

  const rank = parseRank(rankLine);
  if (rank == null) return [];

  const prospect = prospectsByRank.get(rank);
  if (!prospect) return [];

  if (!prospect.teamDisplay) {
    const resolved = resolveTeamName(headerInfo.teamDisplay, directory);
    prospect.teamDisplay = resolved;
  }

  const scheduleEntries: ParsedScheduleEntry[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.trim().startsWith('Notes:')) break;

    const teamDisplayName =
      prospect.teamDisplay ??
      resolveTeamName(headerInfo.teamDisplay, directory);
    const parsed = parseLine(line, teamDisplayName, prospect, directory);
    if (parsed) {
      scheduleEntries.push(parsed);
    }
  }

  return scheduleEntries;
};

const ensureJerseyData = async (
  prospectsByRank: Map<number, Prospect>,
  directory: Map<string, TeamDirectoryEntry>
) => {
  const teamToProspects = new Map<string, Prospect[]>();

  for (const prospect of prospectsByRank.values()) {
    const candidateNames = [
      prospect.teamDisplay,
      prospect.espnTeamName,
      prospect.team,
    ].filter(Boolean) as string[];

    let matchedTeam: TeamDirectoryEntry | undefined;
    for (const candidate of candidateNames) {
      matchedTeam = findTeamEntryInDirectory(directory, candidate);
      if (matchedTeam) break;
    }

    if (!matchedTeam) continue;

    prospect.teamId = matchedTeam.id;
    prospect.teamDisplay =
      matchedTeam.location ||
      matchedTeam.shortDisplayName ||
      matchedTeam.displayName;

    if (!teamToProspects.has(matchedTeam.id)) {
      teamToProspects.set(matchedTeam.id, []);
    }
    teamToProspects.get(matchedTeam.id)!.push(prospect);
  }

  for (const [teamId, prospects] of teamToProspects) {
    const rosterMap = await getRosterForTeam(teamId);
    if (!rosterMap.size) continue;

    for (const prospect of prospects) {
      if (prospect.jersey) continue;
      const variants = createNameVariants(prospect.name);
      for (const variant of variants) {
        const jersey = rosterMap.get(variant);
        if (jersey) {
          prospect.jersey = jersey;
          break;
        }
      }
    }
  }
};

const getTeamNameKeys = (values: Array<string | undefined>): Set<string> => {
  const set = new Set<string>();
  const stopWordPattern = /(university|college|men|women|basketball|the)/g;

  for (const value of values) {
    if (!value) continue;
    const normalized = normalizeForLookup(value);
    if (!normalized) continue;
    set.add(normalized);

    const simplified = normalized.replace(stopWordPattern, '').replace(/[^a-z0-9]/g, '');
    if (simplified) {
      set.add(simplified);
    }
  }

  return set;
};

const getTeamKeysFromTeamInfo = (team: TeamInfo): Set<string> => {
  return getTeamNameKeys([team.displayName, team.name]);
};

const getTeamKeysFromCompetitionTeam = (team: any): Set<string> => {
  if (!team) return new Set();
  return getTeamNameKeys([
    team.displayName,
    team.shortDisplayName,
    team.name,
    team.location ? `${team.location} ${team.name}` : undefined,
    team.nickname ? `${team.location ?? ''} ${team.nickname}` : undefined,
  ]);
};

const hasIntersection = (a: Set<string>, b: Set<string>) => {
  for (const key of a) {
    if (b.has(key)) return true;
  }
  return false;
};

const fetchScoreboardEvents = async (dateKey: string): Promise<any[]> => {
  if (scoreboardCache.has(dateKey)) {
    return scoreboardCache.get(dateKey)!;
  }

  const dateToken = dateKey.replace(/-/g, '');
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=${SCOREBOARD_GROUPS}&dates=${dateToken}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      scoreboardCache.set(dateKey, []);
      return [];
    }

    const data = await response.json();
    const events: any[] = data?.events ?? [];
    scoreboardCache.set(dateKey, events);
    return events;
  } catch (error) {
    console.warn(`Failed to fetch scoreboard for ${dateKey}`, error);
    scoreboardCache.set(dateKey, []);
    return [];
  }
};

const collectBroadcastNames = (competition: any): string[] => {
  const names = new Set<string>();

  const addName = (value?: string) => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed) {
      names.add(trimmed);
    }
  };

  if (typeof competition?.broadcast === 'string') {
    addName(competition.broadcast);
  }

  const broadcasts = competition?.broadcasts ?? [];
  for (const broadcast of broadcasts) {
    if (broadcast?.names?.length) {
      for (const name of broadcast.names) {
        addName(name);
      }
    }
    addName(broadcast?.shortName);
    addName(broadcast?.media?.shortName);
  }

  const geoBroadcasts = competition?.geoBroadcasts ?? [];
  for (const geo of geoBroadcasts) {
    const typeShortName = geo?.type?.shortName?.toUpperCase();
    if (typeShortName && !['TV', 'STREAMING'].includes(typeShortName)) {
      continue;
    }
    addName(geo?.media?.shortName);
    addName(geo?.shortName);
  }

  return Array.from(names);
};

const formatCompetitionTipoff = (isoString?: string) => {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;

  try {
    // Use user's local timezone instead of ET
    const labelFormatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      // No timeZone specified - uses user's local timezone
    });

    const sortFormatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      // No timeZone specified - uses user's local timezone
    });

    const label = labelFormatter.format(date);
    const sortParts = sortFormatter.format(date).split(':');
    const hours = Number.parseInt(sortParts[0], 10);
    const minutes = Number.parseInt(sortParts[1], 10);
    const sortMinutes = hours * 60 + minutes;

    return { label, sortMinutes };
  } catch {
    return null;
  }
};

const findMatchingCompetition = (
  game: AggregatedGameInternal,
  events: any[]
): any | undefined => {
  const gameHomeKeys = getTeamKeysFromTeamInfo(game.homeTeam);
  const gameAwayKeys = getTeamKeysFromTeamInfo(game.awayTeam);

  for (const event of events) {
    const competition = event?.competitions?.[0];
    if (!competition) continue;

    const competitors = competition.competitors ?? [];
    const homeComp = competitors.find((comp: any) => comp?.homeAway === 'home');
    const awayComp = competitors.find((comp: any) => comp?.homeAway === 'away');
    if (!homeComp || !awayComp) continue;

    const compHomeKeys = getTeamKeysFromCompetitionTeam(homeComp.team);
    const compAwayKeys = getTeamKeysFromCompetitionTeam(awayComp.team);

    const homeMatch =
      hasIntersection(gameHomeKeys, compHomeKeys) &&
      hasIntersection(gameAwayKeys, compAwayKeys);
    const swappedMatch =
      hasIntersection(gameHomeKeys, compAwayKeys) &&
      hasIntersection(gameAwayKeys, compHomeKeys);

    if (homeMatch || swappedMatch) {
      return competition;
    }
  }

  return undefined;
};

const enrichWithBroadcasts = async (
  aggregatedGames: Map<string, AggregatedGameInternal>
) => {
  const gamesByDate = new Map<string, AggregatedGameInternal[]>();

  for (const game of aggregatedGames.values()) {
    const dateKey = game.dateKey ?? game.date.substring(0, 10);
    if (!gamesByDate.has(dateKey)) {
      gamesByDate.set(dateKey, []);
    }
    gamesByDate.get(dateKey)!.push(game);
  }

  for (const [dateKey, games] of gamesByDate.entries()) {
    const events = await fetchScoreboardEvents(dateKey);
    if (!events.length) continue;

    for (const game of games) {
      const needsTv = !game.tv || /TBA|TBD/i.test(game.tv);
      const needsTime =
        !game.tipoff ||
        /TBA|TBD/i.test(game.tipoff) ||
        game.status === 'TIME_TBD';

      if (!needsTv && !needsTime) continue;

      const competition = findMatchingCompetition(game, events);
      if (!competition) continue;

      if (needsTv) {
        const networks = collectBroadcastNames(competition);
        if (networks.length) {
          game.tv = networks.join(' / ');
        }
      }

       const competitors = competition?.competitors ?? [];
       const homeComp = competitors.find((comp: any) => comp?.homeAway === 'home');
       const awayComp = competitors.find((comp: any) => comp?.homeAway === 'away');

       if (homeComp?.team?.location) {
         game.homeTeam.displayName = homeComp.team.location;
         game.homeTeam.name = homeComp.team.location;
       }
       if (awayComp?.team?.location) {
         game.awayTeam.displayName = awayComp.team.location;
         game.awayTeam.name = awayComp.team.location;
       }

      if (needsTime) {
        const formatted = formatCompetitionTipoff(
          competition?.date || competition?.startDate
        );
        if (formatted) {
          game.tipoff = formatted.label;
          game.sortTimestamp = formatted.sortMinutes;
          game.status = 'SCHEDULED';
        }
      }
    }
  }
};

const finalizeGame = (id: string, game: AggregatedGameInternal): GameWithProspects => {
  const prospects = [...game.prospects].sort((a, b) => a.rank - b.rank);
  const homeProspects = [...game.homeProspects].sort((a, b) => a.rank - b.rank);
  const awayProspects = [...game.awayProspects].sort((a, b) => a.rank - b.rank);

  const highlightProspect = prospects[0];
  const highlight = highlightProspect ? `#${highlightProspect.rank} ${highlightProspect.name}` : undefined;

  return {
    id,
    date: game.date,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    status: game.status,
    venue: game.venue,
    prospects,
    homeProspects,
    awayProspects,
    tipoff: game.tipoff,
    tv: game.tv,
    note: game.note,
    highlight,
    dateKey: game.dateKey,
    locationType: game.locationType,
    sortTimestamp: game.sortTimestamp ?? null,
  };
};

const buildSchedules = async (): Promise<LoadedSchedules> => {
  const prospectsByRank = getProspectsByRank();
  const teamDirectory = await getTeamDirectory();

  await ensureJerseyData(prospectsByRank, teamDirectory);

  const rootDir = process.cwd();
  const files = fs.readdirSync(rootDir).filter((file) => file.endsWith(SCHEDULE_SUFFIX));

  const aggregatedGames = new Map<string, AggregatedGameInternal>();

  for (const file of files) {
    const filePath = path.join(rootDir, file);
    const entries = parseScheduleFile(filePath, prospectsByRank, teamDirectory);

    for (const entry of entries) {
      const existing = aggregatedGames.get(entry.key);
      const merged = mergeProspectIntoGame(entry, existing);

      if (existing) {
        if (existing.locationType === 'neutral' && merged.locationType !== 'neutral') {
          existing.locationType = merged.locationType;
        }
        merged.sortTimestamp =
          merged.sortTimestamp ?? existing.sortTimestamp ?? null;
      }

      aggregatedGames.set(entry.key, merged);
    }
  }

  await enrichWithBroadcasts(aggregatedGames);

  const gamesByDateMap: Record<string, Map<string, GameWithProspects>> = {};

  const createMergeKey = (game: GameWithProspects) => {
    const dateKey = game.dateKey ?? game.date.substring(0, 10);
    const tipoff =
      typeof game.sortTimestamp === 'number'
        ? game.sortTimestamp.toString()
        : (game.tipoff ?? '').toUpperCase();
    const home = sanitizeKey(game.homeTeam.displayName || game.homeTeam.name);
    const away = sanitizeKey(game.awayTeam.displayName || game.awayTeam.name);
    return `${dateKey}__${tipoff}__${home}__${away}`;
  };

  for (const [key, game] of aggregatedGames.entries()) {
    const finalized = finalizeGame(key, game);
    const dateKey = finalized.dateKey ?? finalized.date.substring(0, 10);
    if (!gamesByDateMap[dateKey]) {
      gamesByDateMap[dateKey] = new Map<string, GameWithProspects>();
    }
    const mergeKey = createMergeKey(finalized);
    const existing = gamesByDateMap[dateKey].get(mergeKey);

    if (existing) {
      const ranks = new Set(existing.prospects.map((p) => p.rank));
      finalized.prospects.forEach((prospect) => {
        if (!ranks.has(prospect.rank)) {
          existing.prospects.push(prospect);
        }
      });

      const homeRanks = new Set(existing.homeProspects.map((p) => p.rank));
      finalized.homeProspects.forEach((prospect) => {
        if (!homeRanks.has(prospect.rank)) {
          existing.homeProspects.push(prospect);
        }
      });

      const awayRanks = new Set(existing.awayProspects.map((p) => p.rank));
      finalized.awayProspects.forEach((prospect) => {
        if (!awayRanks.has(prospect.rank)) {
          existing.awayProspects.push(prospect);
        }
      });

      if (existing.tv && finalized.tv && /TBA|TBD/i.test(existing.tv)) {
        existing.tv = finalized.tv;
      } else if (!existing.tv && finalized.tv) {
        existing.tv = finalized.tv;
      }

      if (existing.tipoff && finalized.tipoff && /TBA|TBD/i.test(existing.tipoff)) {
        existing.tipoff = finalized.tipoff;
        existing.sortTimestamp = finalized.sortTimestamp;
      } else if (!existing.tipoff && finalized.tipoff) {
        existing.tipoff = finalized.tipoff;
        existing.sortTimestamp = finalized.sortTimestamp;
      }
    } else {
      gamesByDateMap[dateKey].set(mergeKey, finalized);
    }
  }

  const gamesByDate: Record<string, GameWithProspects[]> = {};

  Object.entries(gamesByDateMap).forEach(([date, map]) => {
    const games = Array.from(map.values());
    games.sort((a, b) => {
      const aSort =
        typeof a.sortTimestamp === 'number' ? a.sortTimestamp : Number.MAX_SAFE_INTEGER;
      const bSort =
        typeof b.sortTimestamp === 'number' ? b.sortTimestamp : Number.MAX_SAFE_INTEGER;
      if (aSort === bSort) {
        return (a.tipoff ?? '').localeCompare(b.tipoff ?? '');
      }
      return aSort - bSort;
    });
    gamesByDate[date] = games;
  });

  const allGames = Object.values(gamesByDate).flat();

  return {
    gamesByDate,
    allGames,
  };
};

export const loadAllSchedules = async (forceReload = false): Promise<LoadedSchedules> => {
  // Check if cache should be invalidated due to file changes
  if (shouldInvalidateCache() || forceReload) {
    cachedSchedules = null;
    buildPromise = null;
    cacheTimestamp = null;
  }
  
  if (cachedSchedules) {
    return cachedSchedules;
  }

  if (buildPromise) {
    return buildPromise;
  }

  buildPromise = (async () => {
    try {
      const result = await buildSchedules();
      cachedSchedules = result;
      cacheTimestamp = Date.now();
      return result;
    } finally {
      buildPromise = null;
    }
  })();

  return buildPromise;
};

export const getGamesBetween = async (startDate: string, endDate: string): Promise<Record<string, GameWithProspects[]>> => {
  const { gamesByDate } = await loadAllSchedules();
  const result: Record<string, GameWithProspects[]> = {};

  const startKey = startDate;
  const endKey = endDate;

  Object.keys(gamesByDate)
    .filter((date) => date >= startKey && date <= endKey)
    .sort()
    .forEach((date) => {
      result[date] = gamesByDate[date];
    });

  return result;
};

export const getGamesForDate = async (date: string): Promise<GameWithProspects[]> => {
  const { gamesByDate } = await loadAllSchedules();
  return gamesByDate[date] ?? [];
};

