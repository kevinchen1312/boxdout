import fs from 'fs';
import path from 'path';
import { parse, format } from 'date-fns';
import type { Prospect } from '@/app/types/prospect';
import type { GameWithProspects, TeamInfo } from '@/app/utils/gameMatching';
import { getProspectsByRank, type RankingSource } from './loadProspects';

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
  source: RankingSource;
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

const cachedSchedules: Record<RankingSource, LoadedSchedules | null> = {
  espn: null,
  myboard: null,
};
const buildPromises: Record<RankingSource, Promise<LoadedSchedules> | null> = {
  espn: null,
  myboard: null,
};
let cacheTimestamp: number | null = null;

// Function to clear the cache and force reload
export const clearScheduleCache = (source?: RankingSource) => {
  if (!source || source === 'espn') {
    cachedSchedules.espn = null;
    buildPromises.espn = null;
  }
  if (!source || source === 'myboard') {
    cachedSchedules.myboard = null;
    buildPromises.myboard = null;
  }
  if (!source) {
    cacheTimestamp = null;
  }
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

// Logo overrides for teams that are incorrectly matched in ESPN directory
// These teams share names with other teams and get the wrong logo
// Format: normalized team name -> ESPN team ID (to fetch correct logo)
const LOGO_OVERRIDE_TEAM_IDS: Record<string, string> = {
  'centralarkansas': '2110', // Central Arkansas Bears (not Arkansas Razorbacks)
  'centralarkansasbears': '2110',
  'indianastate': '282', // Indiana State Sycamores (not Indiana Hoosiers)
  'indianastatesycamores': '282',
  'washingtonstate': '265', // Washington State Cougars (not Washington Huskies)
  'washingtonstatecougars': '265',
  'arizonastate': '9', // Arizona State Sun Devils (not Arizona Wildcats)
  'arizonastatesundevils': '9',
  'michiganstate': '127', // Michigan State Spartans (not Michigan Wolverines)
  'michiganstatespartans': '127',
  'northcarolinastate': '152', // NC State Wolfpack (not North Carolina Tar Heels)
  'northcarolinastatewolfpack': '152',
  'ncstate': '152',
  'oklahomastate': '197', // Oklahoma State Cowboys (not Oklahoma Sooners)
  'oklahomastatecowboys': '197',
  'oregonstate': '204', // Oregon State Beavers (not Oregon Ducks)
  'oregonstatebeavers': '204',
  'coloradostate': '38', // Colorado State Rams (not Colorado Buffaloes)
  'coloradostaterams': '38',
  'iowastate': '66', // Iowa State Cyclones (not Iowa Hawkeyes)
  'iowastatecyclones': '66',
  'kansasstate': '2306', // Kansas State Wildcats (not Kansas Jayhawks)
  'kansasstatewildcats': '2306',
  'mississippistate': '344', // Mississippi State Bulldogs (not Mississippi Rebels)
  'mississippistatebulldogs': '344',
  'texasstate': '326', // Texas State Bobcats (not Texas Longhorns)
  'texasstatebobcats': '326',
  // Add more as needed
};

// International team logo mappings (teams not in ESPN directory)
// Using local logo files in /logos directory - logos are 500x500 source, displayed at 100x100
// Format: normalized team name (no spaces/punctuation) -> logo path
const INTERNATIONAL_TEAM_LOGOS: Record<string, string> = {
  // NBL Teams (normalized keys - all lowercase, no spaces/punctuation)
  'melbourneunited': '/logos/melbourne-united.png',
  'newzealandbreakers': '/logos/new-zealand-breakers.png',
  'brisbanebullets': '/logos/brisbane-bullets.png',
  'semelbournephoenix': '/logos/south-east-melbourne-phoenix.png',
  'southeastmelbournephoenix': '/logos/south-east-melbourne-phoenix.png',
  'cairnstaipans': '/logos/cairns-taipans.png',
  'taipans': '/logos/cairns-taipans.png',
  'perthwildcats': '/logos/perth-wildcats.png',
  'wildcats': '/logos/perth-wildcats.png',
  'tasmaniajackjumpers': '/logos/tasmania-jackjumpers.png',
  'jackjumpers': '/logos/tasmania-jackjumpers.png',
  'sydneykings': '/logos/sydney-kings.png',
  'kings': '/logos/sydney-kings.png',
  'adelaide36ers': '/logos/adelaide-36ers.png',
  '36ers': '/logos/adelaide-36ers.png',
  'illawarrahawks': '/logos/illawarra-hawks.png',
  'hawks': '/logos/illawarra-hawks.png',
  
  // EuroLeague Teams - ASVEL Basket (LDLC ASVEL)
  'asvelbasket': '/logos/asvel-basket.png',
  'ldlcasvel': '/logos/asvel-basket.png',
  'asvel': '/logos/asvel-basket.png',
  
  // EuroLeague Teams - Paris Basketball  
  'parisbasketball': '/logos/paris-basketball.png',
  
  // EuroLeague Teams - Valencia Basket
  'valenciabasket': '/logos/valencia-basket.png',
  'valencia': '/logos/valencia-basket.png',
  
  // Liga ACB / EuroCup Teams - Joventut Badalona
  'joventutbadalona': '/logos/joventut-badalona.png',
  'penya': '/logos/joventut-badalona.png',
  
  // Liga ACB Teams - Spanish Teams
  'dreamlandgrancanaria': '/logos/dreamland-gran-canaria.svg',
  'grancanaria': '/logos/dreamland-gran-canaria.svg',
  'lenovotenerife': '/logos/lenovo-tenerife.png',
  'tenerife': '/logos/lenovo-tenerife.png',
  'baximanresa': '/logos/baxi-manresa.png',
  'manresa': '/logos/baxi-manresa.png',
  'bilbaobasket': '/logos/bilbao-basket.png',
  'bilbao': '/logos/bilbao-basket.png',
  'cbgirona': '/logos/cb-girona.png',
  'girona': '/logos/cb-girona.png',
  'cbgranada': '/logos/cb-granada.png',
  'granada': '/logos/cb-granada.png',
  'casademontzaragoza': '/logos/casademont-zaragoza.png',
  'zaragoza': '/logos/casademont-zaragoza.png',
  'morabancandorra': '/logos/morabanc-andorra.png',
  'andorra': '/logos/morabanc-andorra.png',
  'riobreogan': '/logos/rio-breogan.png',
  'breogan': '/logos/rio-breogan.png',
  'siblosanpabloburgos': '/logos/siblo-san-pablo-burgos.png',
  'burgos': '/logos/siblo-san-pablo-burgos.png',
  'ucammurciacb': '/logos/ucam-murcia-cb.png',
  'murcia': '/logos/ucam-murcia-cb.png',
  'forcalleidace': '/logos/forca-lleida-ce.png',
  'lleida': '/logos/forca-lleida-ce.png',
  
  // French LNB Teams
  'csplimoges': '/logos/csp-limoges.png',
  'limoges': '/logos/csp-limoges.png',
  'jlbourgenbresse': '/logos/jl-bourg-en-bresse.png',
  'bourg': '/logos/jl-bourg-en-bresse.png',
  'jdadijonbasket': '/logos/jda-dijon-basket.png',
  'dijon': '/logos/jda-dijon-basket.png',
  'bcmgravelines': '/logos/bcm-gravelines.png',
  'gravelines': '/logos/bcm-gravelines.png',
  'boulazacbasketdordogne': '/logos/boulazac-basket-dordogne.png',
  'boulazac': '/logos/boulazac-basket-dordogne.png',
  'chalonsursaone': '/logos/chalon-sur-saone.png',
  'chalon': '/logos/chalon-sur-saone.png',
  'choletbasket': '/logos/cholet-basket.png',
  'cholet': '/logos/cholet-basket.png',
  'lemanssarthebasket': '/logos/le-mans-sarthe-basket.png',
  'lemans': '/logos/le-mans-sarthe-basket.png',
  'leportel': '/logos/le-portel.png',
  'portel': '/logos/le-portel.png',
  'nancybasket': '/logos/nancy-basket.png',
  'nancy': '/logos/nancy-basket.png',
  'nanterre92': '/logos/nanterre-92.png',
  'nanterre': '/logos/nanterre-92.png',
  'saintquentinbasketball': '/logos/saint-quentin-basketball.png',
  'saintquentin': '/logos/saint-quentin-basketball.png',
  'strasbourgig': '/logos/strasbourg-ig.png',
  'strasbourg': '/logos/strasbourg-ig.png',
  
  // Israeli Teams - EuroCup
  'hapoelunetholon': '/logos/hapoel-unet-holon.png',
  'hapoelholon': '/logos/hapoel-unet-holon.png',
  'holon': '/logos/hapoel-unet-holon.png',
  
  // Turkish Teams - EuroCup
  'bursaspor': '/logos/bursaspor.png',
  
  // College Teams (not in ESPN directory)
  'lindenwoodlions': '/logos/lindenwood-lions.png',
  'lindenwood': '/logos/lindenwood-lions.png',
  'queensuniversityroyals': '/logos/queens-university.png',
  'queensuniversity': '/logos/queens-university.png',
  'queensroyals': '/logos/queens-university.png',
  'queens': '/logos/queens-university.png',
  
  // Serbian ABA League - Mega Superbet
  // Note: SVG files from Wikimedia Commons - high quality vector graphics
  'megasuperbet': '/logos/mega-superbet.png',
  'mega': '/logos/mega-superbet.png',
  
  // Serbian ABA League - Other Teams
  'cedevitaolimpija': '/logos/cedevita-olimpija.png',
  'olimpija': '/logos/cedevita-olimpija.png',
  'bosnabhtelecom': '/logos/bosna-bh-telecom.png',
  'bosna': '/logos/bosna-bh-telecom.png',
  'bcvienna': '/logos/bc-vienna.png',
  'vienna': '/logos/bc-vienna.png',
  'crvenazvezdameridianbet': '/logos/crvena-zvezda.png',
  'kkcrvenazvezda': '/logos/crvena-zvezda.png',
  'crvenazvezda': '/logos/crvena-zvezda.png',
  'redstar': '/logos/crvena-zvezda.png',
  'ilirija': '/logos/ilirija.png',
  'zadar': '/logos/zadar.png',
  'buducnostvoli': '/logos/buducnost.png',
  'buducnost': '/logos/buducnost.png',
  'spartakofficeshoes': '/logos/spartak.png',
  'spartak': '/logos/spartak.png',
  
  // EuroLeague - Spanish Teams
  'realmadrid': '/logos/real-madrid.png',
  'madrid': '/logos/real-madrid.png',
  'fcbarcelona': '/logos/barcelona.svg',
  'barca': '/logos/barcelona.svg',
  'barcelona': '/logos/barcelona.svg',
  'baskonia': '/logos/baskonia.svg',
  'unicaja': '/logos/unicaja.svg',
  
  // EuroLeague - Italian Teams
  'virtusbologna': '/logos/virtus-bologna.svg',
  'virtus': '/logos/virtus-bologna.svg',
  'bologna': '/logos/virtus-bologna.svg',
  'axarmaniexchangemilan': '/logos/armani-milan.png',
  'armanimilano': '/logos/armani-milan.png',
  'olimpiamilano': '/logos/armani-milan.png',
  'milan': '/logos/armani-milan.png',
  
  // EuroLeague - Turkish Teams
  'fenerbahcebeko': '/logos/fenerbahce.png',
  'fenerbahce': '/logos/fenerbahce.png',
  'anadoluefes': '/logos/anadolu-efes.png',
  'efes': '/logos/anadolu-efes.png',
  
  // EuroLeague - Greek Teams
  'panathinaikos': '/logos/panathinaikos.png',
  'pao': '/logos/panathinaikos.png',
  'olympiacos': '/logos/olympiacos.png',
  'olympiakos': '/logos/olympiacos.png',
  
  // EuroLeague - Lithuanian Teams
  'zalgiris': '/logos/zalgiris.png',
  'zalgiriskaunas': '/logos/zalgiris.png',
  
  // EuroLeague - German Teams
  'bayernmunich': '/logos/bayern-munich.svg',
  'bayern': '/logos/bayern-munich.svg',
  'fcbayernmunchen': '/logos/bayern-munich.svg',
  
  // EuroLeague - Serbian Teams
  'kkpartizan': '/logos/partizan.png',
  'partizan': '/logos/partizan.png',
  'partizanbelgrade': '/logos/partizan.png',
  
  // EuroLeague - Israeli Teams
  'hapoeltelaviv': '/logos/hapoel-tel-aviv.png',
  'hapoel': '/logos/hapoel-tel-aviv.png',
  'maccabifoxtelaviv': '/logos/maccabi-tel-aviv.png',
  'maccabi': '/logos/maccabi-tel-aviv.png',
  'maccabitelaviv': '/logos/maccabi-tel-aviv.png',
  
  // EuroLeague - French Teams
  'asmonacobasket': '/logos/monaco.png',
  'monaco': '/logos/monaco.png',
  'asmonaco': '/logos/monaco.png',
  
  // EuroLeague - Other Teams
  'dubai': '/logos/dubai.svg',
};

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

// Cache for override team logos
const overrideLogoCache = new Map<string, string>();

// Fetch logo for override team ID
const fetchOverrideLogo = async (teamId: string): Promise<string | undefined> => {
  if (overrideLogoCache.has(teamId)) {
    return overrideLogoCache.get(teamId);
  }

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}`;
    
    // Add timeout to prevent hanging (5 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return undefined;
    
    const data = await response.json();
    const logo = data.team?.logos?.[0]?.href;
    
    if (logo) {
      overrideLogoCache.set(teamId, logo);
      return logo;
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn(`[Logo] Timeout fetching override logo for team ${teamId}`);
    } else {
      console.error(`[Logo] Failed to fetch override logo for team ${teamId}:`, error);
    }
  }
  
  return undefined;
};

const createTeamInfo = async (displayName: string, teamEntry?: TeamDirectoryEntry): Promise<TeamInfo> => {
  try {
    // Check for international team logo first
    const normalizedName = normalizeForLookup(displayName);
    const internationalLogo = INTERNATIONAL_TEAM_LOGOS[normalizedName];
    
    // Check for logo override (teams that are incorrectly matched)
    // Always check for override teams first, as they may be incorrectly matched in the directory
    let overrideLogo: string | undefined;
    const overrideTeamId = LOGO_OVERRIDE_TEAM_IDS[normalizedName];
    if (overrideTeamId) {
      try {
        overrideLogo = await fetchOverrideLogo(overrideTeamId);
      } catch (error) {
        // If override fetch fails, fall back to teamEntry logo
        console.error(`[Logo] Failed to fetch override for ${displayName}:`, error);
      }
    }
    
    // Debug logging (only in development)
    if (process.env.NODE_ENV === 'development') {
      if (internationalLogo) {
        console.log(`[Logo] Found international logo for "${displayName}" (normalized: "${normalizedName}") -> ${internationalLogo}`);
      }
      if (overrideLogo) {
        console.log(`[Logo] Using override logo for "${displayName}" (team ID: ${overrideTeamId})`);
      }
      if (!internationalLogo && !overrideLogo && !teamEntry?.logo) {
        console.log(`[Logo] No logo found for "${displayName}" (normalized: "${normalizedName}")`);
      }
    }
    
    // Priority: overrideLogo > internationalLogo > teamEntry?.logo
    // This ensures international teams get their logos even if they match ESPN directory
    const finalLogo = overrideLogo || internationalLogo || teamEntry?.logo;
    
    return {
      name: displayName,
      displayName,
      logo: finalLogo,
    };
  } catch (error) {
    // If anything fails, return team info without logo rather than throwing
    console.error(`[Logo] Error creating team info for ${displayName}:`, error);
    return {
      name: displayName,
      displayName,
      logo: teamEntry?.logo,
    };
  }
};

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

// Teams that should NOT match via substring (to prevent collisions)
// Format: normalized team name -> array of teams it should NOT match
const TEAM_COLLISION_GUARDS: Record<string, string[]> = {
  'washington': ['washingtonstate', 'washingtonstatecougars'],
  'washingtonhuskies': ['washingtonstate', 'washingtonstatecougars'],
  'washingtonstate': ['washington', 'washingtonhuskies'],
  'washingtonstatecougars': ['washington', 'washingtonhuskies'],
  'arizona': ['arizonastate', 'arizonastatesundevils'],
  'arizonawildcats': ['arizonastate', 'arizonastatesundevils'],
  'arizonastate': ['arizona', 'arizonawildcats'],
  'arizonastatesundevils': ['arizona', 'arizonawildcats'],
  'michigan': ['michiganstate', 'michiganstatespartans'],
  'michiganwolverines': ['michiganstate', 'michiganstatespartans'],
  'michiganstate': ['michigan', 'michiganwolverines'],
  'michiganstatespartans': ['michigan', 'michiganwolverines'],
  'northcarolina': ['northcarolinastate', 'ncstate', 'northcarolinastatewolfpack'],
  'northcarolinarheels': ['northcarolinastate', 'ncstate', 'northcarolinastatewolfpack'],
  'northcarolinastate': ['northcarolina', 'northcarolinarheels'],
  'ncstate': ['northcarolina', 'northcarolinarheels'],
  'oklahoma': ['oklahomastate', 'oklahomastatecowboys'],
  'oklahomasooners': ['oklahomastate', 'oklahomastatecowboys'],
  'oklahomastate': ['oklahoma', 'oklahomasooners'],
  'oregon': ['oregonstate', 'oregonstatebeavers'],
  'oregonducks': ['oregonstate', 'oregonstatebeavers'],
  'oregonstate': ['oregon', 'oregonducks'],
  'colorado': ['coloradostate', 'coloradostaterams'],
  'coloradobuffaloes': ['coloradostate', 'coloradostaterams'],
  'coloradostate': ['colorado', 'coloradobuffaloes'],
  'iowa': ['iowastate', 'iowastatecyclones'],
  'iowahawkeyes': ['iowastate', 'iowastatecyclones'],
  'iowastate': ['iowa', 'iowahawkeyes'],
  'kansas': ['kansasstate', 'kansasstatewildcats'],
  'kansasjayhawks': ['kansasstate', 'kansasstatewildcats'],
  'kansasstate': ['kansas', 'kansasjayhawks'],
  'mississippi': ['mississippistate', 'mississippistatebulldogs'],
  'mississippirebels': ['mississippistate', 'mississippistatebulldogs'],
  'mississippistate': ['mississippi', 'mississippirebels'],
  'texas': ['texasstate', 'texasstatebobcats'],
  'texaslonghorns': ['texasstate', 'texasstatebobcats'],
  'texasstate': ['texas', 'texaslonghorns'],
  'arkansas': ['centralarkansas', 'centralarkansasbears'],
  'arkansasrazorbacks': ['centralarkansas', 'centralarkansasbears'],
  'centralarkansas': ['arkansas', 'arkansasrazorbacks'],
  'indiana': ['indianastate', 'indianastatesycamores'],
  'indianahoosiers': ['indianastate', 'indianastatesycamores'],
  'indianastate': ['indiana', 'indianahoosiers'],
};

const findTeamEntryInDirectory = (
  directory: Map<string, TeamDirectoryEntry>,
  teamName: string
): TeamDirectoryEntry | undefined => {
  const normalized = normalizeForLookup(teamName);
  if (!normalized) return undefined;

  // 1) Exact match
  if (directory.has(normalized)) {
    return directory.get(normalized);
  }

  // 2) Word-boundary matching (prefer exact word matches over substring matches)
  // Split normalized into words and try to match each word
  const words = normalized.split(/(?<=[a-z])(?=[A-Z])|[^a-z0-9]+/).filter(Boolean);
  if (words.length > 0) {
    const candidates: Array<{ key: string; entry: TeamDirectoryEntry; score: number }> = [];
    
    for (const [key, entry] of directory.entries()) {
      // Check collision guards first
      const blockedTeams = TEAM_COLLISION_GUARDS[normalized];
      if (blockedTeams && blockedTeams.includes(key)) {
        continue; // Skip this match
      }
      
      // Check if this key is blocked for our normalized name
      const keyBlockedTeams = TEAM_COLLISION_GUARDS[key];
      if (keyBlockedTeams && keyBlockedTeams.includes(normalized)) {
        continue; // Skip this match
      }
      
      // Prefer exact word matches
      let score = 0;
      const keyWords = key.split(/[^a-z0-9]+/).filter(Boolean);
      
      // Count matching words
      for (const word of words) {
        if (keyWords.includes(word)) {
          score += 10; // High score for exact word match
        } else if (key.includes(word) && word.length >= 4) {
          score += 1; // Lower score for substring match (only for words >= 4 chars)
        }
      }
      
      // Prefer matches where all words match
      if (words.every(word => keyWords.some(kw => kw.includes(word) || word.includes(kw)))) {
        score += 5;
      }
      
      if (score > 0) {
        candidates.push({ key, entry, score });
      }
    }
    
    if (candidates.length > 0) {
      // Sort by score (highest first), then by key length (shorter = more specific)
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.key.length - b.key.length;
      });
      return candidates[0].entry;
    }
  }

  // 3) Fallback: substring matching (but with collision guards)
  for (const [key, entry] of directory.entries()) {
    // Check collision guards
    const blockedTeams = TEAM_COLLISION_GUARDS[normalized];
    if (blockedTeams && blockedTeams.includes(key)) {
      continue;
    }
    
    const keyBlockedTeams = TEAM_COLLISION_GUARDS[key];
    if (keyBlockedTeams && keyBlockedTeams.includes(normalized)) {
      continue;
    }
    
    // Only match if one is a proper substring of the other (not just contains)
    // This prevents "washington" from matching "washingtonstate"
    if (key.startsWith(normalized) || normalized.startsWith(key)) {
      // Additional check: ensure we're not matching a partial word
      // e.g., "washington" should not match "washingtonstate" 
      if (key.length > normalized.length) {
        const remaining = key.slice(normalized.length);
        // If remaining part starts with a word character, it's likely a different team
        if (/^[a-z0-9]/.test(remaining)) {
          continue;
        }
      } else if (normalized.length > key.length) {
        const remaining = normalized.slice(key.length);
        if (/^[a-z0-9]/.test(remaining)) {
          continue;
        }
      }
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

// Check if a team is a New Zealand NBL team (different timezone than Australia)
const isNewZealandTeam = (teamName: string): boolean => {
  const normalized = normalizeForLookup(teamName);
  const newZealandTeams = [
    'newzealandbreakers',
    'breakers',
  ];
  return newZealandTeams.includes(normalized);
};

// Check if a team is an Australian NBL team
const isAustralianTeam = (teamName: string): boolean => {
  const normalized = normalizeForLookup(teamName);
  const australianTeams = [
    'melbourneunited',
    'brisbanebullets',
    'semelbournephoenix',
    'southeastmelbournephoenix',
    'cairnstaipans',
    'taipans',
    'perthwildcats',
    'wildcats',
    'tasmaniajackjumpers',
    'jackjumpers',
    'sydneykings',
    'kings',
    'adelaide36ers',
    '36ers',
    'illawarrahawks',
    'hawks',
  ];
  return australianTeams.includes(normalized);
};

// Get NZ timezone offset based on date
// NZDT (UTC+13) runs from last Sunday in September to first Sunday in April
// NZST (UTC+12) is standard time
const getNZOffset = (date: Date): number => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();
  
  // NZDT periods:
  // 2025: Sep 28, 2025 to Apr 6, 2026
  // 2026: Sep 27, 2026 to Apr 5, 2027
  
  if (month >= 10 || month <= 3) {
    // Oct, Nov, Dec, Jan, Feb, Mar are definitely NZDT
    return 13;
  } else if (month === 9) {
    // September: NZDT starts Sep 28, 2025
    return day >= 28 ? 13 : 12;
  } else if (month === 4) {
    // April: NZDT ends Apr 6, 2026
    return day < 6 ? 13 : 12;
  }
  return 12; // Default to NZST
};

// Get US Eastern Time offset based on date
// EDT (UTC-4) runs from second Sunday in March to first Sunday in November
// EST (UTC-5) is standard time
const getETOffset = (date: Date): number => {
  const month = date.getMonth() + 1; // 1-12
  
  // EDT periods (approximate):
  // 2025: Mar 9 to Nov 2 = EDT, Nov 2 to Mar 8, 2026 = EST
  // 2026: Mar 8 to Nov 1 = EDT, Nov 1 to Mar 14, 2027 = EST
  
  if (month >= 3 && month <= 10) {
    // Mar-Oct are typically EDT
    return -4;
  } else {
    // Nov-Feb are typically EST
    return -5;
  }
};

// Convert New Zealand Time (NZST/NZDT) to Eastern Time (ET)
// Accounts for both NZ and US daylight saving time changes
const convertNZToET = (hours: number, minutes: number, date: Date): { hours: number; minutes: number; dayOffset: number } => {
  const nzOffset = getNZOffset(date);
  const etOffset = getETOffset(date);
  
  // Convert NZ time to UTC
  let utcTotalMinutes = (hours * 60 + minutes) - (nzOffset * 60);
  if (utcTotalMinutes < 0) utcTotalMinutes += 24 * 60;
  if (utcTotalMinutes >= 24 * 60) utcTotalMinutes -= 24 * 60;
  
  // Convert UTC to ET
  let etTotalMinutes = utcTotalMinutes + (Math.abs(etOffset) * 60);
  let dayOffset = 0;
  
  if (etTotalMinutes >= 24 * 60) {
    etTotalMinutes -= 24 * 60;
    dayOffset = 1;
  } else if (etTotalMinutes < 0) {
    etTotalMinutes += 24 * 60;
    dayOffset = -1;
  }
  
  const newHours = Math.floor(etTotalMinutes / 60) % 24;
  const newMinutes = etTotalMinutes % 60;
  
  return { hours: newHours, minutes: newMinutes, dayOffset };
};

// Convert Australian Eastern Time (AET/AEDT) to Eastern Time (ET)
// AET is UTC+10, AEDT is UTC+11 (during daylight saving, typically Oct-Mar)
// ET is UTC-5 (EST) or UTC-4 (EDT)
// So AET is 15 hours ahead of EST, 16 hours ahead of EDT
// AEDT is 16 hours ahead of EST, 17 hours ahead of EDT
// During Australian summer (Nov-Mar), use 16 hours (AEDT UTC+11 to EST UTC-5)
// During Australian winter (Apr-Oct), use 15 hours (AEST UTC+10 to EST UTC-5)
const convertAETToET = (hours: number, minutes: number, date?: Date): { hours: number; minutes: number; dayOffset: number } => {
  // Convert to 24-hour format if needed
  let totalMinutes = hours * 60 + minutes;
  
  // Use 16 hours for the conversion (AEDT to EST during Australian summer)
  // AEDT is UTC+11, EST is UTC-5, difference is 16 hours
  totalMinutes -= 16 * 60;
  
  // Handle day rollover
  let dayOffset = 0;
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60; // Add a full day
    dayOffset = -1; // Previous day
  }
  
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  
  return { hours: newHours, minutes: newMinutes, dayOffset };
};

const parseTime = (timeLabel: string, isAustralian: boolean = false): { sortTimestamp: number | null; isoTime: string; status: string } => {
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

  // Convert from Australian time to ET if needed
  if (isAustralian) {
    const converted = convertAETToET(hours, minutes);
    hours = converted.hours; // Already in 24-hour format (0-23)
    // Note: dayOffset would need to be applied to the date, but for display purposes
    // we'll just convert the time. The date adjustment would need to happen at a higher level.
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
    // Prefer location (e.g., "Arizona", "Washington") over full display name
    // This ensures consistent team names across the app
    const resolved = entry.location ||
      entry.shortDisplayName ||
      entry.displayName ||
      rawName.trim();
    
    // Normalize to ensure consistency (e.g., "UCLA" vs "California Los Angeles")
    // Use the directory entry's displayName if it exists, as it's the canonical form
    return resolved;
  }
  return rawName.trim();
};

const parseLine = async (
  line: string,
  teamDisplay: string,
  prospect: Prospect,
  directory: Map<string, TeamDirectoryEntry>
): Promise<ParsedScheduleEntry | null> => {
  // Support both em dash (—) and regular dash (-) formats
  const hasEmDash = line.includes(' — ');
  const hasRegularDash = line.includes(' - ') && !hasEmDash;
  
  if (!hasEmDash && !hasRegularDash) return null;

  // Handle regular dash format: "Date - vs/@ Opponent @ Venue, Time (Result)"
  if (hasRegularDash) {
    // Match: "Aug 21, 2025 - vs Cairns Taipans @ Casey Stadium, 6:30 pm"
    // Or: "Oct 1, 2025 - vs Valencia Basket @ Astroballe (L 77-80)"
    // Or: "Nov 12, 2025 - @ AX Armani Exchange Milan @ Mediolanum Forum, 8:30 AM ET"
    const dashParts = line.split(' - ');
    if (dashParts.length !== 2) return null;
    
    const dateLabel = dashParts[0].trim();
    const rest = dashParts[1].trim();
    
    // Parse date
    const date = parse(dateLabel, DATE_FORMAT, new Date());
    if (Number.isNaN(date.getTime())) return null;
    const dateKey = format(date, 'yyyy-MM-dd');
    
    // Extract result if present: (W 84-78) or (L 77-80)
    const resultMatch = rest.match(/\s*\(([WL]),\s*\d+\s*-\s*\d+\)\s*$/);
    const resultPart = resultMatch ? resultMatch[0] : '';
    const gamePart = rest.replace(resultPart, '').trim();
    
    // Parse vs/@ and opponent - handle formats:
    // Format 1: "vs Opponent @ Venue, Time" (e.g., Brisbane)
    // Format 2: "@ Opponent, Time @ Venue" (e.g., Valencia/Paris)
    // Format 3: "vs Opponent, Time" (no venue)
    
    let prefix: string;
    let opponentRaw: string;
    let venueRaw: string | undefined;
    let timeRaw: string | undefined;
    
    // Try Format 2 first: "vs/@ Opponent, Time @ Venue"
    // This format has: prefix, opponent+time (with comma), then @ venue
    let matchupMatch = gamePart.match(/^(vs|@)\s+(.+?),\s+(.+?)\s+@\s+(.+)$/i);
    
    if (matchupMatch) {
      // Format 2: "@ Opponent, Time @ Venue"
      prefix = matchupMatch[1].toLowerCase() === 'vs' ? 'vs' : 'at';
      opponentRaw = matchupMatch[2].trim();
      const potentialTime = matchupMatch[3].trim();
      venueRaw = matchupMatch[4].trim();
      
      // Verify the middle part is a time
      if (potentialTime.match(/\d{1,2}:\d{2}\s*(AM|PM|am|pm)/i)) {
        timeRaw = potentialTime;
      } else {
        // Not a time, treat as part of opponent name (shouldn't happen with our data)
        opponentRaw = `${opponentRaw}, ${potentialTime}`;
      }
    } else {
      // Try Format 1: "vs/@ Opponent @ Venue, Time" or "vs/@ Opponent @ Venue"
      matchupMatch = gamePart.match(/^(vs|@)\s+(.+?)\s+@\s+(.+)$/i);
      
      if (matchupMatch) {
        prefix = matchupMatch[1].toLowerCase() === 'vs' ? 'vs' : 'at';
        opponentRaw = matchupMatch[2].trim();
        const venueAndTime = matchupMatch[3].trim(); // e.g., "John Cain Arena, 5:30 pm"
        
        // Check if venueAndTime contains a comma (which would separate venue from time)
        const commaIndex = venueAndTime.lastIndexOf(',');
        if (commaIndex > 0) {
          const potentialVenue = venueAndTime.substring(0, commaIndex).trim();
          const potentialTime = venueAndTime.substring(commaIndex + 1).trim();
          
          // Check if the part after comma looks like a time (case-insensitive)
          if (potentialTime.match(/\d{1,2}:\d{2}\s*(AM|PM|am|pm)/i)) {
            venueRaw = potentialVenue;
            timeRaw = potentialTime;
          } else {
            // No time, entire thing is venue
            venueRaw = venueAndTime;
          }
        } else {
          // No comma, entire thing is venue
          venueRaw = venueAndTime;
        }
      } else {
        // Try Format 3: "vs/@ Opponent, Time" or "vs/@ Opponent" (no venue)
        matchupMatch = gamePart.match(/^(vs|@)\s+(.+?)(?:,\s+(.+))?$/i);
        if (!matchupMatch) return null;
        
        prefix = matchupMatch[1].toLowerCase() === 'vs' ? 'vs' : 'at';
        opponentRaw = matchupMatch[2].trim();
        const restAfterOpponent = matchupMatch[3]?.trim() || '';
        
        // Check if rest is time or venue
        if (restAfterOpponent) {
          // If it looks like a time (has : and AM/PM), it's time, otherwise venue
          if (restAfterOpponent.match(/\d{1,2}:\d{2}\s*(AM|PM|am|pm)/i)) {
            timeRaw = restAfterOpponent;
          } else {
            venueRaw = restAfterOpponent;
          }
        }
      }
    }
    
    const opponentDisplay = cleanOpponentName(opponentRaw);
    const resolvedTeam = resolveTeamName(teamDisplay, directory);
    const resolvedOpponent = resolveTeamName(opponentDisplay, directory);
    const simplifiedTeam = simplifyTeamName(resolvedTeam);
    const simplifiedOpponent = simplifyTeamName(resolvedOpponent);
    
    // Check if this is a New Zealand or Australian team (for timezone conversion)
    const isNewZealand = isNewZealandTeam(teamDisplay);
    const isAustralian = isAustralianTeam(teamDisplay);
    
    // Parse time - handle formats like "6:30 pm", "8:30 AM ET", "TBD"
    let timeSegment = 'TBD';
    let adjustedDate = date;
    let adjustedDateKey = dateKey;
    
    if (timeRaw) {
      // Normalize time format - handle "6:30 pm", "8:30 AM ET", etc.
      const timeMatch = timeRaw.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)(?:\s+(ET|AET|AEDT))?/i);
      if (timeMatch) {
        const [, hour, minute, period, tz] = timeMatch;
        const periodUpper = period.toUpperCase();
        
        // If timezone is already specified and it's ET, use as-is
        if (tz && tz.toUpperCase() === 'ET') {
          timeSegment = `${hour}:${minute} ${periodUpper} ET`;
        } else if (isNewZealand) {
          // For New Zealand teams, times are in NZST/NZDT - convert to ET
          let hours = Number.parseInt(hour, 10);
          const minutes = Number.parseInt(minute, 10);
          
          // Convert to 24-hour format
          if (periodUpper === 'PM' && hours !== 12) hours += 12;
          else if (periodUpper === 'AM' && hours === 12) hours = 0;
          
          // Convert from NZ time to ET (accounts for both NZ and US DST)
          const converted = convertNZToET(hours, minutes, date);
          
          // Format for display (12-hour format)
          let displayHours = converted.hours;
          let displayPeriod = 'AM';
          if (displayHours === 0) {
            displayHours = 12;
            displayPeriod = 'AM';
          } else if (displayHours === 12) {
            displayPeriod = 'PM';
          } else if (displayHours > 12) {
            displayHours -= 12;
            displayPeriod = 'PM';
          } else {
            displayPeriod = 'AM';
          }
          timeSegment = `${displayHours}:${converted.minutes.toString().padStart(2, '0')} ${displayPeriod} ET`;
          
          // Adjust date if conversion crossed midnight
          if (converted.dayOffset !== 0) {
            adjustedDate = new Date(date);
            adjustedDate.setDate(adjustedDate.getDate() + converted.dayOffset);
            adjustedDateKey = format(adjustedDate, 'yyyy-MM-dd');
          }
          
          // For ET times in early morning (12 AM - 3 AM), store under previous day
          if (converted.hours >= 0 && converted.hours < 3) {
            adjustedDate = new Date(adjustedDate || date);
            adjustedDate.setDate(adjustedDate.getDate() - 1);
            adjustedDateKey = format(adjustedDate, 'yyyy-MM-dd');
          }
        } else if (isAustralian) {
          // For Australian teams, times are in AET/AEDT - convert to ET
          let hours = Number.parseInt(hour, 10);
          const minutes = Number.parseInt(minute, 10);
          
          // Convert to 24-hour format
          if (periodUpper === 'PM' && hours !== 12) hours += 12;
          else if (periodUpper === 'AM' && hours === 12) hours = 0;
          
          // Convert from AET to ET
          const converted = convertAETToET(hours, minutes, date);
          
          // Format for display (12-hour format)
          let displayHours = converted.hours;
          let displayPeriod = 'AM';
          if (displayHours === 0) {
            displayHours = 12;
            displayPeriod = 'AM';
          } else if (displayHours === 12) {
            displayPeriod = 'PM';
          } else if (displayHours > 12) {
            displayHours -= 12;
            displayPeriod = 'PM';
          } else {
            displayPeriod = 'AM';
          }
          timeSegment = `${displayHours}:${converted.minutes.toString().padStart(2, '0')} ${displayPeriod} ET`;
          
          // Adjust date if conversion crossed midnight
          if (converted.dayOffset !== 0) {
            adjustedDate = new Date(date);
            adjustedDate.setDate(adjustedDate.getDate() + converted.dayOffset);
            adjustedDateKey = format(adjustedDate, 'yyyy-MM-dd');
          }
          
          // For ET times in early morning (12 AM - 3 AM), store under previous day
          // This ensures games appear on the correct calendar day for users in western US timezones
          // Example: Nov 15, 1:30 AM ET -> Nov 14, 10:30 PM PT, so should be on Nov 14 page
          if (converted.hours >= 0 && converted.hours < 3) {
            adjustedDate = new Date(adjustedDate || date);
            adjustedDate.setDate(adjustedDate.getDate() - 1);
            adjustedDateKey = format(adjustedDate, 'yyyy-MM-dd');
          }
        } else {
          // For non-Australian teams without ET suffix, add ET
          timeSegment = `${hour}:${minute} ${periodUpper} ET`;
        }
      } else if (timeRaw.toUpperCase().includes('TBD') || timeRaw.toUpperCase().includes('TBA')) {
        timeSegment = 'TBD';
      } else {
        // Try to parse as-is - if it already has ET, use it; otherwise add ET
        timeSegment = timeRaw.toUpperCase().includes('ET') ? timeRaw : `${timeRaw} ET`;
      }
    }
    
    // Parse time (don't pass isAustralian flag since we've already converted timeSegment)
    let { sortTimestamp, isoTime, status } = parseTime(timeSegment, false);
    
    // If we adjusted the date backwards for Australian/NZ games (early morning ET times),
    // we need to adjust the sortTimestamp to reflect end-of-day sorting
    // This ensures games like "1:30 AM ET" (which display as "10:30 PM PT") sort at the end of the previous day
    if ((isAustralian || isNewZealand) && adjustedDate && adjustedDate.getTime() < date.getTime() && sortTimestamp !== null) {
      // Add 24 hours worth of minutes to push it to the end of the day
      sortTimestamp = sortTimestamp + (24 * 60);
    }
    
    const venue = venueRaw || undefined;
    const locationType = determineLocationType(prefix, undefined);
    
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
    
    const tipoffTime = `${adjustedDateKey}T${isoTime}`;
    const timeKey = sortTimestamp === Number.MAX_SAFE_INTEGER ? 'TBD' : isoTime;
    const key = buildGameKey(adjustedDateKey, timeKey, homeTeamName, awayTeamName, venue);
    
    const homeTeamEntry = findTeamEntryInDirectory(directory, homeTeamName);
    const awayTeamEntry = findTeamEntryInDirectory(directory, awayTeamName);
    
    const game: AggregatedGameInternal = {
      id: `${adjustedDateKey}-${homeTeamName}-vs-${awayTeamName}`,
      date: tipoffTime,
      homeTeam: await createTeamInfo(homeTeamName, homeTeamEntry),
      awayTeam: await createTeamInfo(awayTeamName, awayTeamEntry),
      status,
      venue,
      prospects: [],
      homeProspects: [],
      awayProspects: [],
      tipoff: timeSegment,
      tv: undefined,
      note: undefined,
      highlight: undefined,
      dateKey: adjustedDateKey,
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
  }

  // Original em dash format
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

  // Check if this is a New Zealand or Australian team (for timezone conversion)
  const isNewZealand = isNewZealandTeam(teamDisplay);
  const isAustralian = isAustralianTeam(teamDisplay);
  const { sortTimestamp, isoTime, status } = parseTime(timeSegment, isAustralian || isNewZealand);

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
    homeTeam: await createTeamInfo(homeTeamName, homeTeamEntry),
    awayTeam: await createTeamInfo(awayTeamName, awayTeamEntry),
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

const parseScheduleFile = async (
  filePath: string,
  prospectsByRank: Map<number, Prospect>,
  directory: Map<string, TeamDirectoryEntry>
): Promise<ParsedScheduleEntry[]> => {
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
    try {
      const parsed = await parseLine(line, teamDisplayName, prospect, directory);
      if (parsed) {
        scheduleEntries.push(parsed);
      }
    } catch (error) {
      console.error(`[Schedule] Failed to parse line in ${filePath}:`, line, error);
      // Continue processing other lines even if one fails
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

  // Fetch all team rosters in parallel
  await Promise.all(
    Array.from(teamToProspects.entries()).map(async ([teamId, prospects]) => {
      const rosterMap = await getRosterForTeam(teamId);
      if (!rosterMap.size) return;

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
    })
  );
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

  // Fetch all scoreboard events in parallel
  const dateKeys = Array.from(gamesByDate.keys());
  const eventsByDateResults = await Promise.allSettled(
    dateKeys.map(async (dateKey) => {
      const events = await fetchScoreboardEvents(dateKey);
      return { dateKey, events };
    })
  );

  // Process results
  for (const result of eventsByDateResults) {
    if (result.status === 'fulfilled') {
      const { dateKey, events } = result.value;
      if (!events.length) continue;

      const games = gamesByDate.get(dateKey);
      if (!games) continue;

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

         // Only update team names if they match (to prevent overwriting with wrong team)
         // Use the improved matching logic to verify the teams match
         const gameHomeKeys = getTeamKeysFromTeamInfo(game.homeTeam);
         const gameAwayKeys = getTeamKeysFromTeamInfo(game.awayTeam);
         const compHomeKeys = getTeamKeysFromCompetitionTeam(homeComp?.team);
         const compAwayKeys = getTeamKeysFromCompetitionTeam(awayComp?.team);
         
         // Verify home team matches before updating
         if (homeComp?.team?.location && hasIntersection(gameHomeKeys, compHomeKeys)) {
           game.homeTeam.displayName = homeComp.team.location;
           game.homeTeam.name = homeComp.team.location;
         }
         // Verify away team matches before updating
         if (awayComp?.team?.location && hasIntersection(gameAwayKeys, compAwayKeys)) {
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

const buildSchedules = async (source: RankingSource = 'espn'): Promise<LoadedSchedules> => {
  const prospectsByRank = getProspectsByRank(source);
  const teamDirectory = await getTeamDirectory();

  await ensureJerseyData(prospectsByRank, teamDirectory);

  const rootDir = process.cwd();
  const files = fs.readdirSync(rootDir).filter((file) => file.endsWith(SCHEDULE_SUFFIX));
  
  console.log(`[Schedule] Found ${files.length} schedule files in ${rootDir}`);
  if (files.length === 0) {
    console.warn(`[Schedule] No schedule files found! Looking for files ending with "${SCHEDULE_SUFFIX}"`);
    const allTxtFiles = fs.readdirSync(rootDir).filter((file) => file.endsWith('.txt'));
    console.log(`[Schedule] Found ${allTxtFiles.length} .txt files total. First 5:`, allTxtFiles.slice(0, 5));
  }

  const aggregatedGames = new Map<string, AggregatedGameInternal>();

  for (const file of files) {
    const filePath = path.join(rootDir, file);
    try {
      const entries = await parseScheduleFile(filePath, prospectsByRank, teamDirectory);
      console.log(`[Schedule] Parsed ${file}: ${entries.length} entries`);

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
    } catch (error) {
      console.error(`[Schedule] Failed to parse schedule file ${filePath}:`, error);
      // Continue processing other files even if one fails
    }
  }
  
  console.log(`[Schedule] Total aggregated games: ${aggregatedGames.size}`);

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

  console.log(`[Schedule] Final result: ${allGames.length} total games across ${Object.keys(gamesByDate).length} dates (source: ${source})`);
  if (allGames.length === 0) {
    console.warn(`[Schedule] WARNING: No games loaded! Check logs above for errors.`);
  }

  return {
    gamesByDate,
    allGames,
    source,
  };
};

export const loadAllSchedules = async (source: RankingSource = 'espn', forceReload = false): Promise<LoadedSchedules> => {
  // Check if cache should be invalidated due to file changes
  if (shouldInvalidateCache() || forceReload) {
    clearScheduleCache(source);
  }
  
  if (cachedSchedules[source]) {
    return cachedSchedules[source]!;
  }

  if (buildPromises[source]) {
    return buildPromises[source]!;
  }

  buildPromises[source] = (async () => {
    try {
      const result = await buildSchedules(source);
      cachedSchedules[source] = result;
      cacheTimestamp = Date.now();
      return result;
    } finally {
      buildPromises[source] = null;
    }
  })();

  return buildPromises[source]!;
};

export const getGamesBetween = async (startDate: string, endDate: string, source: RankingSource = 'espn'): Promise<Record<string, GameWithProspects[]>> => {
  const { gamesByDate } = await loadAllSchedules(source);
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

export const getGamesForDate = async (date: string, source: RankingSource = 'espn'): Promise<GameWithProspects[]> => {
  const { gamesByDate } = await loadAllSchedules(source);
  return gamesByDate[date] ?? [];
};

