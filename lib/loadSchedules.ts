import fs from 'fs';
import path from 'path';
import { parse, format } from 'date-fns';
import type { Prospect } from '@/app/types/prospect';
import type { GameWithProspects, TeamInfo } from '@/app/utils/gameMatching';
import { getProspectsByRank, type RankingSource, loadCustomPlayers } from './loadProspects';
import { batchPromises, batchPromisesSettled } from './batchPromises';
import { supabaseAdmin, getSupabaseUserId } from './supabase';
import { fetchProspectScheduleFromESPN, clearESPNScheduleCache } from './loadSchedulesFromESPN';
import { fetchNBLProspectSchedule, getNBLTeamId, isNBLProspect } from './loadNBLFromESPN';
import { canUseInternationalScraper } from './loadInternationalFromScrapers';
import { fetchProspectScheduleFromApiBasketball, canUseApiBasketball } from './loadSchedulesFromApiBasketball';
import { getManualInjuryStatus } from './manualInjuries';

export interface ParsedScheduleEntry {
  key: string;
  game: AggregatedGameInternal;
  prospect: Prospect;
  prospectSide: 'home' | 'away';
}

export interface AggregatedGameInternal extends GameWithProspects {
  sortTimestamp: number | null;
  _prospectRanks: Set<number>; // Keep for backwards compatibility
  _homeProspectRanks: Set<number>; // Keep for backwards compatibility
  _awayProspectRanks: Set<number>; // Keep for backwards compatibility
  _prospectIds?: Set<string>; // Use IDs instead of ranks for proper deduplication
  _homeProspectIds?: Set<string>;
  _awayProspectIds?: Set<string>;
}

export interface TeamDirectoryEntry {
  id: string;
  displayName: string;
  shortDisplayName?: string;
  name?: string;
  nickname?: string;
  location?: string;
  slug?: string;
  logo?: string;
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
    // Clear team ID cache when schedules are cleared
    teamIdCache.clear();
  }
};

// Check if any schedule file has been modified since cache was created
const shouldInvalidateCache = (): boolean => {
  if (!cacheTimestamp) return false;
  
  try {
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
  } catch (error) {
    // On Vercel/serverless, fs operations may fail - don't invalidate cache
    console.log('[Schedule] shouldInvalidateCache: fs error (expected on Vercel), skipping cache check');
    return false;
  }
};

// Force cache invalidation for testing - touch a schedule file to trigger rebuild
export const forceCacheInvalidation = () => {
  try {
    const rootDir = process.cwd();
    const testFile = path.join(rootDir, 'ognjen_srzentic_schedule.txt');
    if (fs.existsSync(testFile)) {
      const now = new Date();
      fs.utimesSync(testFile, now, now);
      console.log('[Schedule] Forced cache invalidation by touching schedule file');
    }
  } catch (error) {
    // On Vercel/serverless, fs operations may fail - just clear the cache
    console.log('[Schedule] forceCacheInvalidation: fs error (expected on Vercel)');
  }
  clearScheduleCache();
};

// TeamDirectoryEntry moved above as exported interface

let teamDirectoryCache: Map<string, TeamDirectoryEntry> | null = null;
const jerseyCache = new Map<string, Map<string, RosterData>>();
const scoreboardCache = new Map<string, any[]>();
const SCOREBOARD_GROUPS = '50';

// Clear jersey cache to ensure fresh data (including manual injuries)
export const clearJerseyCache = () => {
  jerseyCache.clear();
};

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
  
  // Serbian ABA League - Mega Superbet / Mega Basket
  // Note: SVG files from Wikimedia Commons - high quality vector graphics
  'megasuperbet': '/logos/mega-superbet.png',
  'mega': '/logos/mega-superbet.png',
  'megabasket': '/logos/mega-superbet.png',
  
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

export const sanitizeKey = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Normalize team names for consistent game key generation
// This ensures "Valencia Basket" and "Valencia Basket Club" create the same key
// Also used for merge key generation to ensure consistency
export const normalizeTeamNameForKey = (name: string): string => {
  let normalized = name
    .replace(/\s+(spartans|bears|lions|tigers|wildcats|bulldogs|eagles|hawks|owls|panthers|warriors|knights|pirates|raiders|cougars|hornets|jayhawks|tar heels|blue devils|crimson tide|fighting irish|wolverines|seminoles|crimson|tide|fighting|irish)$/i, '')
    .trim();
  
  // Normalize international team name variations
  normalized = normalized
    .replace(/\s*(basket|basketball|club|cb|bc)$/i, '') // Remove common suffixes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return normalized;
};

/**
 * Check if two team names match, handling known variations (e.g., ASVEL/Lyon-Villeurbanne)
 * This is stricter than simple string matching - it requires exact matches or known variations
 */
export const teamNamesMatch = (name1: string, name2: string): boolean => {
  const normalized1 = normalizeTeamNameForKey(name1);
  const normalized2 = normalizeTeamNameForKey(name2);
  const key1 = sanitizeKey(normalized1);
  const key2 = sanitizeKey(normalized2);
  
  // Exact match after normalization
  if (key1 === key2) return true;
  
  // Handle known team name variations (only for international teams)
  const teamVariations: Record<string, string[]> = {
    'asvel': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket'],
    'lyonvilleurbanne': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket'],
    'valencia': ['valencia', 'valenciabasket', 'valenciabasketclub'],
    'joventut': ['joventut', 'joventutbadalona', 'cjbjoventutbadalona'],
    'paris': ['paris', 'parisbasketball', 'parisbasket'],
  };
  
  // Check if either name matches any variation of the other
  const baseKey1 = key1.split('-')[0];
  const baseKey2 = key2.split('-')[0];
  
  const variations1 = teamVariations[baseKey1] || [];
  const variations2 = teamVariations[baseKey2] || [];
  
  // Only check variations if both teams have known variations (international teams)
  if (variations1.length > 0 && variations2.length > 0) {
    // Check if any variation matches exactly
    for (const v1 of variations1) {
      for (const v2 of variations2) {
        if (v1 === v2) {
          return true;
        }
      }
    }
    
    // For international teams, allow partial matches but only if one is clearly a prefix
    // e.g., "valencia" should match "valenciabasket" but not "valenciabasketclub" unless it's in variations
    const sanitizedV1 = variations1.map(v => sanitizeKey(v));
    const sanitizedV2 = variations2.map(v => sanitizeKey(v));
    
    for (const v1 of sanitizedV1) {
      for (const v2 of sanitizedV2) {
        // Only match if one starts with the other (prefix match), not substring match
        if (v1.startsWith(v2) || v2.startsWith(v1)) {
          return true;
        }
      }
    }
  }
  
  // For college teams and other teams without known variations, require exact match only
  // This prevents "Michigan" from matching "Michigan State" or "Kansas" from matching "Arkansas"
  return false;
};

export const buildGameKey = (
  dateKey: string,
  timeKey: string,
  teamA: string,
  teamB: string,
  venue?: string,
  leagueOrSource?: string
): string => {
  // Normalize team names before sanitizing to ensure consistent keys
  const normalizedA = normalizeTeamNameForKey(teamA);
  const normalizedB = normalizeTeamNameForKey(teamB);
  const teams = [sanitizeKey(normalizedA), sanitizeKey(normalizedB)]
    .sort()
    .join('__');
  const venueKey = venue ? sanitizeKey(venue) : 'no-venue';
  const tipoffKey = timeKey || 'tbd';
  
  // Include league/source to prevent merging games from different leagues with same team names
  // e.g., "Partizan" in EuroLeague vs "Partizan" in Australian NBL
  const leagueKey = leagueOrSource ? sanitizeKey(leagueOrSource) : '';
  
  return leagueKey 
    ? `${dateKey}__${tipoffKey}__${teams}__${venueKey}__${leagueKey}`
    : `${dateKey}__${tipoffKey}__${teams}__${venueKey}`;
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

// Cache for team name -> team ID lookups to avoid repeated database queries
const teamIdCache = new Map<string, string | undefined>();

/**
 * Looks up team ID from database by team name (for NCAA/NBL teams)
 * This ensures games loaded from files can merge with games loaded from database
 */
async function lookupTeamIdFromDatabase(teamName: string): Promise<string | undefined> {
  // Check cache first
  const cacheKey = teamName.toLowerCase().trim();
  if (teamIdCache.has(cacheKey)) {
    return teamIdCache.get(cacheKey);
  }
  
  try {
    // Try to find team ID from ncaa_team_schedules or nbl_team_schedules
    // Search by team name (home_team_name or away_team_name)
    // Use DISTINCT ON to get unique team IDs
    const normalizedName = normalizeTeamNameForKey(teamName);
    
    // Try NCAA first - get a unique team ID where the team name matches
    const { data: ncaaGames } = await supabaseAdmin
      .from('ncaa_team_schedules')
      .select('home_team_id, away_team_id, home_team_name, away_team_name')
      .or(`home_team_name.ilike.%${teamName}%,away_team_name.ilike.%${teamName}%`)
      .limit(10); // Get a few games to find matching team ID
    
    if (ncaaGames && ncaaGames.length > 0) {
      for (const game of ncaaGames) {
        const homeNormalized = normalizeTeamNameForKey(game.home_team_name || '');
        const awayNormalized = normalizeTeamNameForKey(game.away_team_name || '');
        
        if (homeNormalized === normalizedName && game.home_team_id) {
          teamIdCache.set(cacheKey, game.home_team_id);
          return game.home_team_id;
        } else if (awayNormalized === normalizedName && game.away_team_id) {
          teamIdCache.set(cacheKey, game.away_team_id);
          return game.away_team_id;
        }
      }
    }
    
    // Try NBL
    const { data: nblGames } = await supabaseAdmin
      .from('nbl_team_schedules')
      .select('home_team_id, away_team_id, home_team_name, away_team_name')
      .or(`home_team_name.ilike.%${teamName}%,away_team_name.ilike.%${teamName}%`)
      .limit(10);
    
    if (nblGames && nblGames.length > 0) {
      for (const game of nblGames) {
        const homeNormalized = normalizeTeamNameForKey(game.home_team_name || '');
        const awayNormalized = normalizeTeamNameForKey(game.away_team_name || '');
        
        if (homeNormalized === normalizedName && game.home_team_id) {
          teamIdCache.set(cacheKey, game.home_team_id);
          return game.home_team_id;
        } else if (awayNormalized === normalizedName && game.away_team_id) {
          teamIdCache.set(cacheKey, game.away_team_id);
          return game.away_team_id;
        }
      }
    }
    
    // Cache undefined result to avoid repeated queries
    teamIdCache.set(cacheKey, undefined);
    return undefined;
  } catch (error) {
    // Silently fail - this is a fallback lookup
    teamIdCache.set(cacheKey, undefined);
    return undefined;
  }
}

export const createTeamInfo = async (displayName: string, teamEntry?: TeamDirectoryEntry): Promise<TeamInfo> => {
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
    
    // Determine team ID: use directory entry first, then try database lookup as fallback
    let teamId = teamEntry?.id;
    if (!teamId) {
      // Try to look up team ID from database (for NCAA/NBL teams)
      // This ensures games loaded from files can merge with games loaded from database
      teamId = await lookupTeamIdFromDatabase(displayName);
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
      if (!teamEntry?.id && teamId) {
        console.log(`[TeamID] Found team ID from database for "${displayName}": ${teamId}`);
      }
    }
    
    // Priority: overrideLogo > internationalLogo > teamEntry?.logo
    // This ensures international teams get their logos even if they match ESPN directory
    const finalLogo = overrideLogo || internationalLogo || teamEntry?.logo;
    
    return {
      name: displayName,
      displayName,
      logo: finalLogo,
      id: teamId, // Use team ID from directory OR database lookup
    };
  } catch (error) {
    // If anything fails, return team info without logo rather than throwing
    console.error(`[Logo] Error creating team info for ${displayName}:`, error);
    
    // Try database lookup even in error case
    let teamId = teamEntry?.id;
    if (!teamId) {
      teamId = await lookupTeamIdFromDatabase(displayName);
    }
    
    return {
      name: displayName,
      displayName,
      logo: teamEntry?.logo,
      id: teamId, // Use team ID from directory OR database lookup
    };
  }
};

export const simplifyTeamName = (value: string): string => {
  return value.trim();
};
export const normalizeForLookup = (value: string): string =>
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

export const getTeamDirectory = async (): Promise<Map<string, TeamDirectoryEntry>> => {
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

export const findTeamEntryInDirectory = (
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

interface RosterData {
  jersey: string;
  injuryStatus?: 'OUT' | 'QUESTIONABLE' | 'DOUBTFUL' | 'PROBABLE';
}

const getRosterForTeam = async (teamId: string): Promise<Map<string, RosterData>> => {
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

  const rosterMap = new Map<string, RosterData>();

  for (const athlete of athletes) {
    const fullName: string | undefined = athlete?.fullName ?? athlete?.displayName;
    const jersey: string | number | undefined = athlete?.jersey ?? athlete?.uniform;
    if (!fullName || jersey == null) continue;

    // Check for injury status
    // ESPN API may have injury info in various fields: injury, injuries (array), status, availability, etc.
    let injuryStatus: 'OUT' | 'QUESTIONABLE' | 'DOUBTFUL' | 'PROBABLE' | undefined;
    const injury = athlete?.injury;
    const injuries = athlete?.injuries; // Array of injuries
    const status = athlete?.status;
    const availability = athlete?.availability;
    
    // Debug logging to see what ESPN API returns for injury data
    if (process.env.NODE_ENV === 'development') {
      if (injury || injuries?.length || status || availability) {
        console.log(`[ESPN API] Player: ${fullName}, injury:`, injury, 'injuries:', injuries, 'status:', status, 'availability:', availability);
      }
    }
    
    // Check injuries array (ESPN may store injuries here)
    if (injuries && Array.isArray(injuries) && injuries.length > 0) {
      // Check each injury in the array
      for (const inj of injuries) {
        const injuryText = (inj.status || inj.type || inj.name || inj.displayName || '').toUpperCase();
        if (injuryText.includes('OUT') || injuryText === 'OUT') {
          injuryStatus = 'OUT';
          break;
        } else if (injuryText.includes('QUESTIONABLE')) {
          injuryStatus = 'QUESTIONABLE';
        } else if (injuryText.includes('DOUBTFUL')) {
          injuryStatus = 'DOUBTFUL';
        } else if (injuryText.includes('PROBABLE')) {
          injuryStatus = 'PROBABLE';
        }
      }
    }
    
    // Check various possible injury status fields
    if (injury) {
      const injuryStatusText = (injury.status || injury.type || injury.name || '').toUpperCase();
      if (injuryStatusText.includes('OUT')) {
        injuryStatus = 'OUT';
      } else if (injuryStatusText.includes('QUESTIONABLE')) {
        injuryStatus = 'QUESTIONABLE';
      } else if (injuryStatusText.includes('DOUBTFUL')) {
        injuryStatus = 'DOUBTFUL';
      } else if (injuryStatusText.includes('PROBABLE')) {
        injuryStatus = 'PROBABLE';
      }
    }
    
    if (status) {
      const statusText = (status.type || status.name || status.displayName || '').toUpperCase();
      if (statusText.includes('OUT') || statusText === 'OUT') {
        injuryStatus = 'OUT';
      } else if (statusText.includes('QUESTIONABLE')) {
        injuryStatus = 'QUESTIONABLE';
      } else if (statusText.includes('DOUBTFUL')) {
        injuryStatus = 'DOUBTFUL';
      } else if (statusText.includes('PROBABLE')) {
        injuryStatus = 'PROBABLE';
      }
    }
    
    if (availability) {
      const availText = (availability.type || availability.name || availability.displayName || '').toUpperCase();
      if (availText.includes('OUT') || availText === 'OUT') {
        injuryStatus = 'OUT';
      } else if (availText.includes('QUESTIONABLE')) {
        injuryStatus = 'QUESTIONABLE';
      } else if (availText.includes('DOUBTFUL')) {
        injuryStatus = 'DOUBTFUL';
      } else if (availText.includes('PROBABLE')) {
        injuryStatus = 'PROBABLE';
      }
    }
    
    // Also check for common injury-related fields
    if (!injuryStatus) {
      const athleteStatus = (athlete?.status?.type || athlete?.status?.name || '').toUpperCase();
      if (athleteStatus.includes('OUT') || athleteStatus.includes('INJURED')) {
        injuryStatus = 'OUT';
      }
    }
    
    // Check manual injury override (ESPN API doesn't expose injury data, so we use manual list)
    if (!injuryStatus) {
      const manualStatus = getManualInjuryStatus(fullName);
      if (manualStatus) {
        injuryStatus = manualStatus;
        if (process.env.NODE_ENV === 'development') {
          console.log(`[ESPN API] Using manual injury status for ${fullName}: ${manualStatus}`);
        }
      }
    }

    const variants = createNameVariants(fullName);
    for (const variant of variants) {
      if (!rosterMap.has(variant)) {
        rosterMap.set(variant, {
          jersey: String(jersey),
          injuryStatus,
        });
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

// Normalize team name by removing common suffixes (e.g., "Spartans", "Bears")
// This ensures "Michigan State Spartans" becomes "Michigan State" before directory lookup
const normalizeTeamNameForResolve = (name: string): string => {
  return name
    .replace(/\s+(spartans|bears|lions|tigers|wildcats|bulldogs|eagles|hawks|owls|panthers|warriors|knights|pirates|raiders|cougars|hornets|jayhawks|tar heels|blue devils|crimson tide|fighting irish)$/i, '')
    .trim();
};

export const resolveTeamName = (
  rawName: string,
  directory: Map<string, TeamDirectoryEntry>
): string => {
  // Normalize team name first to remove suffixes before directory lookup
  // This ensures "Michigan State Spartans" and "Michigan State" both resolve to the same entry
  const normalizedName = normalizeTeamNameForResolve(rawName);
  const entry = findTeamEntryInDirectory(directory, normalizedName);
  if (entry) {
    // Prefer location (e.g., "Arizona", "Washington") over full display name
    // This ensures consistent team names across the app
    const resolved = entry.location ||
      entry.shortDisplayName ||
      entry.displayName ||
      normalizedName;
    
    // Normalize again to ensure any remaining suffixes are removed
    // (in case directory returned a name with suffix)
    return normalizeTeamNameForResolve(resolved);
  }
  // If not found, return normalized name (without suffix)
  return normalizedName;
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
    
    let prefix: 'vs' | 'at';
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
    // ESPN college schedules - use 'ncaa' as league identifier
    const key = buildGameKey(adjustedDateKey, timeKey, homeTeamName, awayTeamName, venue, 'ncaa');
    
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
  // ESPN college schedules - use 'ncaa' as league identifier
  const key = buildGameKey(dateKey, timeKey, homeTeamName, awayTeamName, venue, 'ncaa');

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

  // Initialize ID sets if not present
  if (!target._prospectIds) target._prospectIds = new Set();
  if (!target._homeProspectIds) target._homeProspectIds = new Set();
  if (!target._awayProspectIds) target._awayProspectIds = new Set();

  // Create unique ID for prospect (use name+team as identifier)
  // Use teamDisplay as fallback if team is empty (some prospects only have teamDisplay)
  const prospectTeamForId = prospect.team || prospect.teamDisplay || '';
  const prospectId = `${prospect.name}|${prospectTeamForId}`;

  // Helper to replace prospect if incoming is watchlist and existing is not
  const replaceIfWatchlist = (prospectsArray: Prospect[], prospectId: string, newProspect: Prospect) => {
    const existingIndex = prospectsArray.findIndex(p => `${p.name}|${p.team}` === prospectId);
    if (existingIndex !== -1) {
      const existing = prospectsArray[existingIndex];
      // If incoming prospect is watchlist and existing is not, replace it
      if (newProspect.isWatchlist && !existing.isWatchlist) {
        prospectsArray[existingIndex] = { ...newProspect, injuryStatus: newProspect.injuryStatus };
        return true; // Replaced
      }
      // If both are watchlist or both are not, don't add duplicate
      return false; // Already exists, don't add
    }
    return null; // Doesn't exist yet, can add
  };

  // Use ID-based deduplication, but prioritize watchlist prospects
  const replacedInMain = replaceIfWatchlist(target.prospects, prospectId, prospect);
  if (replacedInMain === null) {
    // Doesn't exist yet, add it
    target._prospectIds.add(prospectId);
    target._prospectRanks.add(prospect.rank); // Keep for backwards compatibility
    target.prospects.push({ ...prospect, injuryStatus: prospect.injuryStatus });
  } else if (replacedInMain) {
    // Replaced existing, update the ID set
    target._prospectIds.add(prospectId);
    target._prospectRanks.add(prospect.rank);
  }
  // If replacedInMain === false, prospect already exists and wasn't replaced (both have same watchlist status)

  if (prospectSide === 'home') {
    const replacedInHome = replaceIfWatchlist(target.homeProspects, prospectId, prospect);
    if (replacedInHome === null) {
      target._homeProspectIds.add(prospectId);
      target._homeProspectRanks.add(prospect.rank); // Keep for backwards compatibility
      target.homeProspects.push({ ...prospect, injuryStatus: prospect.injuryStatus });
    } else if (replacedInHome) {
      target._homeProspectIds.add(prospectId);
      target._homeProspectRanks.add(prospect.rank);
    }
  } else {
    const replacedInAway = replaceIfWatchlist(target.awayProspects, prospectId, prospect);
    if (replacedInAway === null) {
      target._awayProspectIds.add(prospectId);
      target._awayProspectRanks.add(prospect.rank); // Keep for backwards compatibility
      target.awayProspects.push({ ...prospect, injuryStatus: prospect.injuryStatus });
    } else if (replacedInAway) {
      target._awayProspectIds.add(prospectId);
      target._awayProspectRanks.add(prospect.rank);
    }
  }
  
  // Debug log for injury status
  if (prospect.injuryStatus === 'OUT') {
    console.log(`[Schedule] Merged prospect "${prospect.name}" with injury status OUT into game`);
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

  // First try to find prospect by rank
  let prospect = prospectsByRank.get(rank);
  
  // If not found by rank, try to find custom player by name and team
  // This allows custom players to match schedule files even without matching rank
  if (!prospect && headerInfo) {
    const normalizedHeaderTeam = normalizeTeamNameForResolve(headerInfo.teamDisplay);
    const resolvedHeaderTeam = resolveTeamName(normalizedHeaderTeam, directory);
    
    // Search all prospects for a custom player matching name and team
    for (const [prospectRank, p] of prospectsByRank.entries()) {
      // Check if this is likely a custom player (has a high rank that might not match schedule files)
      // Match by name from header and team
      const normalizedProspectTeam = normalizeTeamNameForResolve(p.teamDisplay || p.team || '');
      const resolvedProspectTeam = resolveTeamName(normalizedProspectTeam, directory);
      
      if (p.name === headerInfo.name && resolvedProspectTeam === resolvedHeaderTeam) {
        prospect = p;
        console.log(`[Schedule] Matched custom player "${p.name}" to schedule file by name/team (rank ${prospectRank} vs file rank ${rank})`);
        break;
      }
    }
  }
  
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

  // Fetch team rosters in batches to avoid overwhelming ESPN API (was causing 30s+ load times)
  const teamEntries = Array.from(teamToProspects.entries());
  console.log(`[Schedule] Fetching rosters for ${teamEntries.length} teams in batches...`);
  
  await batchPromises(
    teamEntries,
    async ([teamId, prospects]) => {
      const rosterMap = await getRosterForTeam(teamId);
      if (!rosterMap.size) return;

      for (const prospect of prospects) {
        const variants = createNameVariants(prospect.name);
        let foundInRoster = false;
        for (const variant of variants) {
          const rosterData = rosterMap.get(variant);
          if (rosterData) {
            foundInRoster = true;
            if (!prospect.jersey) {
              prospect.jersey = rosterData.jersey;
            }
            if (rosterData.injuryStatus && !prospect.injuryStatus) {
              prospect.injuryStatus = rosterData.injuryStatus;
            }
            break;
          }
        }
        
        // ALWAYS check manual injury override (manual takes precedence over roster data)
        const manualStatus = getManualInjuryStatus(prospect.name);
        if (manualStatus) {
          prospect.injuryStatus = manualStatus;
          console.log(`[Schedule] ✓ Applied manual injury status to "${prospect.name}": ${manualStatus}`);
        } else if (!prospect.injuryStatus && foundInRoster) {
          // If no manual status and found in roster, use roster injury status
          const rosterData = rosterMap.get(prospect.name) || Array.from(rosterMap.entries()).find(([key]) => 
            createNameVariants(prospect.name).includes(key)
          )?.[1];
          if (rosterData?.injuryStatus) {
            prospect.injuryStatus = rosterData.injuryStatus;
          }
        }
      }
    },
    5 // Process 5 teams at a time
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

  // Fetch scoreboard events in batches to avoid overwhelming ESPN API (was causing 30s+ load times)
  const dateKeys = Array.from(gamesByDate.keys());
  console.log(`[Schedule] Fetching scoreboards for ${dateKeys.length} dates in batches...`);
  
  const eventsByDateResults = await batchPromisesSettled(
    dateKeys,
    async (dateKey) => {
      const events = await fetchScoreboardEvents(dateKey);
      return { dateKey, events };
    },
    10 // Process 10 dates at a time
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
         
         // Store debug flag for logging at end
         const isDaytonVirginiaEnrich = (game.homeTeam.name?.toLowerCase().includes('dayton') && game.awayTeam.name?.toLowerCase().includes('virginia')) ||
                                        (game.homeTeam.name?.toLowerCase().includes('virginia') && game.awayTeam.name?.toLowerCase().includes('dayton')) ||
                                        (homeComp?.team?.location?.toLowerCase().includes('dayton') && awayComp?.team?.location?.toLowerCase().includes('virginia')) ||
                                        (homeComp?.team?.location?.toLowerCase().includes('virginia') && awayComp?.team?.location?.toLowerCase().includes('dayton'));
         
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
        
        // CRITICAL: Log ESPN API data at the END of enrichment (so it appears at bottom of terminal)
        if (isDaytonVirginiaEnrich) {
          console.log(`\n[Schedule] 📡 ESPN API DATA for Dayton/Virginia (at end of enrichment):`);
          console.log(`[Schedule]   ESPN says: ${homeComp?.team?.location} (home) vs ${awayComp?.team?.location} (away)`);
          console.log(`[Schedule]   Game AFTER enrichment: ${game.homeTeam.name} (home) vs ${game.awayTeam.name} (away)`);
          console.log(`[Schedule]   Home match: ${hasIntersection(gameHomeKeys, compHomeKeys)}`);
          console.log(`[Schedule]   Away match: ${hasIntersection(gameAwayKeys, compAwayKeys)}`);
          console.log(`[Schedule]   Home updated: ${homeComp?.team?.location && hasIntersection(gameHomeKeys, compHomeKeys)}`);
          console.log(`[Schedule]   Away updated: ${awayComp?.team?.location && hasIntersection(gameAwayKeys, compAwayKeys)}`);
          console.log(`[Schedule] 📡 END ESPN API DATA LOG\n`);
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
    // Live game status fields
    clock: game.clock,
    period: game.period,
    statusDetail: game.statusDetail,
    // ESPN game ID for live score fetching
    espnId: game.espnId,
  };
};

const loadInternationalRosterGames = async (
  clerkUserId: string,
  prospectsByRank: Map<number, Prospect>,
  teamDirectory: Map<string, TeamDirectoryEntry>
): Promise<ParsedScheduleEntry[]> => {
  try {
    const supabaseUserId = await getSupabaseUserId(clerkUserId);
    if (!supabaseUserId) {
      return [];
    }

    // Get all prospects for this user from their rankings
    const { data: rankings, error: rankingsError } = await supabaseAdmin
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

    if (rankingsError || !rankings || rankings.length === 0) {
      return [];
    }

    // Filter for international players (have international_team_id)
    // Include both 'international-roster' and 'external' sources since external players
    // may have international_team_id from backfill
    const internationalProspects = rankings.filter(
      (r: any) => r.prospects?.international_team_id
    );

    if (internationalProspects.length === 0) {
      return [];
    }

    // Get all team IDs
    const teamIds = internationalProspects.map((r: any) => r.prospects.international_team_id);

    // Fetch all games for these teams from international_team_schedules
    const { data: gamesData, error: gamesError } = await supabaseAdmin
      .from('international_team_schedules')
      .select('*')
      .in('team_id', teamIds)
      .order('date', { ascending: true });

    if (gamesError || !gamesData || gamesData.length === 0) {
      return [];
    }

    // Create entries for each game
    // Group games by unique game key first to avoid duplicates
    const gamesMap = new Map<string, { gameData: any; teamRankings: any[] }>();
    
    for (const gameData of gamesData) {
      // Find ALL prospects for this team (not just one)
      const teamRankings = internationalProspects.filter(
        (r: any) => r.prospects.international_team_id === gameData.team_id
      );
      
      if (teamRankings.length === 0) continue;
      
      // Build game key to group duplicate games
      const gameDate = new Date(gameData.date);
      const dateKey = gameDate.toISOString().split('T')[0];
      const hours = gameDate.getUTCHours();
      const minutes = gameDate.getUTCMinutes();
      const isoTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
      const sourceIdentifier = `intl-${gameData.league_id || 'unknown'}`;
      const key = buildGameKey(
        dateKey,
        isoTime,
        gameData.home_team_name,
        gameData.away_team_name,
        gameData.venue || undefined,
        sourceIdentifier
      );
      
      // Get or create game entry
      const existing = gamesMap.get(key);
      if (existing) {
        // Merge team rankings (add any new prospects for this team)
        for (const ranking of teamRankings) {
          if (!existing.teamRankings.some((r: any) => r.prospects?.id === (ranking as any).prospects?.id)) {
            existing.teamRankings.push(ranking);
          }
        }
      } else {
        gamesMap.set(key, { gameData, teamRankings });
      }
    }
    
    // Now create entries for each unique game with all prospects
    const entries: ParsedScheduleEntry[] = [];
    
    for (const { gameData, teamRankings } of gamesMap.values()) {
      // Create an entry for each prospect on this team
      for (const ranking of teamRankings) {
        const prospectData: any = ranking.prospects;
      
      // Find the prospect by matching name and team (flexible matching)
      let prospect: Prospect | undefined;
      const searchName = prospectData.full_name.toLowerCase().trim();
      const searchTeam = prospectData.team_name.toLowerCase().trim();
      
      for (const [rank, p] of prospectsByRank.entries()) {
        const pName = (p.name || '').toLowerCase().trim();
        const pTeam = (p.team || '').toLowerCase().trim();
        
        if (pName === searchName && pTeam === searchTeam) {
          prospect = p;
          break;
        }
      }

      if (!prospect) {
        console.warn(`[loadInternationalRosterGames] Prospect not found: ${prospectData.full_name} (${prospectData.team_name})`);
        continue;
      }

      // Parse date (reuse from gameData)
      const gameDate = new Date(gameData.date);
      const dateKey = gameDate.toISOString().split('T')[0]; // YYYY-MM-DD format

      // Parse time for sortTimestamp
      const hours = gameDate.getUTCHours();
      const minutes = gameDate.getUTCMinutes();
      const sortTimestamp = hours * 60 + minutes;
      const isoTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

      // Determine prospect side by checking which team ID matches
      // gameData.team_id is the team this schedule entry is for
      const isHome = gameData.home_team_id === gameData.team_id;
      const isAway = gameData.away_team_id === gameData.team_id;
      const prospectSide: 'home' | 'away' = isHome ? 'home' : (isAway ? 'away' : (gameData.location_type === 'home' ? 'home' : 'away'));

      // Build game key (same format as other games) - reuse the key from grouping
      const sourceIdentifier = `intl-${gameData.league_id || 'unknown'}`;
      const key = buildGameKey(
        dateKey,
        isoTime,                    // timeKey
        gameData.home_team_name,    // teamA (home)
        gameData.away_team_name,    // teamB (away)
        gameData.venue || undefined, // venue
        sourceIdentifier            // leagueOrSource
      );

      // Create game object
      const prospectId = `${prospect.name}|${prospect.team}`;
      
      // Use full ISO timestamp for proper timezone-aware sorting on client
      // gameData.date from DB is already in UTC format (e.g., "2025-12-13T16:00:00+00:00")
      const fullISODate = gameDate.toISOString(); // Converts to UTC ISO string
      
      // Format tipoff in ET timezone for consistency with NCAA games
      const tipoffInET = gameDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York'
      }) + ' ET';
      
      const game: AggregatedGameInternal = {
        id: gameData.game_id,
        gameKey: key,
        date: fullISODate, // Full ISO timestamp for client-side sorting
        sortTimestamp,
        tipoff: tipoffInET, // Tipoff in ET for consistency with NCAA games
        homeTeam: {
          id: String(gameData.home_team_id),
          name: gameData.home_team_name,
          displayName: gameData.home_team_name,
          logo: gameData.home_team_logo || undefined,
        },
        awayTeam: {
          id: String(gameData.away_team_id),
          name: gameData.away_team_name,
          displayName: gameData.away_team_name,
          logo: gameData.away_team_logo || undefined,
        },
        status: gameData.status || 'Scheduled',
        venue: gameData.venue || undefined,
        prospects: [prospect],
        homeProspects: prospectSide === 'home' ? [prospect] : [],
        awayProspects: prospectSide === 'away' ? [prospect] : [],
        _prospectIds: new Set([prospectId]),
        _homeProspectIds: prospectSide === 'home' ? new Set([prospectId]) : new Set(),
        _awayProspectIds: prospectSide === 'away' ? new Set([prospectId]) : new Set(),
        _prospectRanks: new Set([prospect.rank]),
        _homeProspectRanks: prospectSide === 'home' ? new Set([prospect.rank]) : new Set(),
        _awayProspectRanks: prospectSide === 'away' ? new Set([prospect.rank]) : new Set(),
      };

      entries.push({
        key,
        game,
        prospect,
        prospectSide,
      });
      }
    }

    console.log(`[loadInternationalRosterGames] Loaded ${entries.length} games for ${internationalProspects.length} international players`);
    return entries;
  } catch (error) {
    console.error('[loadInternationalRosterGames] Error loading games:', error);
    return [];
  }
};

const loadCustomPlayerGames = async (
  clerkUserId: string,
  prospectsByRank: Map<number, Prospect>,
  teamDirectory: Map<string, TeamDirectoryEntry>
): Promise<ParsedScheduleEntry[]> => {
  try {
    const supabaseUserId = await getSupabaseUserId(clerkUserId);
    if (!supabaseUserId) {
      return [];
    }

    // Get all custom players for this user
    const customPlayers = await loadCustomPlayers(clerkUserId);
    if (customPlayers.length === 0) {
      return [];
    }

    // Get all games for custom players
    const customPlayerIds = customPlayers.map(cp => {
      // Find the custom player's ID in prospectsByRank
      for (const [rank, prospect] of prospectsByRank.entries()) {
        if (prospect.name === cp.name && prospect.team === cp.team) {
          return { prospect, id: null as string | null }; // We'll need to store the DB ID
        }
      }
      return null;
    }).filter(Boolean) as Array<{ prospect: Prospect; id: string | null }>;

    // Actually, we need to get the custom player IDs from the database
    const { data: customPlayersData } = await supabaseAdmin
      .from('custom_players')
      .select('id, name, team')
      .eq('user_id', supabaseUserId);

    if (!customPlayersData || customPlayersData.length === 0) {
      return [];
    }

    // Get all games for these custom players
    const customPlayerIdsList = customPlayersData.map(cp => cp.id);
    const { data: gamesData, error } = await supabaseAdmin
      .from('custom_player_games')
      .select('*')
      .in('custom_player_id', customPlayerIdsList)
      .order('date', { ascending: true });

    if (error || !gamesData || gamesData.length === 0) {
      return [];
    }

    // Create a map of custom_player_id to Prospect
    const customPlayerMap = new Map<string, Prospect>();
    for (const cp of customPlayersData) {
      const prospect = customPlayers.find(p => p.name === cp.name && p.team === cp.team);
      if (prospect) {
        customPlayerMap.set(cp.id, prospect);
      }
    }

    // Convert games to ParsedScheduleEntry format
    const entries: ParsedScheduleEntry[] = [];
    
    // Normalize team names for key matching (remove common suffixes like "Spartans", "Bears", etc.)
    // This ensures "Michigan State Spartans" matches "Michigan State" from schedule files
    const normalizeTeamNameForKey = (name: string): string => {
      return name.toLowerCase()
        .replace(/\s+(spartans|bears|lions|tigers|wildcats|bulldogs|eagles|hawks|owls|panthers|warriors|knights|pirates|raiders|cougars|hornets|jayhawks|tar heels|blue devils|crimson tide|fighting irish)$/i, '')
        .trim();
    };
    
    for (const gameData of gamesData) {
      const prospect = customPlayerMap.get(gameData.custom_player_id);
      if (!prospect) continue;

      // Determine if prospect is on home or away team
      // CRITICAL: Use teamId matching for NCAA teams, not string matching
      // This prevents mixing up similar school names
      let prospectSide: 'home' | 'away' = 'home'; // Default fallback
      
      if (prospect.teamId) {
        // Use teamId matching - this is the safe way
        const homeTeamEntry = findTeamEntryInDirectory(teamDirectory, gameData.home_team);
        const awayTeamEntry = findTeamEntryInDirectory(teamDirectory, gameData.away_team);
        
        if (homeTeamEntry && prospect.teamId === homeTeamEntry.id) {
          prospectSide = 'home';
        } else if (awayTeamEntry && prospect.teamId === awayTeamEntry.id) {
          prospectSide = 'away';
        } else {
          // teamId doesn't match either team - log warning and skip
          console.warn(`[loadWatchlistPlayerGames] ⚠️ Prospect ${prospect.name} teamId (${prospect.teamId}) doesn't match home (${homeTeamEntry?.id}) or away (${awayTeamEntry?.id}) team for game ${gameData.home_team} vs ${gameData.away_team}`);
          continue; // Skip this prospect for this game
        }
      } else {
        // Fallback: Only use string matching for international teams
        const prospectTeamName = prospect.teamDisplay || prospect.team || '';
        const isInternational = prospectTeamName.toLowerCase().includes('partizan') ||
                               prospectTeamName.toLowerCase().includes('asvel') ||
                               prospectTeamName.toLowerCase().includes('valencia') ||
                               prospectTeamName.toLowerCase().includes('lyon');
        
        if (isInternational) {
          // Only allow string matching for international teams
          const prospectIsHome = gameData.home_team === prospect.team || 
                                gameData.home_team.includes(prospect.team) ||
                                prospect.team.includes(gameData.home_team);
          prospectSide = prospectIsHome ? 'home' : 'away';
        } else {
          // NCAA prospect without teamId - skip it
          console.warn(`[loadWatchlistPlayerGames] ⚠️ NCAA prospect ${prospect.name} missing teamId, cannot determine side for game ${gameData.home_team} vs ${gameData.away_team}`);
          continue; // Skip this prospect
        }
      }

      // Create team info objects
      const homeTeamEntry = findTeamEntryInDirectory(teamDirectory, gameData.home_team);
      const awayTeamEntry = findTeamEntryInDirectory(teamDirectory, gameData.away_team);

      // Parse tipoff time to get sortTimestamp and isoTime
      let sortTimestamp: number | null = null;
      let isoTime = '00:00:00';
      if (gameData.tipoff) {
        const timeMatch = gameData.tipoff.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (timeMatch) {
          let hours = Number.parseInt(timeMatch[1], 10);
          const minutes = Number.parseInt(timeMatch[2], 10);
          const period = timeMatch[3].toUpperCase();
          if (period === 'PM' && hours !== 12) hours += 12;
          else if (period === 'AM' && hours === 12) hours = 0;
          sortTimestamp = hours * 60 + minutes;
          isoTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
        }
      }

      const game: AggregatedGameInternal = {
        id: gameData.game_id,
        date: `${gameData.date_key}T${isoTime}`,
        homeTeam: await createTeamInfo(gameData.home_team, homeTeamEntry),
        awayTeam: await createTeamInfo(gameData.away_team, awayTeamEntry),
        status: 'SCHEDULED',
        venue: gameData.venue || undefined,
        prospects: [],
        homeProspects: [],
        awayProspects: [],
        tipoff: gameData.tipoff || undefined,
        tv: gameData.tv || undefined,
        note: undefined,
        highlight: undefined,
        dateKey: gameData.date_key,
        locationType: (gameData.location_type as 'home' | 'away' | 'neutral') || null,
        sortTimestamp,
        _prospectRanks: new Set<number>(),
        _homeProspectRanks: new Set<number>(),
        _awayProspectRanks: new Set<number>(),
      };

      // Normalize team names for key matching to ensure "Michigan State Spartans" matches "Michigan State"
      const normalizedHomeTeam = normalizeTeamNameForKey(gameData.home_team);
      const normalizedAwayTeam = normalizeTeamNameForKey(gameData.away_team);
      const timeKey = sortTimestamp === null ? 'TBD' : (gameData.tipoff || '');
      // Custom player games - use 'custom' as league identifier to prevent collision with API-sourced games
      const key = buildGameKey(gameData.date_key, timeKey, normalizedHomeTeam, normalizedAwayTeam, gameData.venue || undefined, 'custom');

      entries.push({
        key,
        game,
        prospect,
        prospectSide,
      });
    }

    return entries;
  } catch (error) {
    console.error('Error loading custom player games:', error);
    return [];
  }
};

const loadWatchlistPlayerGames = async (
  clerkUserId: string,
  prospectsByRank: Map<number, Prospect>,
  teamDirectory: Map<string, TeamDirectoryEntry>
): Promise<ParsedScheduleEntry[]> => {
  try {
    const supabaseUserId = await getSupabaseUserId(clerkUserId);
    if (!supabaseUserId) {
      return [];
    }
    
    // DEBUG: Log all prospects to see who's on the watchlist
    console.error('[DEBUG] Prospects on watchlist:', Array.from(prospectsByRank.values()).map(p => `${p.name} (${p.team})`));

    // Get all watchlist prospects for this user (source: 'external' or 'espn')
    // Note: Can't use .or() with nested fields, so we fetch all and filter client-side
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
    
    // Filter to only watchlist prospects (source: 'external' or 'espn')
    const watchlistRankings = (allRankings || []).filter((r: any) => {
      return r.prospects && (r.prospects.source === 'external' || r.prospects.source === 'espn');
    });

    if (rankingsError) {
      console.error('[loadWatchlistPlayerGames] Error querying user_rankings:', rankingsError);
      return [];
    }
    
    if (!watchlistRankings || watchlistRankings.length === 0) {
      console.log('[loadWatchlistPlayerGames] No watchlist rankings found for user');
      return [];
    }
    
    console.log(`[loadWatchlistPlayerGames] Found ${watchlistRankings.length} watchlist rankings`);

    // Filter to only watchlist prospects and get their IDs
    const watchlistProspectIds = watchlistRankings
      .filter((r: any) => r.prospects && (r.prospects.source === 'external' || r.prospects.source === 'espn'))
      .map((r: any) => r.prospects.id);

    console.log(`[loadWatchlistPlayerGames] Found ${watchlistProspectIds.length} watchlist prospect IDs:`, watchlistProspectIds);

    if (watchlistProspectIds.length === 0) {
      console.log(`[loadWatchlistPlayerGames] No watchlist prospect IDs found after filtering`);
      return [];
    }

    // Get all games for these watchlist prospects
    const { data: gamesData, error: gamesError } = await supabaseAdmin
      .from('prospect_games')
      .select('*')
      .in('prospect_id', watchlistProspectIds)
      .order('date_key', { ascending: true });

    if (gamesError) {
      console.error('[loadWatchlistPlayerGames] Error querying prospect_games:', gamesError);
      return [];
    }
    
    if (!gamesData || gamesData.length === 0) {
      console.log(`[loadWatchlistPlayerGames] No games found for ${watchlistProspectIds.length} watchlist prospects`);
      return [];
    }
    
    console.log(`[loadWatchlistPlayerGames] Found ${gamesData.length} games for watchlist prospects`);
    
    if (gamesData.length > 0) {
      console.log(`[loadWatchlistPlayerGames] Sample game data:`, {
        prospect_id: gamesData[0].prospect_id,
        game_id: gamesData[0].game_id,
        date_key: gamesData[0].date_key,
        home_team: gamesData[0].home_team,
        away_team: gamesData[0].away_team,
      });
    }

    // Create a map of prospect_id to league info for filtering
    const prospectLeagueMap = new Map<string, string>();
    for (const ranking of watchlistRankings) {
      const prospectData = (ranking as any).prospects;
      if (prospectData && prospectData.id && prospectData.league) {
        prospectLeagueMap.set(prospectData.id, prospectData.league.toLowerCase());
      }
    }

    // Filter out games that don't match the prospect's league
    // This prevents mixing NBL games with EuroLeague games for players with same team names
    const filteredGamesData = gamesData.filter(game => {
      const prospectLeague = prospectLeagueMap.get(game.prospect_id);
      if (!prospectLeague) return true; // Keep if we don't know the league
      
      const homeTeam = (game.home_team || '').toLowerCase();
      const awayTeam = (game.away_team || '').toLowerCase();
      const gameTeams = `${homeTeam} ${awayTeam}`;
      
      // NBL teams (Australian league)
      const nblTeams = ['brisbane', 'bullets', 'melbourne', 'united', 'sydney', 'kings', 
                        'perth', 'wildcats', 'adelaide', '36ers', 'cairns', 'taipans',
                        'illawarra', 'hawks', 'tasmania', 'jackjumpers', 'new zealand', 'breakers',
                        'south east melbourne', 'phoenix'];
      const isNBLGame = nblTeams.some(team => gameTeams.includes(team));
      
      // European league indicators
      const europeanLeagues = ['euroleague', 'eurocup', 'acb', 'lnb', 'aba', 'bbl', 'vtr', 'adriatic', 'super league', 'superleague'];
      const isEuropeanLeague = europeanLeagues.some(league => prospectLeague.includes(league));
      
      // If prospect is in a European league, exclude NBL games
      if (isEuropeanLeague && isNBLGame) {
        console.log(`[loadWatchlistPlayerGames] Filtering out NBL game for European league player:`, {
          prospect_id: game.prospect_id,
          league: prospectLeague,
          game: `${game.away_team} @ ${game.home_team}`,
        });
        return false;
      }
      
      // If prospect is in NBL, exclude European games
      const isNBLLeague = prospectLeague.includes('nbl') || prospectLeague.includes('australia');
      if (isNBLLeague && !isNBLGame) {
        console.log(`[loadWatchlistPlayerGames] Filtering out non-NBL game for NBL player:`, {
          prospect_id: game.prospect_id,
          league: prospectLeague,
          game: `${game.away_team} @ ${game.home_team}`,
        });
        return false;
      }
      
      return true;
    });
    
    console.log(`[loadWatchlistPlayerGames] Filtered ${gamesData.length} games to ${filteredGamesData.length} after league filtering`);

    // Create a map of prospect_id to Prospect
    const prospectMap = new Map<string, Prospect>();
    for (const ranking of watchlistRankings) {
      const prospectData = (ranking as any).prospects;
      if (!prospectData) continue;
      
      // Try to find the prospect in prospectsByRank by matching name and team
      // This ensures we get jersey numbers and other data that was already fetched
      let foundProspect: Prospect | undefined;
      for (const [rank, prospect] of prospectsByRank.entries()) {
        if (prospect.name === prospectData.full_name && 
            (prospect.team === prospectData.team_name || prospect.teamDisplay === prospectData.team_name)) {
          // Found in main rankings, but this is a watchlist entry, so create a copy with isWatchlist flag
          // Preserve jersey number and other data from the main prospect
          foundProspect = {
            ...prospect,
            isWatchlist: true, // Mark as watchlist even if found in main rankings
          };
          break;
        }
      }
      
      // If not found in prospectsByRank, create a Prospect object from the database data
      // Note: Jersey numbers will be fetched later via ensureJerseyData if teamId is available
      if (!foundProspect) {
        foundProspect = {
          rank: ranking.rank,
          name: prospectData.full_name,
          position: prospectData.position || '',
          team: prospectData.team_name || '',
          class: '', // Will be classified if needed
          espnRank: ranking.rank,
          teamDisplay: prospectData.team_name || '',
          teamId: prospectData.team_id || undefined,
          isWatchlist: true,
          jersey: undefined, // Will be populated by ensureJerseyData if teamId is available
        };
      }
      
      prospectMap.set(prospectData.id, foundProspect);
    }
    
    console.log(`[loadWatchlistPlayerGames] Mapped ${prospectMap.size} watchlist prospects to Prospect objects`);
    
    // Fetch jersey numbers for watchlist prospects that don't have them yet
    // This ensures watchlist-only players (not in main rankings) get jersey numbers
    const prospectsNeedingJerseys = Array.from(prospectMap.values()).filter(p => !p.jersey);
    
    // First, resolve team IDs for prospects that don't have them
    for (const prospect of prospectsNeedingJerseys) {
      if (!prospect.teamId && prospect.teamDisplay) {
        const teamEntry = findTeamEntryInDirectory(teamDirectory, prospect.teamDisplay);
        if (teamEntry) {
          prospect.teamId = teamEntry.id;
          console.log(`[loadWatchlistPlayerGames] Resolved team ID ${teamEntry.id} for ${prospect.name} (team: ${prospect.teamDisplay})`);
        } else {
          console.warn(`[loadWatchlistPlayerGames] Could not resolve team ID for ${prospect.name} (team: ${prospect.teamDisplay})`);
        }
      }
    }
    
    // Filter to only prospects with team IDs
    const prospectsWithTeamIds = prospectsNeedingJerseys.filter(p => p.teamId);
    
    if (prospectsWithTeamIds.length > 0) {
      console.log(`[loadWatchlistPlayerGames] Fetching jersey numbers for ${prospectsWithTeamIds.length} watchlist prospects`);
      
      // Group by team ID
      const teamToProspects = new Map<string, Prospect[]>();
      for (const prospect of prospectsWithTeamIds) {
        if (!prospect.teamId) continue;
        if (!teamToProspects.has(prospect.teamId)) {
          teamToProspects.set(prospect.teamId, []);
        }
        teamToProspects.get(prospect.teamId)!.push(prospect);
      }
      
      // Fetch rosters for each team
      for (const [teamId, prospects] of teamToProspects.entries()) {
        try {
          const rosterMap = await getRosterForTeam(teamId);
          if (!rosterMap.size) continue;
          
          for (const prospect of prospects) {
            const variants = createNameVariants(prospect.name);
            let foundJersey = false;
            for (const variant of variants) {
              const rosterData = rosterMap.get(variant);
              if (rosterData) {
                prospect.jersey = rosterData.jersey;
                if (rosterData.injuryStatus && !prospect.injuryStatus) {
                  prospect.injuryStatus = rosterData.injuryStatus;
                }
                console.log(`[loadWatchlistPlayerGames] ✓ Found jersey #${rosterData.jersey} for ${prospect.name} (team: ${teamId}, variant: ${variant})`);
                foundJersey = true;
                break;
              }
            }
            if (!foundJersey) {
              console.warn(`[loadWatchlistPlayerGames] ⚠ Could not find jersey number for "${prospect.name}" in team ${teamId} roster`);
              console.warn(`[loadWatchlistPlayerGames]   Tried variants:`, variants);
              console.warn(`[loadWatchlistPlayerGames]   Available roster names (first 10):`, Array.from(rosterMap.keys()).slice(0, 10));
            }
          }
        } catch (error) {
          console.warn(`[loadWatchlistPlayerGames] Failed to fetch roster for team ${teamId}:`, error);
        }
      }
    }

    // Convert games to ParsedScheduleEntry format
    const entries: ParsedScheduleEntry[] = [];
    
    // Normalize team names for comparison (remove common suffixes like "Spartans", "Bears", etc.)
    // This function is used to match team names and build consistent game keys
    // Note: We don't convert to lowercase here - buildGameKey's sanitizeKey will handle that
    // This ensures "Michigan State Spartans" becomes "Michigan State" to match schedule files
    const normalizeTeamNameForKey = (name: string): string => {
      return name
        .replace(/\s+(spartans|bears|lions|tigers|wildcats|bulldogs|eagles|hawks|owls|panthers|warriors|knights|pirates|raiders|cougars|hornets|jayhawks|tar heels|blue devils|crimson tide|fighting irish)$/i, '')
        .trim();
    };
    
    // For team matching (prospect side detection), we need to normalize and remove suffixes
    // This ensures "Michigan State Spartans" matches "Michigan State"
    const normalizeTeamNameForMatching = (name: string): string => {
      return normalizeTeamNameForKey(name).toLowerCase();
    };
    
    for (const gameData of filteredGamesData) {
      const prospect = prospectMap.get(gameData.prospect_id);
      if (!prospect) continue;

      // Determine if prospect is on home or away team
      // PRIMARY METHOD: Use location_type from database (most reliable - set when game was fetched)
      // FALLBACK: Use team name matching if location_type is not available
      let prospectSide: 'home' | 'away';
      
      const prospectTeamName = prospect.teamDisplay || prospect.team || '';
      const debugPlayers = ['coen', 'mbaye', 'ndiaye'];
      const shouldDebug = debugPlayers.some(name => prospect.name.toLowerCase().includes(name));
      
      // Check if location_type is available (stored when game was fetched from API-Basketball)
      if (gameData.location_type === 'home' || gameData.location_type === 'away') {
        prospectSide = gameData.location_type;
        if (shouldDebug) {
          console.log(`[loadWatchlistPlayerGames] ✓ Using location_type from database: ${prospectSide} for "${prospect.name}"`);
        }
      } else {
        // Fallback to team name matching if location_type is not available
        // Use teamNamesMatch helper for consistent matching (handles ASVEL/Lyon-Villeurbanne variations)
        const prospectIsHome = teamNamesMatch(prospectTeamName, gameData.home_team);
        const prospectIsAway = teamNamesMatch(prospectTeamName, gameData.away_team);
        
        if (shouldDebug) {
          console.log(`[loadWatchlistPlayerGames] 🔍 Team matching for "${prospect.name}" (no location_type):`, {
            prospectTeam: prospectTeamName,
            homeTeam: gameData.home_team,
            awayTeam: gameData.away_team,
            prospectIsHome,
            prospectIsAway,
            gameKey: `${gameData.date_key} - ${gameData.away_team} @ ${gameData.home_team}`,
          });
        }
        
        // Determine side: prefer exact matches, but if both match (shouldn't happen), default to home
        // If neither matches, try fuzzy matching as fallback before giving up
        if (prospectIsHome && !prospectIsAway) {
          prospectSide = 'home';
        } else if (prospectIsAway && !prospectIsHome) {
          prospectSide = 'away';
        } else if (prospectIsHome && prospectIsAway) {
          // Both match (shouldn't happen, but handle gracefully)
          console.warn(`[loadWatchlistPlayerGames] ⚠ Prospect "${prospect.name}" team "${prospectTeamName}" matches both home "${gameData.home_team}" and away "${gameData.away_team}" - defaulting to home`);
          prospectSide = 'home';
        } else {
          // Neither matches - try fuzzy matching as fallback
          const normalizedProspect = normalizeTeamNameForKey(prospectTeamName).toLowerCase();
          const normalizedHome = normalizeTeamNameForKey(gameData.home_team).toLowerCase();
          const normalizedAway = normalizeTeamNameForKey(gameData.away_team).toLowerCase();
          
          // Check if prospect team name is contained in home/away team names (fuzzy fallback)
          const fuzzyMatchHome = normalizedHome.includes(normalizedProspect) || normalizedProspect.includes(normalizedHome);
          const fuzzyMatchAway = normalizedAway.includes(normalizedProspect) || normalizedProspect.includes(normalizedAway);
          
          if (fuzzyMatchHome && !fuzzyMatchAway) {
            if (shouldDebug) {
              console.log(`[loadWatchlistPlayerGames] ✓ Fuzzy match: "${prospectTeamName}" matches home "${gameData.home_team}"`);
            }
            prospectSide = 'home';
          } else if (fuzzyMatchAway && !fuzzyMatchHome) {
            if (shouldDebug) {
              console.log(`[loadWatchlistPlayerGames] ✓ Fuzzy match: "${prospectTeamName}" matches away "${gameData.away_team}"`);
            }
            prospectSide = 'away';
          } else {
            // Still no match - log warning and default to home
            console.warn(`[loadWatchlistPlayerGames] ⚠ Prospect "${prospect.name}" team "${prospectTeamName}" does not match home "${gameData.home_team}" or away "${gameData.away_team}" - defaulting to home`);
            prospectSide = 'home';
          }
        }
        
        if (shouldDebug) {
          console.log(`[loadWatchlistPlayerGames] ✓ Final side assignment (from matching): ${prospectSide}`);
        }
      }

      // Normalize team names first (remove suffixes like "Spartans") before resolving
      // This ensures "Michigan State Spartans" becomes "Michigan State" before directory lookup
      const normalizedHomeTeamForResolve = normalizeTeamNameForKey(gameData.home_team);
      const normalizedAwayTeamForResolve = normalizeTeamNameForKey(gameData.away_team);
      
      // Resolve team names using directory (same as schedule files do)
      // This ensures consistent team names across the app
      let resolvedHomeTeam = resolveTeamName(normalizedHomeTeamForResolve, teamDirectory);
      let resolvedAwayTeam = resolveTeamName(normalizedAwayTeamForResolve, teamDirectory);
      
      // Normalize again after resolving to ensure any remaining suffixes are removed
      // (in case directory returned a name with suffix)
      resolvedHomeTeam = normalizeTeamNameForKey(resolvedHomeTeam);
      resolvedAwayTeam = normalizeTeamNameForKey(resolvedAwayTeam);
      
      const simplifiedHomeTeam = simplifyTeamName(resolvedHomeTeam);
      const simplifiedAwayTeam = simplifyTeamName(resolvedAwayTeam);

      // Create team info objects using resolved team names
      const homeTeamEntry = findTeamEntryInDirectory(teamDirectory, simplifiedHomeTeam);
      const awayTeamEntry = findTeamEntryInDirectory(teamDirectory, simplifiedAwayTeam);

      // Extract team IDs and logos from database if available
      const homeTeamId = (gameData as any).home_team_id || null;
      const awayTeamId = (gameData as any).away_team_id || null;
      const homeTeamLogo = (gameData as any).home_team_logo || null;
      const awayTeamLogo = (gameData as any).away_team_logo || null;

      // Parse tipoff time to get sortTimestamp and isoTime
      // IMPORTANT: Tipoff times may be stored with timezone (e.g., "1:30 PM PT" or "1:30 PM ET")
      // For game key matching, we normalize all times to ET so games merge correctly
      // Example: "1:30 PM PT" = "4:30 PM ET" (PT is 3 hours behind ET)
      let sortTimestamp: number | null = null;
      let isoTime = '00:00:00';
      if (gameData.tipoff) {
        // Match time with optional timezone: "1:30 PM PT" or "1:30 PM ET" or "1:30 PM"
        const timeMatch = gameData.tipoff.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*(ET|PT|CT|MT)?/i);
        if (timeMatch) {
          let hours = Number.parseInt(timeMatch[1], 10);
          const minutes = Number.parseInt(timeMatch[2], 10);
          const period = timeMatch[3].toUpperCase();
          const timezone = (timeMatch[4] || 'ET').toUpperCase();
          
          // Convert 12-hour to 24-hour format
          if (period === 'PM' && hours !== 12) hours += 12;
          else if (period === 'AM' && hours === 12) hours = 0;
          
          // Normalize to ET for consistent game keys
          // PT is UTC-8, ET is UTC-5 (or UTC-7/UTC-4 during DST), so PT + 3 hours = ET
          if (timezone === 'PT') {
            hours = (hours + 3) % 24; // Add 3 hours to convert PT to ET
          } else if (timezone === 'CT') {
            hours = (hours + 1) % 24; // Add 1 hour to convert CT to ET
          } else if (timezone === 'MT') {
            hours = (hours + 2) % 24; // Add 2 hours to convert MT to ET
          }
          // ET stays as-is
          
          sortTimestamp = hours * 60 + minutes;
          isoTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
        }
      }

      // Create team info objects and add team IDs and logos
      const homeTeamInfo = await createTeamInfo(simplifiedHomeTeam, homeTeamEntry);
      const awayTeamInfo = await createTeamInfo(simplifiedAwayTeam, awayTeamEntry);
      
      // Add team IDs and logos from database
      if (homeTeamId) homeTeamInfo.id = homeTeamId;
      if (awayTeamId) awayTeamInfo.id = awayTeamId;
      if (homeTeamLogo) homeTeamInfo.logo = homeTeamLogo;
      if (awayTeamLogo) awayTeamInfo.logo = awayTeamLogo;

      const game: AggregatedGameInternal = {
        id: gameData.game_id,
        date: `${gameData.date_key}T${isoTime}`,
        homeTeam: homeTeamInfo,
        awayTeam: awayTeamInfo,
        status: 'SCHEDULED',
        venue: gameData.venue || undefined,
        prospects: [],
        homeProspects: [],
        awayProspects: [],
        tipoff: gameData.tipoff || undefined,
        tv: gameData.tv || undefined,
        note: undefined,
        highlight: undefined,
        dateKey: gameData.date_key,
        locationType: (gameData.location_type as 'home' | 'away' | 'neutral') || null,
        sortTimestamp,
        _prospectRanks: new Set<number>(),
        _homeProspectRanks: new Set<number>(),
        _awayProspectRanks: new Set<number>(),
        _prospectIds: new Set<string>(), // Initialize ID sets for enrichment deduplication
        _homeProspectIds: new Set<string>(),
        _awayProspectIds: new Set<string>(),
      };

      // Use resolved/simplified team names for key building (same as schedule files)
      // This ensures "Michigan State Spartans" matches "Michigan State" from schedule files
      // IMPORTANT: Use isoTime format (normalized to ET) for consistent keys
      // This ensures "1:30 PM PT" and "4:30 PM ET" create the same key
      const timeKey = sortTimestamp === null ? 'TBD' : isoTime;
      // Use simplified team names for buildGameKey - same as schedule files do
      // Include league identifier to prevent collision between teams with same name in different leagues
      const leagueIdentifier = (prospect as any).league || gameData.source || 'watchlist';
      const key = buildGameKey(gameData.date_key, timeKey, simplifiedHomeTeam, simplifiedAwayTeam, gameData.venue || undefined, leagueIdentifier);
      
      console.log(`[loadWatchlistPlayerGames] Built game key: ${key} from resolved teams: "${simplifiedHomeTeam}" vs "${simplifiedAwayTeam}" (original: "${gameData.home_team}" vs "${gameData.away_team}")`);

      entries.push({
        key,
        game,
        prospect,
        prospectSide,
      });
    }

    return entries;
  } catch (error) {
    console.error('Error loading watchlist player games:', error);
    return [];
  }
};

const buildSchedules = async (
  source: RankingSource = 'espn',
  skipEnrichment: boolean = false,
  clerkUserId?: string,
  targetDate?: string // If provided, return early once this date's games are ready
): Promise<LoadedSchedules> => {
  console.time('[Schedule] buildSchedules total');
  
  // Check if ESPN API mode is enabled (default: true for new system)
  const useESPNAPI = process.env.USE_ESPN_API_SCHEDULES !== 'false';
  
        if (useESPNAPI) {
          console.log('[Schedule] Using ESPN API to fetch schedules (set USE_ESPN_API_SCHEDULES=false to use txt files)');
          // Clear ESPN API cache at start of each build to ensure fresh data
          clearESPNScheduleCache();
          // Also clear jersey cache to ensure manual injuries are applied
          clearJerseyCache();
        } else {
          console.log('[Schedule] Using txt file schedules (legacy mode)');
        }
  
  const prospectsByRank = await getProspectsByRank(source, clerkUserId);
  
  console.time('[Schedule] getTeamDirectory');
  const teamDirectory = await getTeamDirectory();
  console.timeEnd('[Schedule] getTeamDirectory');

  // Always fetch jersey numbers (important data, not just enrichment)
  // Only skip broadcast/TV enrichment if skipEnrichment is true
  console.time('[Schedule] ensureJerseyData');
  await ensureJerseyData(prospectsByRank, teamDirectory);
  console.timeEnd('[Schedule] ensureJerseyData');
  
  // Apply manual injuries to ALL prospects (even if not found in roster)
  console.log('[Schedule] Applying manual injuries to all prospects...');
  let manualInjuryCount = 0;
  for (const prospect of prospectsByRank.values()) {
    const manualStatus = getManualInjuryStatus(prospect.name);
    if (manualStatus) {
      prospect.injuryStatus = manualStatus;
      manualInjuryCount++;
      console.log(`[Schedule] ✓ Applied manual injury to "${prospect.name}": ${manualStatus}`);
    }
  }
  console.log(`[Schedule] Applied manual injuries to ${manualInjuryCount} prospects`);

  const aggregatedGames = new Map<string, AggregatedGameInternal>();

  if (useESPNAPI) {
    // ESPN API MODE: Fetch schedules directly from ESPN API
    console.time('[Schedule] fetchSchedulesFromESPN');
    console.log(`[Schedule] Fetching schedules for ${prospectsByRank.size} prospects from ESPN API...`);
    
    // Separate prospects into college basketball, NBL, api-basketball, international (scrapers), and others
    const prospectsByTeamId = new Map<string, Prospect[]>();
    const nblProspectsByTeamId = new Map<string, Prospect[]>();
    const apiBasketballProspects: Prospect[] = [];
    const internationalProspects: Prospect[] = [];
    const prospectsWithoutTeamId: Prospect[] = [];
    
    for (const prospect of prospectsByRank.values()) {
      // FIRST: Try to find college basketball team ID for this prospect
      // This ensures college teams are processed via ESPN, not API-Basketball
      const candidateNames = [
        prospect.teamDisplay,
        prospect.espnTeamName,
        prospect.team,
      ].filter(Boolean) as string[];
      
      let matchedTeam: TeamDirectoryEntry | undefined;
      for (const candidate of candidateNames) {
        matchedTeam = findTeamEntryInDirectory(teamDirectory, candidate);
        if (matchedTeam) break;
      }
      
      if (matchedTeam) {
        // Found ESPN team - use ESPN API (college basketball)
        prospect.teamId = matchedTeam.id;
        prospect.teamDisplay =
          matchedTeam.location ||
          matchedTeam.shortDisplayName ||
          matchedTeam.displayName;
        
        if (!prospectsByTeamId.has(matchedTeam.id)) {
          prospectsByTeamId.set(matchedTeam.id, []);
        }
        prospectsByTeamId.get(matchedTeam.id)!.push(prospect);
        continue; // Skip to next prospect
      }
      
      // Check if this is an NBL prospect
      if (isNBLProspect(prospect)) {
        const teamName = prospect.teamDisplay || prospect.espnTeamName || prospect.team || '';
        const nblTeamId = getNBLTeamId(teamName);
        
        if (nblTeamId) {
          prospect.teamId = nblTeamId;
          if (!nblProspectsByTeamId.has(nblTeamId)) {
            nblProspectsByTeamId.set(nblTeamId, []);
          }
          nblProspectsByTeamId.get(nblTeamId)!.push(prospect);
          console.log(`[Schedule] Found NBL team for ${prospect.name}: ${teamName} (ID: ${nblTeamId})`);
        } else {
          prospectsWithoutTeamId.push(prospect);
          console.warn(`[Schedule] NBL prospect ${prospect.name} (${teamName}) but no NBL team ID found. Skipping.`);
        }
        continue;
      }
      
      // Check if this prospect can use api-basketball (only for international teams without ESPN IDs)
      const canUseApi = canUseApiBasketball(prospect);
      
      // MEGA SUPERBET DEBUG - Easy to find
      if (prospect.name.includes('Srzentic') || prospect.name.includes('Suigo') || prospect.team?.toLowerCase().includes('mega')) {
        console.log(`\n🔵🔵🔵 MEGA SUPERBET DEBUG 🔵🔵🔵`);
        console.log(`🔵 Prospect: ${prospect.name}`);
        console.log(`🔵 Team: "${prospect.team}"`);
        console.log(`🔵 TeamDisplay: "${prospect.teamDisplay || 'none'}"`);
        console.log(`🔵 ESPNTeamName: "${prospect.espnTeamName || 'none'}"`);
        console.log(`🔵 canUseApiBasketball: ${canUseApi}`);
        console.log(`🔵🔵🔵 END MEGA DEBUG 🔵🔵🔵\n`);
      }
      
      if (canUseApi) {
        apiBasketballProspects.push(prospect);
        console.log(`[Schedule] ✓ Found api-basketball team for ${prospect.name}: ${prospect.team} - will use api-basketball`);
        continue;
      }
      
      // Check if this is an international team that can use scrapers
      if (canUseInternationalScraper(prospect)) {
        internationalProspects.push(prospect);
        console.log(`[Schedule] Found international team for ${prospect.name}: ${prospect.team} - will use scraper`);
        continue;
      }
      
      // No match found - will try text files or skip
      prospectsWithoutTeamId.push(prospect);
      console.warn(`[Schedule] No ESPN team ID found for ${prospect.name} (${prospect.team}). Will use text file if available.`);
    }
    
    console.log(`[Schedule] Found ${prospectsByTeamId.size} college teams with ESPN IDs, ${nblProspectsByTeamId.size} NBL teams, ${apiBasketballProspects.length} api-basketball teams, ${internationalProspects.length} international teams (scrapers), ${prospectsWithoutTeamId.length} prospects without team IDs`);
    
    // Fetch api-basketball schedules (for international leagues)
    if (apiBasketballProspects.length > 0) {
      console.log(`[Schedule] Fetching api-basketball schedules for ${apiBasketballProspects.length} prospects...`);
      const apiBasketballResults = await batchPromisesSettled(
        apiBasketballProspects,
        async (prospect) => {
          const teamDisplay = prospect.teamDisplay || prospect.espnTeamName || prospect.team || '';
          const entries: ParsedScheduleEntry[] = [];
          
          // Fetch schedule from api-basketball
          const scheduleEntries = await fetchProspectScheduleFromApiBasketball(
            prospect,
            teamDisplay,
            teamDirectory
          );
          
          // Apply manual injuries
          const manualStatus = getManualInjuryStatus(prospect.name);
          if (manualStatus) {
            prospect.injuryStatus = manualStatus;
            console.log(`[Schedule] ✓ Applied manual injury status to "${prospect.name}": ${manualStatus}`);
          }
          
          for (const entry of scheduleEntries) {
            entries.push({
              ...entry,
              prospect: { ...prospect, injuryStatus: prospect.injuryStatus },
            });
          }
          
          return { prospect: prospect.name, entries, error: null };
        },
        3 // Process 3 prospects at a time to avoid rate limiting
      );
      
      // Aggregate api-basketball entries
      // Track prospects that didn't get any games from API (fallback to text files)
      // BUT: Don't fallback for teams that should use API-Basketball (like Mega Superbet, ASVEL, Joventut)
      // These teams should only use API, not text files
      const apiBasketballFailedProspects: Prospect[] = [];
      const apiBasketballOnlyTeams = ['mega', 'megasuperbet', 'asvel', 'joventut', 'valencia', 'paris'];
      
      // Use the exported teamNamesMatch function (defined at module level)
      
      // Helper to find existing game by teams and date (fallback when key doesn't match)
      const findExistingGameByTeams = (entry: ParsedScheduleEntry): AggregatedGameInternal | undefined => {
        const entryDateKey = entry.game.dateKey || entry.game.date.substring(0, 10);
        const entryHomeName = entry.game.homeTeam.displayName || entry.game.homeTeam.name || '';
        const entryAwayName = entry.game.awayTeam.displayName || entry.game.awayTeam.name || '';
        
        // Debug logging for specific matchups
        const isValenciaJoventut = (entryHomeName.toLowerCase().includes('valencia') && entryAwayName.toLowerCase().includes('joventut')) ||
                                   (entryAwayName.toLowerCase().includes('valencia') && entryHomeName.toLowerCase().includes('joventut'));
        const isValenciaLyon = (entryHomeName.toLowerCase().includes('valencia') && (entryAwayName.toLowerCase().includes('lyon') || entryAwayName.toLowerCase().includes('asvel'))) ||
                               (entryAwayName.toLowerCase().includes('valencia') && (entryHomeName.toLowerCase().includes('lyon') || entryHomeName.toLowerCase().includes('asvel')));
        const isValenciaParis = (entryHomeName.toLowerCase().includes('valencia') && entryAwayName.toLowerCase().includes('paris')) ||
                               (entryAwayName.toLowerCase().includes('valencia') && entryHomeName.toLowerCase().includes('paris'));
        
        if (isValenciaJoventut || isValenciaLyon || isValenciaParis) {
          console.log(`[Schedule] 🔍 Looking for existing game: ${entryDateKey} - ${entryAwayName} @ ${entryHomeName}`);
          console.log(`[Schedule]   Entry key: ${entry.key}`);
          console.log(`[Schedule]   Prospect: ${entry.prospect.name} (${entry.prospect.rank})`);
        }
        
        // Search through all aggregated games to find a match
        for (const [existingKey, existingGame] of aggregatedGames.entries()) {
          const existingDateKey = existingGame.dateKey || existingGame.date.substring(0, 10);
          if (existingDateKey !== entryDateKey) continue;
          
          const existingHomeName = existingGame.homeTeam.displayName || existingGame.homeTeam.name || '';
          const existingAwayName = existingGame.awayTeam.displayName || existingGame.awayTeam.name || '';
          
          // Check if teams match (handling variations)
          const homeMatches = teamNamesMatch(entryHomeName, existingHomeName);
          const awayMatches = teamNamesMatch(entryAwayName, existingAwayName);
          
          // Teams match if both home teams match and both away teams match
          // OR if home/away are swapped (shouldn't happen but handle it)
          if ((homeMatches && awayMatches) || (teamNamesMatch(entryHomeName, existingAwayName) && teamNamesMatch(entryAwayName, existingHomeName))) {
            if (isValenciaJoventut || isValenciaLyon || isValenciaParis) {
              console.log(`[Schedule]   ✅ Found match! Existing key: ${existingKey}`);
              console.log(`[Schedule]   Existing teams: ${existingAwayName} @ ${existingHomeName}`);
              console.log(`[Schedule]   Existing prospects: ${(existingGame.prospects || []).map((p: any) => `${p.name} (#${p.rank})`).join(', ') || 'none'}`);
            }
            return existingGame;
          }
        }
        
        if (isValenciaJoventut || isValenciaLyon || isValenciaParis) {
          console.log(`[Schedule]   ❌ No match found. Total games checked: ${aggregatedGames.size}`);
          // Log a few sample keys for debugging
          const sampleKeys = Array.from(aggregatedGames.keys()).slice(0, 5);
          console.log(`[Schedule]   Sample existing keys: ${sampleKeys.join(', ')}`);
        }
        
        return undefined;
      };
      
      for (let i = 0; i < apiBasketballResults.length; i++) {
        const result = apiBasketballResults[i];
        const prospect = apiBasketballProspects[i];
        
        if (result.status === 'fulfilled') {
          const { entries } = result.value;
          if (entries.length > 0) {
            console.log(`[Schedule] Fetched ${entries.length} api-basketball game entries for ${result.value.prospect}`);
            
            for (const entry of entries) {
              let existing = aggregatedGames.get(entry.key);
              let existingKey = entry.key;
              
              // If no exact key match, try to find by teams and date
              if (!existing) {
                const foundGame = findExistingGameByTeams(entry);
                if (foundGame) {
                  // Find the key for the existing game
                  for (const [key, game] of aggregatedGames.entries()) {
                    if (game === foundGame) {
                      existing = foundGame;
                      existingKey = key;
                      break;
                    }
                  }
                }
              }
              
              const merged = mergeProspectIntoGame(entry, existing);
              
              if (existing) {
                if (existing.locationType === 'neutral' && merged.locationType !== 'neutral') {
                  existing.locationType = merged.locationType;
                }
                merged.sortTimestamp =
                  merged.sortTimestamp ?? existing.sortTimestamp ?? null;
                // Use the existing key to ensure we merge into the same game
                aggregatedGames.set(existingKey, merged);
              } else {
                // New game - use the entry's key
                aggregatedGames.set(entry.key, merged);
              }
            }
          } else {
            // No games from API
            const teamName = (prospect.teamDisplay || prospect.espnTeamName || prospect.team || '').toLowerCase().replace(/\s*\([^)]+\)\s*$/, '').trim();
            const normalizedTeam = teamName.replace(/[^a-z0-9]/g, '');
            const isApiOnlyTeam = apiBasketballOnlyTeams.some(keyword => normalizedTeam.includes(keyword) || keyword.includes(normalizedTeam));
            
            if (isApiOnlyTeam) {
              // Don't fallback to text files for API-only teams - log warning instead
              console.warn(`[Schedule] No games from api-basketball for ${prospect.name} (${teamName}), but this is an API-only team. Not falling back to text files.`);
            } else {
              // Fallback to text files for other teams
              console.warn(`[Schedule] No games from api-basketball for ${prospect.name}, will try text files`);
              apiBasketballFailedProspects.push(prospect);
            }
          }
        } else {
          const teamName = (prospect.teamDisplay || prospect.espnTeamName || prospect.team || '').toLowerCase().replace(/\s*\([^)]+\)\s*$/, '').trim();
          const normalizedTeam = teamName.replace(/[^a-z0-9]/g, '');
          const isApiOnlyTeam = apiBasketballOnlyTeams.some(keyword => normalizedTeam.includes(keyword) || keyword.includes(normalizedTeam));
          
          if (isApiOnlyTeam) {
            // Don't fallback to text files for API-only teams - log error instead
            console.error(`[Schedule] Failed to fetch api-basketball schedule for ${prospect.name} (${teamName}):`, result.reason);
            console.error(`[Schedule] This is an API-only team, not falling back to text files.`);
          } else {
            console.error(`[Schedule] Failed to fetch api-basketball schedule for ${prospect.name}:`, result.reason);
            apiBasketballFailedProspects.push(prospect);
          }
        }
      }
      
      // Add failed prospects back to the list for text file processing (only if not API-only teams)
      if (apiBasketballFailedProspects.length > 0) {
        console.log(`[Schedule] ${apiBasketballFailedProspects.length} prospects will fallback to text files`);
        prospectsWithoutTeamId.push(...apiBasketballFailedProspects);
      }
    }
    
    // Fetch NBL schedules
    if (nblProspectsByTeamId.size > 0) {
      console.log(`[Schedule] Fetching NBL schedules for ${nblProspectsByTeamId.size} teams...`);
      const nblTeamEntries = Array.from(nblProspectsByTeamId.entries());
      const nblScheduleResults = await batchPromisesSettled(
        nblTeamEntries,
        async ([teamId, prospects]) => {
          const teamDisplay = prospects[0].teamDisplay || prospects[0].team || '';
          const entries: ParsedScheduleEntry[] = [];
          
          // Fetch NBL schedule once per team
          const teamScheduleEntries = await fetchNBLProspectSchedule(
            prospects[0],
            teamId,
            teamDisplay,
            teamDirectory
          );
          
          // Create entries for all prospects on this team
          for (const prospect of prospects) {
            // ALWAYS check manual injuries FIRST
            const manualStatus = getManualInjuryStatus(prospect.name);
            if (manualStatus) {
              prospect.injuryStatus = manualStatus;
              console.log(`[Schedule] ✓ Applied manual injury status to "${prospect.name}": ${manualStatus}`);
            }
            
            for (const entry of teamScheduleEntries) {
              entries.push({
                ...entry,
                prospect: { ...prospect, injuryStatus: prospect.injuryStatus },
              });
            }
          }
          
          return { teamId, entries, error: null };
        },
        5 // Process 5 teams at a time
      );
      
      // Aggregate NBL entries
      for (const result of nblScheduleResults) {
        if (result.status === 'fulfilled') {
          const { teamId, entries } = result.value;
          if (entries.length > 0) {
            console.log(`[Schedule] Fetched ${entries.length} NBL game entries for team ${teamId}`);
          }
          
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
        } else {
          console.error(`[Schedule] Failed to fetch NBL schedule:`, result.reason);
        }
      }
    }
    
    // Load international teams from text files (even when ESPN API mode is enabled)
    // These teams don't have ESPN API coverage, so we use text files updated via: npm run fetch:pros
    // BUT: Don't load text files for API-only teams (Mega Superbet, ASVEL, Joventut, etc.) - they should only use API
    // NOTE: On Vercel/serverless, txt files aren't available - this is expected and we skip gracefully
    if (internationalProspects.length > 0 || prospectsWithoutTeamId.length > 0) {
      const apiBasketballOnlyTeams = ['mega', 'megasuperbet', 'asvel', 'joventut', 'valencia', 'paris'];
      
      // Filter out API-only teams from text file loading
      const internationalProspectsToLoad = [...internationalProspects, ...prospectsWithoutTeamId].filter(prospect => {
        const teamName = (prospect.teamDisplay || prospect.espnTeamName || prospect.team || '').toLowerCase().replace(/\s*\([^)]+\)\s*$/, '').trim();
        const normalizedTeam = teamName.replace(/[^a-z0-9]/g, '');
        const isApiOnlyTeam = apiBasketballOnlyTeams.some(keyword => normalizedTeam.includes(keyword) || keyword.includes(normalizedTeam));
        
        if (isApiOnlyTeam) {
          console.log(`[Schedule] Skipping text file loading for ${prospect.name} (${teamName}) - this is an API-only team`);
          return false;
        }
        return true;
      });
      
      console.log(`[Schedule] Loading ${internationalProspectsToLoad.length} international prospects from text files (filtered out API-only teams)...`);
      
      // Create a set of international prospect names for filtering
      const internationalProspectNames = new Set(
        internationalProspectsToLoad.map(p => p.name.toLowerCase())
      );
      
      // Load from text files for international teams
      // Wrap in try-catch for Vercel/serverless where fs operations may fail
      let files: string[] = [];
      let rootDir = process.cwd();
      try {
        files = fs.readdirSync(rootDir).filter((file) => file.endsWith(SCHEDULE_SUFFIX));
      } catch (fsError) {
        console.log(`[Schedule] Could not read schedule files from disk (expected on Vercel/serverless)`);
        files = [];
      }
      
      if (files.length > 0) {
        console.log(`[Schedule] Found ${files.length} schedule files, parsing for international teams...`);
        
        // Parse files - use the full prospectsByRank map so parseScheduleFile can match by rank
        // Then filter results to only include international prospects
        const parsePromises = files.map(file => {
          const filePath = path.join(rootDir, file);
          return parseScheduleFile(filePath, prospectsByRank, teamDirectory)
            .then(entries => ({ file, entries, error: null }))
            .catch(error => {
              console.error(`[Schedule] Failed to parse schedule file ${filePath}:`, error);
              return { file, entries: [], error };
            });
        });
        
        const results = await Promise.all(parsePromises);
        
        // Aggregate international team entries
        let internationalEntryCount = 0;
        for (const { file, entries, error } of results) {
          if (error) continue;
          
          // Filter entries to only include international prospects
          // BUT: Skip entries for prospects that should use API-Basketball (they should only use API)
          const internationalEntries = entries.filter(entry => {
            const shouldInclude = internationalProspectNames.has(entry.prospect.name.toLowerCase());
            if (!shouldInclude) return false;
            
            // Check if this prospect should use API-Basketball instead of text files
            if (canUseApiBasketball(entry.prospect)) {
              console.log(`[Schedule] Skipping text file entry for ${entry.prospect.name} - this prospect should use API-Basketball`);
              return false;
            }
            
            return true;
          });
          
          if (internationalEntries.length > 0) {
            console.log(`[Schedule] Parsed ${file}: ${internationalEntries.length} international entries`);
            internationalEntryCount += internationalEntries.length;
          }
          
          for (const entry of internationalEntries) {
            // Skip if this prospect should use API-Basketball (double-check)
            if (canUseApiBasketball(entry.prospect)) {
              console.log(`[Schedule] Skipping text file entry for ${entry.prospect.name} (game key: ${entry.key}) - prospect should use API-Basketball`);
              continue;
            }
            
            // Skip if game already exists from API (API games take precedence)
            const existing = aggregatedGames.get(entry.key);
            if (existing && existing.id && existing.id.startsWith('api-basketball-')) {
              console.log(`[Schedule] Skipping text file entry for ${entry.prospect.name} (game key: ${entry.key}) - game already exists from API-Basketball`);
              continue;
            }
            
            // Apply manual injuries
            const manualStatus = getManualInjuryStatus(entry.prospect.name);
            if (manualStatus) {
              entry.prospect.injuryStatus = manualStatus;
            }
            
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
        
        console.log(`[Schedule] Loaded ${internationalEntryCount} international team game entries from text files`);
      } else {
        console.warn(`[Schedule] No schedule files found for international teams. Run: npm run fetch:pros`);
      }
    }
    
    // Prospects without team ID that aren't international scraper teams will be skipped
    if (prospectsWithoutTeamId.length > 0) {
      const nonInternationalCount = prospectsWithoutTeamId.filter(p => !canUseInternationalScraper(p)).length;
      if (nonInternationalCount > 0) {
        console.warn(`[Schedule] ${nonInternationalCount} prospects without team IDs and not supported by scrapers will be skipped`);
      }
    }
    
    // Fetch college basketball schedules in batches to avoid rate limiting
    const teamEntries = Array.from(prospectsByTeamId.entries());
    const scheduleResults = await batchPromisesSettled(
      teamEntries,
      async ([teamId, prospects]) => {
        // Use the first prospect's teamDisplay for the schedule fetch
        const teamDisplay = prospects[0].teamDisplay || prospects[0].team || '';
        const entries: ParsedScheduleEntry[] = [];
        
        // Fetch schedule once per team (all prospects on same team share schedule)
        const teamScheduleEntries = await fetchProspectScheduleFromESPN(
          prospects[0],
          teamId,
          teamDisplay,
          teamDirectory
        );
        
        // Create entries for all prospects on this team
        for (const prospect of prospects) {
          // ALWAYS check manual injuries FIRST (before any other processing)
          const manualStatus = getManualInjuryStatus(prospect.name);
          if (manualStatus) {
            prospect.injuryStatus = manualStatus;
            console.log(`[Schedule] ✓ Applied manual injury status to "${prospect.name}": ${manualStatus}`);
          }
          
          for (const entry of teamScheduleEntries) {
            // Create a new entry with THIS prospect (not entry.prospect which is from the first prospect)
            // Preserve all game data but use the current prospect
            entries.push({
              ...entry,
              prospect: { ...prospect, injuryStatus: prospect.injuryStatus }, // Use current prospect, preserve injury status
            });
          }
        }
        
        return { teamId, entries, error: null };
      },
      5 // Process 5 teams at a time to avoid rate limiting
    );
    
    // Aggregate all ESPN API entries
    for (const result of scheduleResults) {
      if (result.status === 'fulfilled') {
        const { teamId, entries } = result.value;
        if (entries.length > 0) {
          console.log(`[Schedule] Fetched ${entries.length} game entries for team ${teamId}`);
        }
        
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
      } else {
        console.error(`[Schedule] Failed to fetch schedule from ESPN API:`, result.reason);
      }
    }
    
    console.timeEnd('[Schedule] fetchSchedulesFromESPN');
  } else {
    // TXT FILE MODE (legacy): Parse schedule files from disk
    // NOTE: This mode won't work on Vercel/serverless - use ESPN API mode instead
    const rootDir = process.cwd();
    let files: string[] = [];
    try {
      files = fs.readdirSync(rootDir).filter((file) => file.endsWith(SCHEDULE_SUFFIX));
    } catch (fsError) {
      console.error(`[Schedule] Could not read schedule files from disk - TXT FILE MODE requires local filesystem`);
      console.log(`[Schedule] On Vercel/serverless, set USE_ESPN_API_SCHEDULES=true (or leave unset) to use ESPN API mode`);
      files = [];
    }
    
    console.log(`[Schedule] Found ${files.length} schedule files in ${rootDir}`);
    if (files.length === 0) {
      console.warn(`[Schedule] No schedule files found! Looking for files ending with "${SCHEDULE_SUFFIX}"`);
      try {
        const allTxtFiles = fs.readdirSync(rootDir).filter((file) => file.endsWith('.txt'));
        console.log(`[Schedule] Found ${allTxtFiles.length} .txt files total. First 5:`, allTxtFiles.slice(0, 5));
      } catch {
        console.log(`[Schedule] Could not list txt files (expected on Vercel/serverless)`);
      }
    }

    // Parse all files in parallel (OPTIMIZATION: was sequential before)
    console.time('[Schedule] parseScheduleFiles (parallel)');
    const parsePromises = files.map(file => {
      const filePath = path.join(rootDir, file);
      return parseScheduleFile(filePath, prospectsByRank, teamDirectory)
        .then(entries => ({ file, entries, error: null }))
        .catch(error => {
          console.error(`[Schedule] Failed to parse schedule file ${filePath}:`, error);
          return { file, entries: [], error };
        });
    });
    
    const results = await Promise.all(parsePromises);
    console.timeEnd('[Schedule] parseScheduleFiles (parallel)');
    
    // Aggregate all parsed entries
    for (const { file, entries, error } of results) {
      if (error) continue; // Already logged in catch block
      
      if (entries.length > 0) {
        console.log(`[Schedule] Parsed ${file}: ${entries.length} entries`);
      }

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
  }
  
  // Aggregate all parsed entries (common for both modes)
  console.time('[Schedule] aggregateGames');

  // Load custom player games if source is 'myboard' and userId provided
  if (source === 'myboard' && clerkUserId) {
    // First, load games for international roster players (from international_team_schedules)
    console.time('[Schedule] loadInternationalRosterGames');
    const internationalRosterEntries = await loadInternationalRosterGames(clerkUserId, prospectsByRank, teamDirectory);
    console.log(`[Schedule] Loaded ${internationalRosterEntries.length} international roster game entries`);
    
    for (const entry of internationalRosterEntries) {
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
    console.timeEnd('[Schedule] loadInternationalRosterGames');
    
    // Then, load games for custom players (from custom_player_games)
    console.time('[Schedule] loadCustomPlayerGames');
    const customPlayerEntries = await loadCustomPlayerGames(clerkUserId, prospectsByRank, teamDirectory);
    console.log(`[Schedule] Loaded ${customPlayerEntries.length} custom player game entries`);
    
    for (const entry of customPlayerEntries) {
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
    console.timeEnd('[Schedule] loadCustomPlayerGames');
  }

  // Load watchlist player games for BOTH 'espn' and 'myboard' sources (watchlist players should appear in both)
  if (clerkUserId) {
    console.time('[Schedule] loadWatchlistPlayerGames');
    const watchlistPlayerEntries = await loadWatchlistPlayerGames(clerkUserId, prospectsByRank, teamDirectory);
    console.log(`[Schedule] Loaded ${watchlistPlayerEntries.length} watchlist player game entries`);
    
    // DEBUG: Log ALL watchlist games to see what's there
    if (watchlistPlayerEntries.length > 0) {
      console.error('[DEBUG] First 10 watchlist games:', watchlistPlayerEntries.slice(0, 10).map(e => {
        const homeTeamName = typeof e.game.homeTeam === 'string' ? e.game.homeTeam : e.game.homeTeam?.name || '';
        const awayTeamName = typeof e.game.awayTeam === 'string' ? e.game.awayTeam : e.game.awayTeam?.name || '';
        return {
          prospect: e.prospect.name,
          prospectTeam: e.prospect.team,
          game: `${awayTeamName} @ ${homeTeamName}`,
          dateKey: e.game.dateKey
        };
      }));
    }
    
    // DEBUG: Check if any watchlist games have Arkansas or Besiktas
    const arkansasBesiktas2 = watchlistPlayerEntries.filter(e => {
      const homeTeamName = typeof e.game.homeTeam === 'string' ? e.game.homeTeam : e.game.homeTeam?.name || '';
      const awayTeamName = typeof e.game.awayTeam === 'string' ? e.game.awayTeam : e.game.awayTeam?.name || '';
      return homeTeamName.toLowerCase().includes('arkansas') || 
             awayTeamName.toLowerCase().includes('arkansas') ||
             homeTeamName.toLowerCase().includes('besiktas') || 
             awayTeamName.toLowerCase().includes('besiktas');
    });
    if (arkansasBesiktas2.length > 0) {
      console.error(`[BUG] Found ${arkansasBesiktas2.length} watchlist games with Arkansas/Besiktas:`, arkansasBesiktas2.map(e => {
        const homeTeamName = typeof e.game.homeTeam === 'string' ? e.game.homeTeam : e.game.homeTeam?.name || '';
        const awayTeamName = typeof e.game.awayTeam === 'string' ? e.game.awayTeam : e.game.awayTeam?.name || '';
        return {
          prospect: e.prospect.name,
          prospectTeam: e.prospect.team,
          game: `${awayTeamName} @ ${homeTeamName}`,
          key: e.key
        };
      }));
    }
    
    if (watchlistPlayerEntries.length > 0) {
      console.log(`[Schedule] Sample watchlist entry:`, {
        key: watchlistPlayerEntries[0].key,
        prospect: watchlistPlayerEntries[0].prospect.name,
        prospectSide: watchlistPlayerEntries[0].prospectSide,
        gameId: watchlistPlayerEntries[0].game.id,
        dateKey: watchlistPlayerEntries[0].game.dateKey,
      });
    }
    
    for (const entry of watchlistPlayerEntries) {
      const existing = aggregatedGames.get(entry.key);
      
      // Debug logging for Coen Carr specifically
      if (entry.prospect.name.toLowerCase().includes('coen')) {
        console.log(`[Schedule] 🔍 Processing Coen Carr game entry:`, {
          key: entry.key,
          prospectName: entry.prospect.name,
          prospectRank: entry.prospect.rank,
          prospectSide: entry.prospectSide,
          gameId: entry.game.id,
          homeTeam: entry.game.homeTeam.displayName || entry.game.homeTeam.name,
          awayTeam: entry.game.awayTeam.displayName || entry.game.awayTeam.name,
          existingGame: existing ? 'yes' : 'no',
          existingProspects: existing ? existing.prospects.map(p => p.name).join(', ') : 'none',
        });
      }
      
      const merged = mergeProspectIntoGame(entry, existing);

      if (existing) {
        if (existing.locationType === 'neutral' && merged.locationType !== 'neutral') {
          existing.locationType = merged.locationType;
        }
        merged.sortTimestamp =
          merged.sortTimestamp ?? existing.sortTimestamp ?? null;
      } else {
        console.log(`[Schedule] Created new game entry for watchlist prospect "${entry.prospect.name}": ${entry.key}`);
      }

      // Debug logging after merge
      if (entry.prospect.name.toLowerCase().includes('coen')) {
        console.log(`[Schedule] ✅ After merge, Coen Carr in game:`, {
          inProspects: merged.prospects.some(p => p.name.toLowerCase().includes('coen')),
          inHomeProspects: merged.homeProspects.some(p => p.name.toLowerCase().includes('coen')),
          inAwayProspects: merged.awayProspects.some(p => p.name.toLowerCase().includes('coen')),
          allProspectNames: merged.prospects.map(p => p.name).join(', '),
        });
      }

      aggregatedGames.set(entry.key, merged);
    }
    console.timeEnd('[Schedule] loadWatchlistPlayerGames');
  }
  
  console.timeEnd('[Schedule] aggregateGames');
  
  console.log(`[Schedule] Total aggregated games: ${aggregatedGames.size}`);

  // Enrich games with prospects from opposing teams that are on the board/watchlist
  console.time('[Schedule] enrichGamesWithOpposingProspects');
  
  // School qualifiers that indicate DIFFERENT schools (not mascots)
  // Used to prevent "Alabama" matching "Alabama State", "Kentucky" matching "Kentucky Christian", etc.
  const SCHOOL_QUALIFIERS = ['state', 'tech', 'christian', 'am', 'southern', 'northern', 'eastern', 'western', 'central', 'atlantic', 'pacific', 'international', 'methodist', 'baptist', 'lutheran', 'coastal', 'poly'];
  
  // Helper function to check if two team names match strictly
  // Returns false if one appears to be a different school (e.g., "Alabama" vs "Alabama State")
  const isStrictTeamMatch = (teamKey1: string, teamKey2: string): boolean => {
    if (!teamKey1 || !teamKey2) return false;
    if (teamKey1 === teamKey2) return true;
    if (teamKey1.length < 5 || teamKey2.length < 5) return false;
    
    let shorter = '', longer = '';
    if (teamKey1.startsWith(teamKey2)) {
      shorter = teamKey2;
      longer = teamKey1;
    } else if (teamKey2.startsWith(teamKey1)) {
      shorter = teamKey1;
      longer = teamKey2;
    } else {
      return false;
    }
    
    const suffix = longer.substring(shorter.length);
    // If suffix starts with a school qualifier, it's a DIFFERENT school
    return !SCHOOL_QUALIFIERS.some(q => suffix.startsWith(q));
  };
  
  // Helper function to find prospects matching a team
  // CRITICAL: Uses team ID matching first to prevent "Texas" matching "Texas Tech" etc.
  // CRITICAL: isNBLGame parameter prevents NBL team IDs from matching NCAA team IDs (they can collide - e.g., ID 8 is both Arkansas and South East Melbourne Phoenix)
  const findProspectsForTeam = (teamName: string, prospectsByRank: Map<number, Prospect>, teamId?: string, isNBLGame: boolean = false): Prospect[] => {
    const normalizedTeamName = normalizeTeamNameForKey(teamName);
    const normalizedTeamKey = sanitizeKey(normalizedTeamName);
    const matchingProspects: Prospect[] = [];
    const matchedProspectIds = new Set<string>(); // Track matched prospects to avoid duplicates
    
    // Debug logging for Alabama-related games
    const isAlabamaGame = teamName.toLowerCase().includes('alabama');
    if (isAlabamaGame) {
      console.log(`\n[findProspectsForTeam] ======== ALABAMA DEBUG ========`);
      console.log(`[findProspectsForTeam] Looking for: team="${teamName}" teamId="${teamId || 'UNDEFINED'}" isNBLGame=${isNBLGame}`);
      console.log(`[findProspectsForTeam] Total prospects: ${prospectsByRank.size}`);
      // Log all prospects with Alabama in their team name
      let foundPhilon = false;
      for (const prospect of prospectsByRank.values()) {
        if (prospect.name?.toLowerCase().includes('philon')) {
          foundPhilon = true;
          console.log(`[findProspectsForTeam] PHILON FOUND: name="${prospect.name}" team="${prospect.team}" teamId="${prospect.teamId || 'UNDEFINED'}"`);
        }
        if (prospect.team?.toLowerCase().includes('alabama')) {
          console.log(`[findProspectsForTeam] Alabama prospect: ${prospect.name} - team="${prospect.team}" teamId="${prospect.teamId || 'UNDEFINED'}"`);
        }
      }
      if (!foundPhilon) {
        console.log(`[findProspectsForTeam] WARNING: Philon NOT FOUND in prospects list!`);
      }
      console.log(`[findProspectsForTeam] ==============================\n`);
    }
    
    // PRIORITY 1: Match by team ID (most reliable - no name confusion possible)
    // CRITICAL: Only match by team ID if the prospect source matches the game type
    // NBL and NCAA share the same ID namespace (e.g., ID 8 = Arkansas in NCAA, South East Melbourne in NBL)
    if (teamId) {
      const teamIdStr = String(teamId);
      if (isAlabamaGame) {
        console.log(`[findProspectsForTeam] DEBUG: Checking team ID matching. Game teamId="${teamIdStr}" isNBLGame=${isNBLGame}`);
      }
      for (const prospect of prospectsByRank.values()) {
        if (prospect.source === 'international-roster') continue;
        
        // CRITICAL: Check if prospect is from the correct league context
        // NBL games should only match NBL prospects, NCAA games should only match NCAA prospects
        const prospectTeamName = (prospect.team || prospect.teamDisplay || '').toLowerCase();
        const isNBLProspect = prospectTeamName.includes('melbourne') || 
                              prospectTeamName.includes('breakers') ||
                              prospectTeamName.includes('new zealand') ||
                              prospectTeamName.includes('adelaide') ||
                              prospectTeamName.includes('brisbane') ||
                              prospectTeamName.includes('cairns') ||
                              prospectTeamName.includes('illawarra') ||
                              prospectTeamName.includes('perth') ||
                              prospectTeamName.includes('phoenix') ||
                              prospectTeamName.includes('sydney') ||
                              prospectTeamName.includes('tasmania');
        
        // Skip if league context doesn't match (prevents Arkansas matching South East Melbourne Phoenix)
        if (isNBLGame && !isNBLProspect) continue;
        if (!isNBLGame && isNBLProspect) continue;
        
        if (prospect.teamId && String(prospect.teamId) === teamIdStr) {
          const prospectKey = `${prospect.name}|${prospect.team}`;
          if (!matchedProspectIds.has(prospectKey)) {
            matchingProspects.push(prospect);
            matchedProspectIds.add(prospectKey);
            console.log(`[findProspectsForTeam] ✅ Team ID match: ${prospect.name} (teamId: ${prospect.teamId}) → ${teamName} (teamId: ${teamId})`);
          }
        }
      }
      
      // If we found matches by team ID, return them (don't risk false positives from name matching)
      if (matchingProspects.length > 0) {
        console.log(`[findProspectsForTeam] Found ${matchingProspects.length} prospects by team ID for ${teamName} (${teamId})`);
        return matchingProspects;
      }
      
      if (isAlabamaGame) {
        console.log(`[findProspectsForTeam] DEBUG: No team ID matches found for ${teamName} (${teamId}), falling through to name matching`);
      }
    } else if (isAlabamaGame) {
      console.log(`[findProspectsForTeam] DEBUG: No teamId provided for game team "${teamName}", will use name matching only`);
    }
    
    // Known team name variations mapping
    const teamVariations: Record<string, string[]> = {
      'asvel': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket', 'lyon-villeurbanne'],
      'lyonvilleurbanne': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket', 'lyon-villeurbanne'],
      'lyon': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket', 'lyon-villeurbanne'],
      'valencia': ['valencia', 'valenciabasket', 'valenciabasketclub', 'valencia basket', 'valencia basket club'],
      'joventut': ['joventut', 'joventutbadalona', 'cjbjoventutbadalona'],
      'paris': ['paris', 'parisbasketball', 'parisbasket'],
      'partizan': ['partizan', 'partizanmozzartbet', 'partizan mozzart bet'],
    };
    
    // Get variations for this team
    const baseKey = normalizedTeamKey.split('-')[0]; // Get first part of key
    const variations = teamVariations[baseKey] || [normalizedTeamKey];
    
    // Enable debug logging for Valencia to debug merging issue
    const isValenciaTeam = teamName.toLowerCase().includes('valencia');
    const DEBUG_ENABLED = isValenciaTeam; // Enable for Valencia to debug merging issue
    const isDebugTeam = DEBUG_ENABLED && (
      teamName.toLowerCase().includes('lyon') || 
      teamName.toLowerCase().includes('asvel') || 
      teamName.toLowerCase().includes('valencia')
    );
    
    if (isDebugTeam) {
      console.log(`[findProspectsForTeam] Looking for prospects for team: "${teamName}"`);
      console.log(`[findProspectsForTeam]   Normalized: "${normalizedTeamName}"`);
      console.log(`[findProspectsForTeam]   Key: "${normalizedTeamKey}"`);
      console.log(`[findProspectsForTeam]   Base key: "${baseKey}"`);
      console.log(`[findProspectsForTeam]   Variations:`, variations);
    }
    
    for (const prospect of prospectsByRank.values()) {
      // Skip international roster players - they get games from international_team_schedules only
      // This prevents them from being incorrectly matched to ESPN/college games
      if (prospect.source === 'international-roster') {
        continue;
      }
      
      // Check all team name fields (including displayName variations)
      const prospectTeamNames = [
        prospect.team,
        prospect.teamDisplay,
        prospect.espnTeamName,
        // Also check if teamDisplay contains variations (e.g., "Valencia Basket Club" vs "Valencia")
        prospect.teamDisplay?.replace(/\s+(basket|basketball|club|bc)$/i, '').trim(),
        // Check team name without common suffixes for international teams
        prospect.team?.replace(/\s+(basket|basketball|club|bc)$/i, '').trim(),
      ].filter(Boolean) as string[];
      
      // Remove duplicates
      const uniqueTeamNames = Array.from(new Set(prospectTeamNames));
      
      for (const prospectTeamName of uniqueTeamNames) {
        const normalizedProspectTeam = normalizeTeamNameForKey(prospectTeamName);
        const normalizedProspectKey = sanitizeKey(normalizedProspectTeam);
        
        if (isDebugTeam) {
          console.log(`[findProspectsForTeam]   Checking prospect ${prospect.name} (#${prospect.rank})`);
          console.log(`[findProspectsForTeam]     Prospect team: "${prospectTeamName}"`);
          console.log(`[findProspectsForTeam]     Normalized: "${normalizedProspectTeam}"`);
          console.log(`[findProspectsForTeam]     Key: "${normalizedProspectKey}"`);
        }
        
        // Check exact match
        if (normalizedProspectKey === normalizedTeamKey) {
          if (isDebugTeam || isAlabamaGame) {
            console.log(`[findProspectsForTeam]     ✅ EXACT MATCH: ${prospect.name} (${normalizedProspectKey}) → ${teamName} (${normalizedTeamKey})`);
          }
          matchingProspects.push(prospect);
          break;
        }
        
        // Check if team name matches any variation (only for international teams with known variations)
        const prospectBaseKey = normalizedProspectKey.split('-')[0];
        const teamBaseKey = normalizedTeamKey.split('-')[0];
        
        // Only check variations if:
        // 1. The baseKey exists in teamVariations (meaning it's an international team with known variations)
        // 2. The variations list contains more than just the normalized team key
        // This ensures we only do variation matching for international teams, not college teams
        const hasKnownVariations = baseKey in teamVariations;
        const hasMultipleVariations = hasKnownVariations && teamVariations[baseKey].length > 1;
        
        // For international teams, try matching the base key first (e.g., "valencia" matches "valenciabasketclub")
        // This is more lenient and catches cases where team names have different suffixes
        // BUT NOT for school qualifier differences like "Alabama" vs "Alabama State"
        if (hasKnownVariations && isStrictTeamMatch(prospectBaseKey, teamBaseKey)) {
          if (isDebugTeam) {
            console.log(`[findProspectsForTeam]     ✅ BASE KEY MATCH (${prospectBaseKey} matches ${teamBaseKey})`);
          }
          matchingProspects.push(prospect);
          break;
        }
        
        // Also check exact variation matches (for teams with multiple known variations)
        if (hasKnownVariations && hasMultipleVariations) {
          // Check exact variation matches only (no substring matching)
          const sanitizedVariations = variations.map(v => sanitizeKey(v));
          const prospectMatchesVariation = sanitizedVariations.some(v => {
            // Exact match only - no prefix matching to prevent false positives
            return normalizedProspectKey === v;
          });
          
          if (prospectMatchesVariation) {
            if (isDebugTeam) {
              console.log(`[findProspectsForTeam]     ✅ VARIATION MATCH`);
            }
            matchingProspects.push(prospect);
            break;
          }
        }
        
        // For international teams with known variations, try a more lenient match
        // Check if the base key matches (e.g., "valencia" should match "valenciabasketclub")
        // BUT NOT for school qualifier differences like "Alabama" vs "Alabama State"
        if (hasKnownVariations) {
          const teamBaseKey = normalizedTeamKey.split('-')[0];
          if (isStrictTeamMatch(prospectBaseKey, teamBaseKey)) {
            if (isDebugTeam) {
              console.log(`[findProspectsForTeam]     ✅ BASE KEY MATCH (${prospectBaseKey} matches ${teamBaseKey})`);
            }
            matchingProspects.push(prospect);
            break;
          }
          
          // Last resort: for international teams ONLY, try substring matching
          // This catches cases like "valencia" matching "valenciabasketclub" or vice versa
          // CRITICAL: Never use substring matching for NCAA teams - it causes wrong school matches
          const prospectTeamName = prospect.teamDisplay || prospect.team || '';
          const isProspectInternational = prospectTeamName.toLowerCase().includes('partizan') ||
                                         prospectTeamName.toLowerCase().includes('asvel') ||
                                         prospectTeamName.toLowerCase().includes('valencia') ||
                                         prospectTeamName.toLowerCase().includes('lyon') ||
                                         prospectTeamName.toLowerCase().includes('mega') ||
                                         prospectTeamName.toLowerCase().includes('melbourne');
          
          if (isProspectInternational && (normalizedProspectKey.includes(teamBaseKey) || normalizedTeamKey.includes(prospectBaseKey))) {
            if (isDebugTeam) {
              console.log(`[findProspectsForTeam]     ✅ SUBSTRING MATCH (international only: ${normalizedProspectKey} contains ${teamBaseKey} or vice versa)`);
            }
            matchingProspects.push(prospect);
            break;
          } else if (!isProspectInternational && prospect.teamId) {
            // For NCAA teams with teamId, we should have matched by teamId already
            // If we get here, it means teamId doesn't match - skip this prospect
            if (isDebugTeam) {
              console.log(`[findProspectsForTeam]     ❌ NCAA prospect ${prospect.name} with teamId ${prospect.teamId} didn't match team ${teamName} - skipping substring match`);
            }
            // Don't add - prospect doesn't belong to this team
          }
        }
        
        if (isDebugTeam) {
          console.log(`[findProspectsForTeam]     ❌ NO MATCH`);
        }
        
        // For college teams (no known variations), only allow exact matches
        // This prevents "Michigan" from matching "Michigan State" or "Kansas" from matching "Arkansas"
        // Skip partial matching for college teams
      }
    }
    
    // Remove duplicates by rank
    const seen = new Set<number>();
    return matchingProspects.filter(p => {
      if (seen.has(p.rank)) return false;
      seen.add(p.rank);
      return true;
    });
  };
  
  // Helper to check if a game is an NBL (Australian) game
  // CRITICAL: NBL and NCAA share the same team ID namespace (e.g., ID 8 = Arkansas in NCAA, South East Melbourne in NBL)
  const isNBLGame = (game: AggregatedGameInternal): boolean => {
    const homeName = (game.homeTeam.displayName || game.homeTeam.name || '').toLowerCase();
    const awayName = (game.awayTeam.displayName || game.awayTeam.name || '').toLowerCase();
    
    // NBL team indicators
    const nblTeams = [
      'melbourne united', 'new zealand breakers', 'adelaide 36ers', 'brisbane bullets',
      'cairns taipans', 'illawarra hawks', 'perth wildcats', 'south east melbourne',
      'sydney kings', 'tasmania jackjumpers', 'phoenix', '36ers', 'taipans', 'breakers'
    ];
    
    return nblTeams.some(team => 
      homeName.includes(team) || awayName.includes(team)
    );
  };
  
  // Helper to check if a game is an international/pro game (not NCAA)
  const isInternationalGame = (game: AggregatedGameInternal): boolean => {
    const homeName = (game.homeTeam.displayName || game.homeTeam.name || '').toLowerCase();
    const awayName = (game.awayTeam.displayName || game.awayTeam.name || '').toLowerCase();
    
    // Check for international markers
    const internationalMarkers = [
      'valencia', 'paris', 'asvel', 'lyon', 'joventut', 'real madrid', 'baskonia',
      'fenerbahce', 'olimpia', 'zalgiris', 'maccabi', 'bayern', 'monaco', 'crvena zvezda',
      'panathinaikos', 'olympiacos', 'anadolu efes', 'hapoel', 'partizan', 'basket',
      'euroleague', 'eurocup', 'acb', 'lnb', 'aba'
    ];
    
    return internationalMarkers.some(marker => 
      homeName.includes(marker) || awayName.includes(marker)
    );
  };
  
  // Helper to check if a prospect is a college player
  const isCollegeProspect = (prospect: Prospect): boolean => {
    const teamName = (prospect.team || prospect.teamDisplay || '').toLowerCase();
    const classField = (prospect.class || '').toLowerCase();
    
    // Check if it's explicitly marked as NCAA
    if (classField === 'ncaa') return true;
    
    // Check for college team indicators (but exclude if it has international markers)
    const collegeIndicators = [
      'state', 'university', 'college', 'tar heels', 'blue devils', 'jayhawks',
      'wolverines', 'buckeyes', 'crimson tide', 'fighting irish', 'tigers',
      'bulldogs', 'wildcats', 'eagles', 'hawks', 'panthers', 'warriors'
    ];
    
    // If it contains college indicators but no international markers, it's likely college
    const hasCollegeIndicator = collegeIndicators.some(indicator => teamName.includes(indicator));
    const hasInternationalMarker = teamName.includes('(spain)') || teamName.includes('(france)') || 
                                   teamName.includes('(germany)') || teamName.includes('(turkey)') ||
                                   teamName.includes('(italy)') || teamName.includes('(greece)');
    
    return hasCollegeIndicator && !hasInternationalMarker;
  };
  
  // Enrich each game with prospects from opposing teams
  console.log(`[Enrichment] Starting enrichment for ${aggregatedGames.size} aggregated games`);
  for (const [gameKey, game] of aggregatedGames.entries()) {
    // Use displayName first, then name, and normalize to match how games are created
    // This ensures we match prospects even if team names have slight variations
    const homeTeamName = game.homeTeam.displayName || game.homeTeam.name || '';
    const awayTeamName = game.awayTeam.displayName || game.awayTeam.name || '';
    
    // Normalize team names for matching (same as game creation does)
    // This handles cases like "Valencia Basket Club" vs "Valencia"
    const normalizedHomeTeamName = normalizeTeamNameForKey(homeTeamName);
    const normalizedAwayTeamName = normalizeTeamNameForKey(awayTeamName);
    const isInternational = isInternationalGame(game);
    const gameIsNBL = isNBLGame(game);
    
    // Debug logging for specific matchups
    const isValenciaLyon = (homeTeamName.toLowerCase().includes('valencia') && (awayTeamName.toLowerCase().includes('lyon') || awayTeamName.toLowerCase().includes('asvel'))) ||
                           (awayTeamName.toLowerCase().includes('valencia') && (homeTeamName.toLowerCase().includes('lyon') || homeTeamName.toLowerCase().includes('asvel')));
    
    if (isValenciaLyon) {
      console.log(`[Enrichment] 🔍 Enriching game: ${awayTeamName} @ ${homeTeamName}`);
      console.log(`[Enrichment]   Home team: "${homeTeamName}"`);
      console.log(`[Enrichment]   Away team: "${awayTeamName}"`);
      console.log(`[Enrichment]   Is international game: ${isInternational}`);
    }
    
    // Debug logging for Alabama games to trace team ID matching issues
    const DEBUG_ENRICHMENT = true;
    const isDebugGame = DEBUG_ENRICHMENT && (
      homeTeamName.toLowerCase().includes('alabama') || 
      awayTeamName.toLowerCase().includes('alabama') ||
      homeTeamName.toLowerCase().includes('texas') ||
      awayTeamName.toLowerCase().includes('texas')
    );
    
    if (isDebugGame) {
      console.log(`[Enrichment] 🔍 Enriching game: ${awayTeamName} @ ${homeTeamName}`);
      console.log(`[Enrichment]   Home team: "${homeTeamName}" (id: ${game.homeTeam.id})`);
      console.log(`[Enrichment]   Away team: "${awayTeamName}" (id: ${game.awayTeam.id})`);
    }
    
    // Find prospects for home team - uses team ID for accurate matching
    // Team ID prevents "Texas" from matching "Texas Tech" or "Texas A&M"
    // CRITICAL: Pass gameIsNBL to prevent NBL team IDs from matching NCAA team IDs (they share the same ID namespace)
    const homeTeamId = game.homeTeam.id ? String(game.homeTeam.id) : undefined;
    const homeTeamProspects = findProspectsForTeam(normalizedHomeTeamName || homeTeamName, prospectsByRank, homeTeamId, gameIsNBL);
    
    
    // Filter out college prospects from international games
    const filteredHomeProspects = isInternational 
      ? homeTeamProspects.filter(p => !isCollegeProspect(p))
      : homeTeamProspects;
    
    // Debug logging for Valencia games (always enabled to debug merging issue)
    const isValenciaGame = homeTeamName.toLowerCase().includes('valencia') || awayTeamName.toLowerCase().includes('valencia');
    if (isValenciaGame || isDebugGame || isValenciaLyon) {
      console.log(`[Enrichment] 🔍 Enriching game: ${awayTeamName} @ ${homeTeamName}`);
      console.log(`[Enrichment]   Found ${homeTeamProspects.length} prospects for home team "${homeTeamName}" (${filteredHomeProspects.length} after filtering):`, 
        filteredHomeProspects.map(p => `${p.name} (#${p.rank}, watchlist: ${p.isWatchlist || false}) - team: "${p.team || p.teamDisplay || p.espnTeamName || 'N/A'}"`));
      console.log(`[Enrichment]   Current game prospects before enrichment:`, game.prospects.map(p => `${p.name} (#${p.rank}, watchlist: ${p.isWatchlist || false})`));
    }
    // Ensure Sets are initialized
    if (!game._prospectIds) game._prospectIds = new Set();
    if (!game._homeProspectIds) game._homeProspectIds = new Set();
    if (!game._awayProspectIds) game._awayProspectIds = new Set();
    
    for (const prospect of filteredHomeProspects) {
      // Use prospect ID (name+team) for deduplication instead of rank
      // This prevents conflicts when watchlist and big board prospects have overlapping ranks
      // Match the format used in mergeProspectIntoGame: name|team (not teamDisplay)
      // Use teamDisplay as fallback if team is empty (some prospects only have teamDisplay)
      const prospectTeamForId = prospect.team || prospect.teamDisplay || '';
      const prospectId = `${prospect.name}|${prospectTeamForId}`;
      const wasAdded = !game._prospectIds.has(prospectId);
      if (wasAdded) {
        game._prospectIds.add(prospectId);
        game._prospectRanks.add(prospect.rank); // Keep for backwards compatibility
        game.prospects.push({ ...prospect, injuryStatus: prospect.injuryStatus });
        if (isValenciaGame) {
          console.log(`[Enrichment] ✅ Added ${prospect.name} to home team prospects (ID: ${prospectId})`);
        }
      } else if (isValenciaGame) {
        console.log(`[Enrichment] ⏭️ Skipped ${prospect.name} - already in game (ID: ${prospectId})`);
      }
      if (!game._homeProspectIds.has(prospectId)) {
        game._homeProspectIds.add(prospectId);
        game._homeProspectRanks.add(prospect.rank); // Keep for backwards compatibility
        game.homeProspects.push({ ...prospect, injuryStatus: prospect.injuryStatus });
      }
    }
    
    // Find prospects for away team - uses team ID for accurate matching
    // CRITICAL: Pass gameIsNBL to prevent NBL team IDs from matching NCAA team IDs (they share the same ID namespace)
    const awayTeamId = game.awayTeam.id ? String(game.awayTeam.id) : undefined;
    const awayTeamProspects = findProspectsForTeam(normalizedAwayTeamName || awayTeamName, prospectsByRank, awayTeamId, gameIsNBL);
    
    
    // Filter out college prospects from international games
    const filteredAwayProspects = isInternational 
      ? awayTeamProspects.filter(p => !isCollegeProspect(p))
      : awayTeamProspects;
    
    // Debug logging for Valencia games (always enabled to debug merging issue)
    if (isValenciaGame || isDebugGame || isValenciaLyon) {
      console.log(`[Enrichment]   Found ${awayTeamProspects.length} prospects for away team "${awayTeamName}" (${filteredAwayProspects.length} after filtering):`, 
        filteredAwayProspects.map(p => `${p.name} (#${p.rank}, watchlist: ${p.isWatchlist || false}) - team: "${p.team || p.teamDisplay || p.espnTeamName || 'N/A'}"`));
    }
    for (const prospect of filteredAwayProspects) {
      // Use prospect ID (name+team) for deduplication instead of rank
      // This prevents conflicts when watchlist and big board prospects have overlapping ranks
      // Match the format used in mergeProspectIntoGame: name|team (not teamDisplay)
      // Use teamDisplay as fallback if team is empty (some prospects only have teamDisplay)
      const prospectTeamForId = prospect.team || prospect.teamDisplay || '';
      const prospectId = `${prospect.name}|${prospectTeamForId}`;
      const wasAdded = !game._prospectIds.has(prospectId);
      if (wasAdded) {
        game._prospectIds.add(prospectId);
        game._prospectRanks.add(prospect.rank); // Keep for backwards compatibility
        game.prospects.push({ ...prospect, injuryStatus: prospect.injuryStatus });
        if (isValenciaGame) {
          console.log(`[Enrichment] ✅ Added ${prospect.name} to away team prospects (ID: ${prospectId})`);
        }
      } else if (isValenciaGame) {
        console.log(`[Enrichment] ⏭️ Skipped ${prospect.name} - already in game (ID: ${prospectId})`);
      }
      if (!game._awayProspectIds.has(prospectId)) {
        game._awayProspectIds.add(prospectId);
        game._awayProspectRanks.add(prospect.rank); // Keep for backwards compatibility
        game.awayProspects.push({ ...prospect, injuryStatus: prospect.injuryStatus });
      }
    }
    
    if (isValenciaGame) {
      console.log(`[Enrichment]   Final game prospects after enrichment:`, game.prospects.map(p => `${p.name} (#${p.rank}, watchlist: ${p.isWatchlist || false})`));
    }
    
    if (isDebugGame || isValenciaLyon) {
      console.log(`[Enrichment]   Final game prospects: ${game.prospects.length} total (${game.homeProspects.length} home, ${game.awayProspects.length} away)`);
      console.log(`[Enrichment]   Home prospects:`, game.homeProspects.map(p => `${p.name} (#${p.rank})`));
      console.log(`[Enrichment]   Away prospects:`, game.awayProspects.map(p => `${p.name} (#${p.rank})`));
    }
  }
  
  console.timeEnd('[Schedule] enrichGamesWithOpposingProspects');

  if (!skipEnrichment) {
    console.time('[Schedule] enrichWithBroadcasts');
    await enrichWithBroadcasts(aggregatedGames);
    console.timeEnd('[Schedule] enrichWithBroadcasts');
  } else {
    console.log('[Schedule] Skipping broadcast enrichment for faster load');
  }

  const gamesByDateMap: Record<string, Map<string, GameWithProspects>> = {};

  // Normalize team names for merge key (remove suffixes like "Spartans")
  // This ensures "Michigan State Spartans" and "Michigan State" create the same merge key
  // Also handles international team name variations
  // Uses the same normalization logic as normalizeTeamNameForKey to ensure consistency
  const normalizeTeamNameForMerge = (name: string): string => {
    return normalizeTeamNameForKey(name);
  };

  // Normalize tipoff time for merge key - use a time window to allow slight variations
  // This helps merge games that are the same but have slightly different time formats
  const normalizeTipoffForMerge = (game: GameWithProspects): string => {
    if (typeof game.sortTimestamp === 'number') {
      // Round to nearest 15 minutes to allow slight time differences
      const roundedMinutes = Math.round(game.sortTimestamp / 15) * 15;
      return roundedMinutes.toString();
    }
    
    const tipoff = (game.tipoff ?? '').toUpperCase();
    // If it's TBD/TBA, use a generic key
    if (/TBD|TBA/i.test(tipoff)) {
      return 'TBD';
    }
    
    // Try to extract time components for normalization
    const timeMatch = tipoff.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const [, hour, minute] = timeMatch;
      const totalMinutes = parseInt(hour, 10) * 60 + parseInt(minute, 10);
      // Round to nearest 15 minutes
      const roundedMinutes = Math.round(totalMinutes / 15) * 15;
      return roundedMinutes.toString();
    }
    
    // Fallback: use the tipoff string as-is
    return tipoff || 'TBD';
  };

  // Create merge key that matches buildGameKey format for consistency
  // This ensures games created with buildGameKey can be properly merged
  const createMergeKey = (game: GameWithProspects) => {
    const dateKey = game.dateKey ?? game.date.substring(0, 10);
    const tipoff = normalizeTipoffForMerge(game);
    // Normalize team names before sanitizing to ensure consistent merging
    const homeDisplayName = game.homeTeam.displayName || game.homeTeam.name || '';
    const awayDisplayName = game.awayTeam.displayName || game.awayTeam.name || '';
    const normalizedHome = normalizeTeamNameForMerge(homeDisplayName);
    const normalizedAway = normalizeTeamNameForMerge(awayDisplayName);
    // Use buildGameKey's logic: sort teams alphabetically
    const teams = [sanitizeKey(normalizedHome), sanitizeKey(normalizedAway)]
      .sort()
      .join('__');
    // Include venue if present (to match buildGameKey)
    const venueKey = game.venue ? sanitizeKey(game.venue) : 'no-venue';
    const tipoffKey = tipoff || 'tbd';
    return `${dateKey}__${tipoffKey}__${teams}__${venueKey}`;
  };

  // If targetDate is specified, prioritize processing that date's games first
  const gamesToProcess = targetDate 
    ? Array.from(aggregatedGames.entries()).sort(([keyA], [keyB]) => {
        // Put targetDate games first
        const dateA = keyA.split('__')[0];
        const dateB = keyB.split('__')[0];
        if (dateA === targetDate && dateB !== targetDate) return -1;
        if (dateA !== targetDate && dateB === targetDate) return 1;
        return 0;
      })
    : Array.from(aggregatedGames.entries());

  // Helper function to create a team-only merge key (without tipoff) for fallback merging
  // This ignores venue to catch games that are the same but have different venue info
  const createTeamOnlyMergeKey = (game: GameWithProspects) => {
    const dateKey = game.dateKey ?? game.date.substring(0, 10);
    const homeDisplayName = game.homeTeam.displayName || game.homeTeam.name || '';
    const awayDisplayName = game.awayTeam.displayName || game.awayTeam.name || '';
    const normalizedHome = normalizeTeamNameForMerge(homeDisplayName);
    const normalizedAway = normalizeTeamNameForMerge(awayDisplayName);
    const home = sanitizeKey(normalizedHome);
    const away = sanitizeKey(normalizedAway);
    // Sort teams alphabetically to match buildGameKey logic
    const teams = [home, away].sort().join('__');
    // Don't include venue - ignore venue differences for fallback merge
    // This ensures games merge even if venue info differs between sources
    return `${dateKey}__${teams}`;
  };

  for (const [key, game] of gamesToProcess) {
    const finalized = finalizeGame(key, game);
    const dateKey = finalized.dateKey ?? finalized.date.substring(0, 10);
    if (!gamesByDateMap[dateKey]) {
      gamesByDateMap[dateKey] = new Map<string, GameWithProspects>();
    }
    const mergeKey = createMergeKey(finalized);
    let existing = gamesByDateMap[dateKey].get(mergeKey);
    
    // CRITICAL: Always log Dayton/Virginia games for debugging (at end, so appears at bottom)
    const isDaytonVirginiaGame = (finalized.homeTeam.displayName?.toLowerCase().includes('dayton') && finalized.awayTeam.displayName?.toLowerCase().includes('virginia')) ||
                                 (finalized.homeTeam.displayName?.toLowerCase().includes('virginia') && finalized.awayTeam.displayName?.toLowerCase().includes('dayton')) ||
                                 (finalized.homeTeam.name?.toLowerCase().includes('dayton') && finalized.awayTeam.name?.toLowerCase().includes('virginia')) ||
                                 (finalized.homeTeam.name?.toLowerCase().includes('virginia') && finalized.awayTeam.name?.toLowerCase().includes('dayton'));

    // If no exact match, try to find a game with the same teams and date (fallback merge)
    // This handles cases where times/timezones differ but it's the same game
    // We ignore venue differences to catch games from different sources
    if (!existing) {
      const teamOnlyKey = createTeamOnlyMergeKey(finalized);
      
      for (const [existingKey, existingGame] of gamesByDateMap[dateKey].entries()) {
        const existingTeamOnlyKey = createTeamOnlyMergeKey(existingGame);
        
        // Match if teams and date match (venue ignored)
        if (existingTeamOnlyKey === teamOnlyKey) {
          // Found a match - merge into this game
          existing = existingGame;
          // Update the map to use the more complete merge key
          gamesByDateMap[dateKey].delete(existingKey);
          gamesByDateMap[dateKey].set(mergeKey, existing);
          
          // Debug logging for merge
          const isDaytonVirginiaMerge = isDaytonVirginiaGame ||
                                       (existingGame.homeTeam.displayName?.toLowerCase().includes('dayton') && existingGame.awayTeam.displayName?.toLowerCase().includes('virginia')) ||
                                       (existingGame.homeTeam.displayName?.toLowerCase().includes('virginia') && existingGame.awayTeam.displayName?.toLowerCase().includes('dayton')) ||
                                       (existingGame.homeTeam.name?.toLowerCase().includes('dayton') && existingGame.awayTeam.name?.toLowerCase().includes('virginia')) ||
                                       (existingGame.homeTeam.name?.toLowerCase().includes('virginia') && existingGame.awayTeam.name?.toLowerCase().includes('dayton'));
          
          if (isDaytonVirginiaMerge) {
            console.log(`\n[Schedule] 🔀 MERGING DAYTON/VIRGINIA GAME:`);
            console.log(`[Schedule]   Existing: ${existingGame.homeTeam.displayName || existingGame.homeTeam.name} (home, id=${existingGame.homeTeam.id}) vs ${existingGame.awayTeam.displayName || existingGame.awayTeam.name} (away, id=${existingGame.awayTeam.id})`);
            console.log(`[Schedule]   Finalized: ${finalized.homeTeam.displayName || finalized.homeTeam.name} (home, id=${finalized.homeTeam.id}) vs ${finalized.awayTeam.displayName || finalized.awayTeam.name} (away, id=${finalized.awayTeam.id})`);
            console.log(`[Schedule]   Old key: ${existingKey}`);
            console.log(`[Schedule]   New key: ${mergeKey}`);
            console.log(`[Schedule]   Team-only key: ${teamOnlyKey}`);
          }
          break;
        }
      }
    }
    
    // CRITICAL: Always log Dayton/Virginia games even if not merged (at end, so appears at bottom)
    if (isDaytonVirginiaGame && !existing) {
      console.log(`\n[Schedule] 🆕 NEW DAYTON/VIRGINIA GAME (no existing game to merge with):`);
      console.log(`[Schedule]   Finalized: ${finalized.homeTeam.displayName || finalized.homeTeam.name} (home, id=${finalized.homeTeam.id}) vs ${finalized.awayTeam.displayName || finalized.awayTeam.name} (away, id=${finalized.awayTeam.id})`);
      console.log(`[Schedule]   Merge key: ${mergeKey}`);
    }

    if (existing) {
      // Check if teams are swapped between existing and finalized games
      // This can happen when games from different sources have teams in different order
      const existingHomeName = (existing.homeTeam.displayName || existing.homeTeam.name || '').toLowerCase();
      const existingAwayName = (existing.awayTeam.displayName || existing.awayTeam.name || '').toLowerCase();
      const finalizedHomeName = (finalized.homeTeam.displayName || finalized.homeTeam.name || '').toLowerCase();
      const finalizedAwayName = (finalized.awayTeam.displayName || finalized.awayTeam.name || '').toLowerCase();
      
      // Normalize team names for comparison
      const normalizedExistingHome = normalizeTeamNameForMerge(existingHomeName);
      const normalizedExistingAway = normalizeTeamNameForMerge(existingAwayName);
      const normalizedFinalizedHome = normalizeTeamNameForMerge(finalizedHomeName);
      const normalizedFinalizedAway = normalizeTeamNameForMerge(finalizedAwayName);
      
      // CRITICAL: Log BEFORE swap detection for Dayton/Virginia (at end, so appears at bottom)
      const isDaytonVirginiaBeforeSwap = (existingHomeName.includes('dayton') && existingAwayName.includes('virginia')) ||
                                        (existingHomeName.includes('virginia') && existingAwayName.includes('dayton')) ||
                                        (finalizedHomeName.includes('dayton') && finalizedAwayName.includes('virginia')) ||
                                        (finalizedHomeName.includes('virginia') && finalizedAwayName.includes('dayton'));
      
      // Check if teams match (either same order or swapped)
      const teamsMatchSameOrder = normalizedExistingHome === normalizedFinalizedHome && 
                                   normalizedExistingAway === normalizedFinalizedAway;
      const teamsMatchSwapped = normalizedExistingHome === normalizedFinalizedAway && 
                                normalizedExistingAway === normalizedFinalizedHome;
      
      // Store debug flag for logging at end
      const isDaytonVirginiaDebug = (existingHomeName.toLowerCase().includes('dayton') && existingAwayName.toLowerCase().includes('virginia')) ||
                                   (existingHomeName.toLowerCase().includes('virginia') && existingAwayName.toLowerCase().includes('dayton')) ||
                                   (finalizedHomeName.toLowerCase().includes('dayton') && finalizedAwayName.toLowerCase().includes('virginia')) ||
                                   (finalizedHomeName.toLowerCase().includes('virginia') && finalizedHomeName.toLowerCase().includes('dayton'));
      
      // Determine which prospects to merge into which side
      let sourceHomeProspects = finalized.homeProspects;
      let sourceAwayProspects = finalized.awayProspects;
      
      // Store original team objects BEFORE any swapping (for logging at end)
      const originalHomeTeam = { ...existing.homeTeam };
      const originalAwayTeam = { ...existing.awayTeam };
      
      if (teamsMatchSwapped && !teamsMatchSameOrder) {
        // Teams are swapped - need to reverse which prospects go where
        // CRITICAL: Also swap team objects (including logos) to keep logos aligned with team names
        
        console.log(`[Schedule] ⚠ Teams are swapped in merged game. Swapping prospects AND team objects.`);
        console.log(`[Schedule]   Existing: ${existingHomeName} (home) vs ${existingAwayName} (away)`);
        console.log(`[Schedule]   Finalized: ${finalizedHomeName} (home) vs ${finalizedAwayName} (away)`);
        
        // Swap prospects
        sourceHomeProspects = finalized.awayProspects; // Swap: finalized away -> existing home
        sourceAwayProspects = finalized.homeProspects; // Swap: finalized home -> existing away
        
        // CRITICAL: When teams are swapped, we need to preserve the CORRECT team names and IDs
        // The finalized team objects have swapped names, so we need to use the original names
        // which correspond to the correct teams after swapping
        
        // CRITICAL: When teamsMatchSwapped is true, it means:
        // - existing.homeTeam.name === finalized.awayTeam.name (e.g., both are "Dayton")
        // - existing.awayTeam.name === finalized.homeTeam.name (e.g., both are "Virginia")
        // This means finalized has the teams in SWAPPED positions:
        // - finalized.homeTeam actually contains the AWAY team's data (e.g., Dayton)
        // - finalized.awayTeam actually contains the HOME team's data (e.g., Virginia)
        // So to fix it, we need to swap finalized's data back:
        // - existing.homeTeam should get finalized.awayTeam (which has the correct home team data, e.g., Virginia)
        // - existing.awayTeam should get finalized.homeTeam (which has the correct away team data, e.g., Dayton)
        
        // Swap team objects - swap finalized's data back to correct positions
        existing.homeTeam = { 
          ...finalized.awayTeam,  // finalized.awayTeam has the home team's data (e.g., Virginia)
        };
        
        existing.awayTeam = { 
          ...finalized.homeTeam,  // finalized.homeTeam has the away team's data (e.g., Dayton)
        };
        
        // Preserve any existing data that shouldn't be overwritten (like scores, status)
        if (originalHomeTeam.score !== undefined) existing.homeTeam.score = originalHomeTeam.score;
        if (originalAwayTeam.score !== undefined) existing.awayTeam.score = originalAwayTeam.score;
      } else if (!teamsMatchSameOrder && !teamsMatchSwapped) {
        // Teams don't match at all - this shouldn't happen but log it
        console.warn(`[Schedule] ⚠ Teams don't match in merged game!`);
        console.warn(`[Schedule]   Existing: ${existingHomeName} (home) vs ${existingAwayName} (away)`);
        console.warn(`[Schedule]   Finalized: ${finalizedHomeName} (home) vs ${finalizedAwayName} (away)`);
      }
      
      // Merge prospects from finalized game into existing game
      const ranks = new Set(existing.prospects.map((p) => p.rank));
      finalized.prospects.forEach((prospect) => {
        if (!ranks.has(prospect.rank)) {
          existing.prospects.push(prospect);
          ranks.add(prospect.rank);
        }
      });

      // Merge home prospects (using potentially swapped source)
      const homeRanks = new Set(existing.homeProspects.map((p) => p.rank));
      sourceHomeProspects.forEach((prospect) => {
        if (!homeRanks.has(prospect.rank)) {
          existing.homeProspects.push(prospect);
          homeRanks.add(prospect.rank);
          // Also ensure it's in the main prospects array
          if (!ranks.has(prospect.rank)) {
            existing.prospects.push(prospect);
            ranks.add(prospect.rank);
          }
        }
      });

      // Merge away prospects (using potentially swapped source)
      const awayRanks = new Set(existing.awayProspects.map((p) => p.rank));
      sourceAwayProspects.forEach((prospect) => {
        if (!awayRanks.has(prospect.rank)) {
          existing.awayProspects.push(prospect);
          awayRanks.add(prospect.rank);
          // Also ensure it's in the main prospects array
          if (!ranks.has(prospect.rank)) {
            existing.prospects.push(prospect);
            ranks.add(prospect.rank);
          }
        }
      });

      // Merge all prospects arrays and re-sort
      existing.prospects.sort((a, b) => a.rank - b.rank);
      existing.homeProspects.sort((a, b) => a.rank - b.rank);
      existing.awayProspects.sort((a, b) => a.rank - b.rank);

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
      
      // CRITICAL: Always log Dayton/Virginia merge debug at the END of function execution (so it appears at bottom of terminal)
      if (isDaytonVirginiaGame || isDaytonVirginiaBeforeSwap) {
        console.log(`\n[Schedule] 🔍 DAYTON/VIRGINIA MERGE DEBUG (at end of merge):`);
        console.log(`[Schedule]   BEFORE SWAP:`);
        console.log(`[Schedule]     Existing: ${existingHomeName} (home, id=${existing.homeTeam.id}) vs ${existingAwayName} (away, id=${existing.awayTeam.id})`);
        console.log(`[Schedule]     Finalized: ${finalizedHomeName} (home, id=${finalized.homeTeam.id}) vs ${finalizedAwayName} (away, id=${finalized.awayTeam.id})`);
        console.log(`[Schedule]   Normalized Existing: ${normalizedExistingHome} vs ${normalizedExistingAway}`);
        console.log(`[Schedule]   Normalized Finalized: ${normalizedFinalizedHome} vs ${normalizedFinalizedAway}`);
        console.log(`[Schedule]   teamsMatchSameOrder: ${teamsMatchSameOrder}`);
        console.log(`[Schedule]   teamsMatchSwapped: ${teamsMatchSwapped}`);
        console.log(`[Schedule]   Will swap: ${teamsMatchSwapped && !teamsMatchSameOrder}`);
        console.log(`[Schedule]   AFTER MERGE:`);
        console.log(`[Schedule]     homeTeam: name=${existing.homeTeam.displayName || existing.homeTeam.name}, id=${existing.homeTeam.id}`);
        console.log(`[Schedule]     awayTeam: name=${existing.awayTeam.displayName || existing.awayTeam.name}, id=${existing.awayTeam.id}`);
        console.log(`[Schedule] 🔍 END MERGE DEBUG\n`);
      }
      
      // CRITICAL: Log Dayton/Virginia swap at the END of function execution (so it appears at bottom of terminal)
      const isDaytonVirginia = (existing.homeTeam.name?.toLowerCase().includes('dayton') && existing.awayTeam.name?.toLowerCase().includes('virginia')) ||
                               (existing.homeTeam.name?.toLowerCase().includes('virginia') && existing.awayTeam.name?.toLowerCase().includes('dayton')) ||
                               (existing.homeTeam.displayName?.toLowerCase().includes('dayton') && existing.awayTeam.displayName?.toLowerCase().includes('virginia')) ||
                               (existing.homeTeam.displayName?.toLowerCase().includes('virginia') && existing.awayTeam.displayName?.toLowerCase().includes('dayton'));
      
      if (isDaytonVirginia && teamsMatchSwapped) {
        console.log(`\n[Schedule] ⚠️ DAYTON/VIRGINIA SWAP DETECTED (at end of merge)`);
        console.log(`[Schedule]   Existing BEFORE SWAP:`);
        console.log(`[Schedule]     homeTeam: name=${originalHomeTeam.displayName || originalHomeTeam.name}, id=${originalHomeTeam.id}, logo=${originalHomeTeam.logo}`);
        console.log(`[Schedule]     awayTeam: name=${originalAwayTeam.displayName || originalAwayTeam.name}, id=${originalAwayTeam.id}, logo=${originalAwayTeam.logo}`);
        console.log(`[Schedule]   Finalized (source):`);
        console.log(`[Schedule]     homeTeam: name=${finalized.homeTeam.displayName || finalized.homeTeam.name}, id=${finalized.homeTeam.id}, logo=${finalized.homeTeam.logo}`);
        console.log(`[Schedule]     awayTeam: name=${finalized.awayTeam.displayName || finalized.awayTeam.name}, id=${finalized.awayTeam.id}, logo=${finalized.awayTeam.logo}`);
        console.log(`[Schedule]   Finalized prospects:`);
        console.log(`[Schedule]     homeProspects: ${(finalized.homeProspects || []).map(p => p.name).join(', ')}`);
        console.log(`[Schedule]     awayProspects: ${(finalized.awayProspects || []).map(p => p.name).join(', ')}`);
        console.log(`[Schedule]   AFTER SWAP:`);
        console.log(`[Schedule]     homeTeam: name=${existing.homeTeam.displayName || existing.homeTeam.name}, id=${existing.homeTeam.id}, logo=${existing.homeTeam.logo}`);
        console.log(`[Schedule]     awayTeam: name=${existing.awayTeam.displayName || existing.awayTeam.name}, id=${existing.awayTeam.id}, logo=${existing.awayTeam.logo}`);
        console.log(`[Schedule]   Final prospects:`);
        console.log(`[Schedule]     homeProspects: ${(existing.homeProspects || []).map(p => p.name).join(', ')}`);
        console.log(`[Schedule]     awayProspects: ${(existing.awayProspects || []).map(p => p.name).join(', ')}`);
        console.log(`[Schedule] ⚠️ END DAYTON/VIRGINIA SWAP LOG\n`);
      }
    } else {
      // No existing game found - add finalized as new game
      gamesByDateMap[dateKey].set(mergeKey, finalized);
      
      // CRITICAL: Log if this is a new Dayton/Virginia game (at end, so appears at bottom)
      const isNewDaytonVirginia = (finalized.homeTeam.name?.toLowerCase().includes('dayton') && finalized.awayTeam.name?.toLowerCase().includes('virginia')) ||
                                 (finalized.homeTeam.name?.toLowerCase().includes('virginia') && finalized.awayTeam.name?.toLowerCase().includes('dayton')) ||
                                 (finalized.homeTeam.displayName?.toLowerCase().includes('dayton') && finalized.awayTeam.displayName?.toLowerCase().includes('virginia')) ||
                                 (finalized.homeTeam.displayName?.toLowerCase().includes('virginia') && finalized.awayTeam.displayName?.toLowerCase().includes('dayton'));
      
      if (isNewDaytonVirginia) {
        console.log(`\n[Schedule] 🆕 NEW DAYTON/VIRGINIA GAME (no merge, added as new):`);
        console.log(`[Schedule]   homeTeam: name=${finalized.homeTeam.displayName || finalized.homeTeam.name}, id=${finalized.homeTeam.id}`);
        console.log(`[Schedule]   awayTeam: name=${finalized.awayTeam.displayName || finalized.awayTeam.name}, id=${finalized.awayTeam.id}`);
        console.log(`[Schedule]   homeProspects: ${(finalized.homeProspects || []).map(p => p.name).join(', ')}`);
        console.log(`[Schedule]   awayProspects: ${(finalized.awayProspects || []).map(p => p.name).join(', ')}`);
        console.log(`[Schedule] 🆕 END NEW GAME LOG\n`);
      }
    }
    
  }

  const gamesByDate: Record<string, GameWithProspects[]> = {};

  // If targetDate is specified, process that date first and return early
  if (targetDate && gamesByDateMap[targetDate]) {
    const targetMap = gamesByDateMap[targetDate];
    const targetGames = Array.from(targetMap.values());
    targetGames.sort((a, b) => {
      const aSort =
        typeof a.sortTimestamp === 'number' ? a.sortTimestamp : Number.MAX_SAFE_INTEGER;
      const bSort =
        typeof b.sortTimestamp === 'number' ? b.sortTimestamp : Number.MAX_SAFE_INTEGER;
      if (aSort === bSort) {
        return (a.tipoff ?? '').localeCompare(b.tipoff ?? '');
      }
      return aSort - bSort;
    });
    gamesByDate[targetDate] = targetGames;
    
    console.log(`[Schedule] Early return: ${targetGames.length} games for ${targetDate} (source: ${source})`);
    console.timeEnd('[Schedule] buildSchedules total');
    
    return {
      gamesByDate,
      allGames: targetGames,
      source,
    };
  }

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

  console.timeEnd('[Schedule] buildSchedules total');

  return {
    gamesByDate,
    allGames,
    source,
  };
};

export const loadAllSchedules = async (
  source: RankingSource = 'espn',
  forceReload = false,
  clerkUserId?: string
): Promise<LoadedSchedules> => {
  // Check if cache should be invalidated due to file changes
  // Note: For custom players/watchlist, we still cache but with user-specific key
  if (shouldInvalidateCache() || forceReload) {
    clearScheduleCache(source);
  }
  
  // CRITICAL: Don't use cache if user is logged in (clerkUserId provided)
  // Cached schedules include user-specific watchlist data from previous user
  // This caused the bug where only one user's watchlist games were shown
  const shouldUseCache = cachedSchedules[source] && !forceReload && !clerkUserId;
  
  if (shouldUseCache) {
    console.log(`[Schedule] Using cached schedules for ${source} (no user)`);
    return cachedSchedules[source]!;
  }

  if (buildPromises[source]) {
    return buildPromises[source]!;
  }

  buildPromises[source] = (async () => {
    try {
      // Skip enrichment by default - ESPN API calls are too slow (10-20+ seconds)
      // Enable only if explicitly requested via environment variable
      const skipEnrichment = process.env.ENABLE_ENRICHMENT !== 'true';
      
      if (skipEnrichment) {
        console.log('[Schedule] Skipping ESPN API enrichment for faster load (set ENABLE_ENRICHMENT=true to enable)');
      }
      
      const result = await buildSchedules(source, skipEnrichment, clerkUserId);
      // Cache the result (even for myboard with custom players - the base games are the same)
      // Custom players/watchlist are merged during buildSchedules, so the cached result includes them
      cachedSchedules[source] = result;
      cacheTimestamp = Date.now();
      return result;
    } finally {
      buildPromises[source] = null;
    }
  })();

  return buildPromises[source]!;
};

export const getGamesBetween = async (
  startDate: string,
  endDate: string,
  source: RankingSource = 'espn',
  clerkUserId?: string
): Promise<Record<string, GameWithProspects[]>> => {
  const { gamesByDate } = await loadAllSchedules(source, false, clerkUserId);
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

export const getGamesForDate = async (
  date: string,
  source: RankingSource = 'espn',
  clerkUserId?: string
): Promise<GameWithProspects[]> => {
  const { gamesByDate } = await loadAllSchedules(source, false, clerkUserId);
  return gamesByDate[date] ?? [];
};

