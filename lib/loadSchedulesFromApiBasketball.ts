// Integration with API-Basketball (via RapidAPI) for international league schedules
// Pro plan provides access to EuroLeague, ACB, LNB, and other European leagues

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
import { parse, format } from 'date-fns';
import { cacheTeamLogo } from './teamLogoService';

// Get API key from environment - user should set this in .env.local
// The key from their dashboard should be: 137753bdboce20234730692c73 (based on dashboard)
const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
// API-Sports endpoint - from documentation: https://v1.basketball.api-sports.io/
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

// Log API key status (first 8 chars only for security)
if (process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY) {
  const key = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '';
  console.log(`[API-Basketball] Using API key from environment: ${key.substring(0, 8)}...`);
} else {
  console.log(`[API-Basketball] Using default API key: ${API_KEY.substring(0, 8)}...`);
  console.log(`[API-Basketball] To use a custom key, set API_SPORTS_BASKETBALL_KEY in .env.local and restart the server`);
}

// API-Sports headers - from documentation examples
// Use x-apisports-key header (not x-rapidapi-key) for API-Sports accounts
const headers = {
  'x-apisports-key': API_KEY,
};

// Cache for team ID lookups (team name -> api-basketball team ID)
const teamIdCache = new Map<string, number | null>();

// Cache for league IDs (league name -> api-basketball league ID)
const leagueIdCache = new Map<string, number>();

// Display name overrides for API-Basketball teams
// Maps API team names to preferred display names on the website
const TEAM_DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  'Mega Basket': 'Mega Superbet',
  'mega basket': 'Mega Superbet',
};

// Mapping of prospect team names to api-basketball team IDs
// These are known mappings for teams that prospects play for
// Format: normalized team name -> { teamId, leagueIds, leagueName, seasonFormat, lnbTeamId }
// leagueIds is an array because teams often play in multiple leagues (EuroLeague + domestic league)
// seasonFormat: 'YYYY' for single year or 'YYYY-YYYY' for range format
// lnbTeamId is the team ID in LNB Pro A (may differ from EuroLeague team ID)
const TEAM_ID_MAPPINGS: Record<string, { 
  teamId: number; 
  leagueIds?: number[]; 
  leagueName?: string; 
  seasonFormat?: 'YYYY' | 'YYYY-YYYY';
  lnbTeamId?: number;
}> = {
  // EuroLeague Teams (also play in domestic leagues)
  // Note: EuroLeague uses 'YYYY' but domestic leagues may use 'YYYY-YYYY'
  'partizan': { teamId: 1068, leagueIds: [120, 198], leagueName: 'Euroleague + ABA League', seasonFormat: 'YYYY' },
  'partizanmozzartbet': { teamId: 1068, leagueIds: [120, 198], leagueName: 'Euroleague + ABA League', seasonFormat: 'YYYY' },
  'partizanbelgrade': { teamId: 1068, leagueIds: [120, 198], leagueName: 'Euroleague + ABA League', seasonFormat: 'YYYY' },
  'valencia': { teamId: 2341, leagueIds: [120, 117], leagueName: 'Euroleague + Liga ACB', seasonFormat: 'YYYY-YYYY' }, // Liga ACB uses YYYY-YYYY
  'valenciabasket': { teamId: 2341, leagueIds: [120, 117], leagueName: 'Euroleague + Liga ACB', seasonFormat: 'YYYY-YYYY' },
  'asvel': { teamId: 26, leagueIds: [120, 2], leagueName: 'Euroleague + LNB Pro A', seasonFormat: 'YYYY-YYYY', lnbTeamId: undefined }, // LNB uses YYYY-YYYY
  'ldlcasvel': { teamId: 26, leagueIds: [120, 2], leagueName: 'Euroleague + LNB Pro A', seasonFormat: 'YYYY-YYYY', lnbTeamId: undefined },
  'asvelbasket': { teamId: 26, leagueIds: [120, 2], leagueName: 'Euroleague + LNB Pro A', seasonFormat: 'YYYY-YYYY', lnbTeamId: undefined },
  'lyonvilleurbanne': { teamId: 26, leagueIds: [120, 2], leagueName: 'Euroleague + LNB Pro A', seasonFormat: 'YYYY-YYYY', lnbTeamId: undefined },
  'lyon': { teamId: 26, leagueIds: [120, 2], leagueName: 'Euroleague + LNB Pro A', seasonFormat: 'YYYY-YYYY', lnbTeamId: undefined },
  // French LNB Pro A teams
  'chalon': { teamId: 20, leagueIds: [2, 119], leagueName: 'LNB Pro A + BCL', seasonFormat: 'YYYY-YYYY' }, // Chalon/Saone - League ID 2 (LNB Pro A), 119 (BCL)
  'chalonsaone': { teamId: 20, leagueIds: [2, 119], leagueName: 'LNB Pro A + BCL', seasonFormat: 'YYYY-YYYY' },
  'elanchalon': { teamId: 20, leagueIds: [2, 119], leagueName: 'LNB Pro A + BCL', seasonFormat: 'YYYY-YYYY' },
  'parisbasketball': { teamId: 108, leagueIds: [120, 2], leagueName: 'Euroleague + LNB Pro A', seasonFormat: 'YYYY-YYYY', lnbTeamId: undefined },
  'parisbasket': { teamId: 108, leagueIds: [120, 2], leagueName: 'Euroleague + LNB Pro A', seasonFormat: 'YYYY-YYYY', lnbTeamId: undefined },
  'paris': { teamId: 108, leagueIds: [120, 2], leagueName: 'Euroleague + LNB Pro A', seasonFormat: 'YYYY-YYYY', lnbTeamId: undefined },
  
  // Liga ACB Teams (domestic Spanish league)
  'joventutbadalona': { teamId: 2334, leagueIds: [117], leagueName: 'Liga ACB', seasonFormat: 'YYYY-YYYY' },
  'joventut': { teamId: 2334, leagueIds: [117], leagueName: 'Liga ACB', seasonFormat: 'YYYY-YYYY' },
  
  // ABA League (Adriatic) Teams
  // ABA League uses "YYYY" (single year) format
  'megasuperbet': { teamId: 3161, leagueIds: [198], leagueName: 'ABA League', seasonFormat: 'YYYY' },
  'mega': { teamId: 3161, leagueIds: [198], leagueName: 'ABA League', seasonFormat: 'YYYY' },
  'megasoccerbet': { teamId: 3161, leagueIds: [198], leagueName: 'ABA League', seasonFormat: 'YYYY' },
  'megamis': { teamId: 3161, leagueIds: [198], leagueName: 'ABA League', seasonFormat: 'YYYY' },
  'megabasket': { teamId: 3161, leagueIds: [198], leagueName: 'ABA League', seasonFormat: 'YYYY' },
  'cedevitaolimpija': { teamId: 2342, leagueIds: [121], leagueName: 'ABA League', seasonFormat: 'YYYY' },
  'cedevita': { teamId: 2342, leagueIds: [121], leagueName: 'ABA League', seasonFormat: 'YYYY' },
  
  // Add more mappings as needed - you can find team IDs by searching the API
};

/**
 * Get season format for a given league ID
 * Returns 'YYYY-YYYY' or 'YYYY' or undefined if unknown
 */
function getLeagueSeasonFormat(leagueId: number): 'YYYY' | 'YYYY-YYYY' | undefined {
  const league = SUPPORTED_LEAGUES.find(l => l.id === leagueId);
  return league?.seasonFormat;
}

// Supported leagues for api-basketball with season formats
// seasonFormat: 'YYYY' for single year (e.g., 2025), 'YYYY-YYYY' for range (e.g., 2025-2026)
const SUPPORTED_LEAGUES = [
  // Pan-European Leagues
  { id: 120, name: 'Euroleague', seasonFormat: 'YYYY' },
  { id: 121, name: 'Eurocup', seasonFormat: 'YYYY' },
  { id: 119, name: 'Basketball Champions League', seasonFormat: 'YYYY-YYYY' },
  { id: 242, name: 'FIBA Europe Cup', seasonFormat: 'YYYY-YYYY' },
  
  // Domestic Leagues - Major European
  { id: 117, name: 'Liga ACB', seasonFormat: 'YYYY-YYYY' }, // Spain
  { id: 2, name: 'LNB Pro A', seasonFormat: 'YYYY-YYYY' }, // France
  { id: 127, name: 'Basketball Bundesliga', seasonFormat: 'YYYY-YYYY' }, // Germany (BBL)
  { id: 128, name: 'Lega Basket Serie A', seasonFormat: 'YYYY-YYYY' }, // Italy
  { id: 133, name: 'Turkish Basketball Super League', seasonFormat: 'YYYY-YYYY' }, // Turkey (BSL)
  { id: 132, name: 'Greek Basket League', seasonFormat: 'YYYY-YYYY' }, // Greece (A1)
  { id: 198, name: 'ABA League', seasonFormat: 'YYYY' }, // Adriatic League
  { id: 149, name: 'VTB United League', seasonFormat: 'YYYY-YYYY' }, // Russia/Eastern Europe
  
  // Regional Leagues
  { id: 135, name: 'Baltic Basketball League', seasonFormat: 'YYYY-YYYY' },
  { id: 136, name: 'Polish Basketball League', seasonFormat: 'YYYY-YYYY' }, // PLK
  
  // Domestic Cups
  { id: 262, name: 'Copa del Rey', seasonFormat: 'YYYY-YYYY' }, // Spain
  { id: 263, name: 'Coupe de France', seasonFormat: 'YYYY-YYYY' }, // France
  
  // Legacy reference (not actively used)
  { id: 118, name: 'LNB Pro A (old ID)', seasonFormat: 'YYYY-YYYY' },
];

/**
 * Search for a team in api-basketball by name
 */
async function searchTeamByName(teamName: string): Promise<number | null> {
  const normalizedName = teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Check cache first
  if (teamIdCache.has(normalizedName)) {
    return teamIdCache.get(normalizedName) || null;
  }
  
  try {
    // API-Sports endpoint format: /teams?search={name}
    // Based on documentation pattern: GET /teams?search={name}
    const url = `${BASE_URL}/teams?search=${encodeURIComponent(teamName)}`;
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.warn(`[API-Basketball] Failed to search team "${teamName}": ${response.status}`);
      teamIdCache.set(normalizedName, null);
      return null;
    }
    
    const data = await response.json();
    
    if (data.response && data.response.length > 0) {
      // Return the first match (you might want to improve matching logic)
      const teamId = data.response[0].id;
      teamIdCache.set(normalizedName, teamId);
      console.log(`[API-Basketball] Found team "${teamName}" -> ID: ${teamId}`);
      return teamId;
    }
    
    teamIdCache.set(normalizedName, null);
    return null;
  } catch (error) {
    console.error(`[API-Basketball] Error searching team "${teamName}":`, error);
    teamIdCache.set(normalizedName, null);
    return null;
  }
}

/**
 * Get api-basketball team ID for a prospect's team
 */
async function getApiBasketballTeamId(teamName: string): Promise<number | null> {
  const normalizedName = teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Check known mappings first
  if (TEAM_ID_MAPPINGS[normalizedName]) {
    return TEAM_ID_MAPPINGS[normalizedName].teamId;
  }
  
  // Try partial matches in mappings
  for (const [key, value] of Object.entries(TEAM_ID_MAPPINGS)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return value.teamId;
    }
  }
  
  // If not found in mappings, search the API
  return await searchTeamByName(teamName);
}

/**
 * Fetch games for a team from api-basketball
 */
async function fetchTeamGames(
  teamId: number,
  season?: number | string,
  leagueId?: number,
  dateFrom?: string,
  dateTo?: string
): Promise<any[]> {
  try {
    // Build query parameters for API-Sports
    const params = new URLSearchParams();
    params.append('team', String(teamId));
    
    // API-Sports REQUIRES season parameter (can be number like 2025 or string like "2024-2025")
    if (season !== undefined) {
      params.append('season', String(season));
    }
    
    // Add date filters if provided
    // API-Sports uses dateFrom and dateTo for date ranges
    if (dateFrom) {
      params.append('dateFrom', dateFrom);
    }
    
    if (dateTo && dateTo !== dateFrom) {
      params.append('dateTo', dateTo);
    }
    
    if (leagueId) {
      params.append('league', String(leagueId));
    }
    
    // API-Sports endpoint format: /games?team={id}&date={date}&league={id}
    // Based on documentation, basketball API uses /games endpoint
    const url = `${BASE_URL}/games?${params.toString()}`;
    console.log(`[API-Basketball] Fetching games: ${url}`);
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[API-Basketball] Failed to fetch games for team ${teamId}: ${response.status} ${response.statusText}`);
      console.warn(`[API-Basketball] Response: ${errorText.substring(0, 200)}`);
      return [];
    }
    
    const data = await response.json();
    
    // Debug: Log full response structure for Mega Superbet
    if (teamId === 2344) {
      console.log(`[API-Basketball] 🔵 MEGA DEBUG - Full API response:`, JSON.stringify(data, null, 2).substring(0, 1000));
      console.log(`[API-Basketball] 🔵 Response structure:`, {
        hasResponse: !!data.response,
        responseType: Array.isArray(data.response) ? 'array' : typeof data.response,
        responseLength: Array.isArray(data.response) ? data.response.length : 'N/A',
        hasResults: 'results' in data,
        results: data.results,
        keys: Object.keys(data)
      });
    }
    
    if (data.response && Array.isArray(data.response)) {
      console.log(`[API-Basketball] Successfully fetched ${data.response.length} games for team ${teamId}`);
      return data.response;
    }
    
    // Also check if response is directly an array
    if (Array.isArray(data)) {
      console.log(`[API-Basketball] Successfully fetched ${data.length} games for team ${teamId}`);
      return data;
    }
    
    console.warn(`[API-Basketball] Unexpected response format for team ${teamId}:`, JSON.stringify(data).substring(0, 500));
    return [];
  } catch (error) {
    console.error(`[API-Basketball] Error fetching games for team ${teamId}:`, error);
    return [];
  }
}

/**
 * Convert api-basketball game to ParsedScheduleEntry
 */
async function convertApiBasketballGameToEntry(
  apiGame: any,
  prospect: Prospect,
  teamDisplay: string,
  directory: Map<string, TeamDirectoryEntry>
): Promise<ParsedScheduleEntry | null> {
  try {
    // Parse game data from api-basketball format
    // Example structure:
    // {
    //   id: 12345,
    //   date: "2025-11-19T19:30:00+00:00",
    //   time: "19:30:00",
    //   timestamp: 1732039800,
    //   timezone: "UTC",
    //   stage: "Regular Season",
    //   week: null,
    //   status: { long: "Not Started", short: "NS" },
    //   league: { id: 120, name: "Euroleague", ... },
    //   country: { id: 5, name: "Spain", ... },
    //   teams: {
    //     home: { id: 2341, name: "Valencia Basket", ... },
    //     away: { id: 26, name: "ASVEL", ... }
    //   },
    //   scores: { home: null, away: null },
    //   ...
    // }
    
    // API returns times in UTC - parse the full ISO date string which includes timezone
    // apiGame.date is like "2025-11-19T19:00:00+00:00" (UTC)
    const gameDateTimeUTC = apiGame.date ? new Date(apiGame.date) : null;
    if (!gameDateTimeUTC || isNaN(gameDateTimeUTC.getTime())) {
      console.warn(`[API-Basketball] Invalid date for game ${apiGame.id}: ${apiGame.date}`);
      return null;
    }
    
    // Determine the game's local timezone based on league/country
    // This ensures games appear on the correct calendar day.
    // IMPORTANT: dateKey uses the game's local timezone, while tipoff display uses user's local timezone.
    // This ensures a game at 11 PM Madrid time appears on that date in Madrid, not the user's date.
    let gameTimezone: string = 'UTC'; // Default fallback
    
    // Map leagues/countries to their timezones
    const leagueId = apiGame.league?.id;
    const countryName = apiGame.country?.name?.toLowerCase() || '';
    
    if (leagueId === 117) {
      // Liga ACB - Spain
      gameTimezone = 'Europe/Madrid';
    } else if (leagueId === 120) {
      // Euroleague - use country-based timezone
      if (countryName.includes('spain')) {
        gameTimezone = 'Europe/Madrid';
      } else if (countryName.includes('france')) {
        gameTimezone = 'Europe/Paris';
      } else if (countryName.includes('germany')) {
        gameTimezone = 'Europe/Berlin';
      } else if (countryName.includes('italy')) {
        gameTimezone = 'Europe/Rome';
      } else if (countryName.includes('greece')) {
        gameTimezone = 'Europe/Athens';
      } else if (countryName.includes('turkey')) {
        gameTimezone = 'Europe/Istanbul';
      } else {
        // Default to Madrid for Euroleague
        gameTimezone = 'Europe/Madrid';
      }
    } else if (leagueId === 2) {
      // LNB Pro A - France (corrected: actual league ID is 2, not 118)
      gameTimezone = 'Europe/Paris';
    } else if (leagueId === 119) {
      // Basketball Champions League - use country-based timezone
      if (countryName.includes('spain')) {
        gameTimezone = 'Europe/Madrid';
      } else if (countryName.includes('france')) {
        gameTimezone = 'Europe/Paris';
      } else {
        gameTimezone = 'Europe/Madrid'; // Default
      }
    } else if (countryName.includes('spain')) {
      gameTimezone = 'Europe/Madrid';
    } else if (countryName.includes('france')) {
      gameTimezone = 'Europe/Paris';
    }
    
    // Get the date in the game's local timezone (ensures correct calendar day)
    // This is critical: a game at 11 PM Madrid time should appear on that date in Madrid,
    // not on the date it appears in the user's timezone
    const gameDateParts = gameDateTimeUTC.toLocaleString('en-US', { 
      timeZone: gameTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).split('/');
    const [gameMonth, gameDay, gameYear] = gameDateParts;
    const dateKey = `${gameYear}-${gameMonth.padStart(2, '0')}-${gameDay.padStart(2, '0')}`;
    
    // Get time components in the game's local timezone for isoTime (for consistency)
    const gameTimeStr = gameDateTimeUTC.toLocaleString('en-US', {
      timeZone: gameTimezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23'
    });
    const [gameHours, gameMinutes] = gameTimeStr.split(':').map(Number);
    const isoTime = `${gameHours.toString().padStart(2, '0')}:${gameMinutes.toString().padStart(2, '0')}`;
    
    // Format time in user's local timezone for display (no timezone label)
    const userLocalDateTime = new Date(gameDateTimeUTC);
    const timeStrFormatted = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(userLocalDateTime);
    
    // Get user's local hours/minutes for sorting (sort by when user sees the game)
    const hours = userLocalDateTime.getHours();
    const minutes = userLocalDateTime.getMinutes();
    const sortTimestamp = hours * 60 + minutes;
    
    // Get team names, IDs, and logos from API response
    const homeTeamName = apiGame.teams?.home?.name || '';
    const awayTeamName = apiGame.teams?.away?.name || '';
    const homeTeamId = apiGame.teams?.home?.id;
    const awayTeamId = apiGame.teams?.away?.id;
    const homeTeamLogo = apiGame.teams?.home?.logo || '';
    const awayTeamLogo = apiGame.teams?.away?.logo || '';
    
    if (!homeTeamName || !awayTeamName) {
      console.warn(`[API-Basketball] Missing team names for game ${apiGame.id}`);
      return null;
    }
    
    // Debug logging for specific matchups
    const isValenciaJoventut = (homeTeamName.toLowerCase().includes('valencia') && awayTeamName.toLowerCase().includes('joventut')) ||
                               (awayTeamName.toLowerCase().includes('valencia') && homeTeamName.toLowerCase().includes('joventut'));
    const isValenciaLyon = (homeTeamName.toLowerCase().includes('valencia') && (awayTeamName.toLowerCase().includes('lyon') || awayTeamName.toLowerCase().includes('asvel'))) ||
                           (awayTeamName.toLowerCase().includes('valencia') && (homeTeamName.toLowerCase().includes('lyon') || homeTeamName.toLowerCase().includes('asvel')));
    const isValenciaParis = (homeTeamName.toLowerCase().includes('valencia') && awayTeamName.toLowerCase().includes('paris')) ||
                            (awayTeamName.toLowerCase().includes('valencia') && homeTeamName.toLowerCase().includes('paris'));
    
    if (isValenciaJoventut || isValenciaLyon || isValenciaParis) {
      console.log(`[API-Basketball] 🔍 Processing game: ${awayTeamName} @ ${homeTeamName}`);
      console.log(`[API-Basketball]   Prospect: ${prospect.name} (${prospect.rank}), Team: ${teamDisplay || prospect.team}`);
      console.log(`[API-Basketball]   Raw API names: home="${homeTeamName}", away="${awayTeamName}"`);
    }
    
    // Determine prospect's side
    // Normalize team names for matching (remove common suffixes, handle variations)
    // Also strip parenthetical info like "(France)" or "(Spain)"
    let prospectTeamName = (teamDisplay || prospect.team || '').toLowerCase();
    prospectTeamName = prospectTeamName.replace(/\s*\([^)]+\)\s*$/, '').trim(); // Remove parenthetical info
    const normalizedProspectTeam = prospectTeamName.replace(/[^a-z0-9]/g, '');
    const normalizedHomeTeam = homeTeamName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedAwayTeam = awayTeamName.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Team name mappings for API-Basketball variations
    const teamVariations: Record<string, string[]> = {
      'joventut': ['joventut', 'joventutbadalona'],
      'asvel': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel'],
      'mega': ['mega', 'megasuperbet', 'megasoccerbet', 'megamis', 'megabasket'],
    };
    
    // Get all variations for prospect's team
    const prospectVariations: string[] = [normalizedProspectTeam];
    for (const [key, variations] of Object.entries(teamVariations)) {
      if (normalizedProspectTeam.includes(key) || variations.some(v => normalizedProspectTeam.includes(v))) {
        prospectVariations.push(...variations);
      }
    }
    
    // Check if prospect's team matches home or away team
    const prospectIsHome = prospectVariations.some(variant => 
      normalizedHomeTeam.includes(variant) || variant.includes(normalizedHomeTeam)
    );
    
    const prospectIsAway = prospectVariations.some(variant => 
      normalizedAwayTeam.includes(variant) || variant.includes(normalizedAwayTeam)
    );
    
    if (!prospectIsHome && !prospectIsAway) {
      console.warn(`[API-Basketball] Prospect team "${prospectTeamName}" (normalized: "${normalizedProspectTeam}") doesn't match game teams: "${homeTeamName}" (${normalizedHomeTeam}) vs "${awayTeamName}" (${normalizedAwayTeam})`);
      // Don't return null - still create the entry, let the system figure out which side
    }
    
    // Apply display name overrides (e.g., "Mega Basket" -> "Mega Superbet")
    const displayHomeTeamName = TEAM_DISPLAY_NAME_OVERRIDES[homeTeamName] || homeTeamName;
    const displayAwayTeamName = TEAM_DISPLAY_NAME_OVERRIDES[awayTeamName] || awayTeamName;
    
    // Resolve team names (use display names for resolution)
    const resolvedHomeTeam = resolveTeamName(displayHomeTeamName, directory);
    const resolvedAwayTeam = resolveTeamName(displayAwayTeamName, directory);
    const simplifiedHomeTeam = simplifyTeamName(resolvedHomeTeam);
    const simplifiedAwayTeam = simplifyTeamName(resolvedAwayTeam);
    
    if (isValenciaJoventut || isValenciaLyon || isValenciaParis) {
      console.log(`[API-Basketball]   After resolve/simplify: home="${simplifiedHomeTeam}", away="${simplifiedAwayTeam}"`);
    }
    
    // Determine location type based on which team the prospect is on
    let locationType: 'home' | 'away' | 'neutral' = 'neutral';
    if (prospectIsHome) {
      locationType = 'home';
    } else if (prospectIsAway) {
      locationType = 'away';
    }
    
    if (apiGame.stage?.toLowerCase().includes('neutral') || 
        apiGame.venue?.toLowerCase().includes('neutral')) {
      locationType = 'neutral';
    }
    
    // Build game key (use display names for consistency)
    // Include league info to prevent merging games from different leagues (e.g., Partizan EuroLeague vs Partizan NBL)
    const leagueInfo = apiGame.league?.name || apiGame.league?.id?.toString() || 'api-basketball';
    const tipoffTime = `${dateKey}T${isoTime}`;
    const key = buildGameKey(dateKey, isoTime, simplifiedHomeTeam, simplifiedAwayTeam, apiGame.venue, leagueInfo);
    
    if (isValenciaJoventut || isValenciaLyon || isValenciaParis) {
      console.log(`[API-Basketball]   Built game key: ${key}`);
    }
    
    // Look up team entries for logos (fallback if API doesn't provide)
    const homeTeamEntry = findTeamEntryInDirectory(directory, simplifiedHomeTeam);
    const awayTeamEntry = findTeamEntryInDirectory(directory, simplifiedAwayTeam);
    
    // Create team info objects - use display names and API logo if available, otherwise fall back to directory
    const homeTeamInfo = await createTeamInfo(displayHomeTeamName, homeTeamEntry);
    const awayTeamInfo = await createTeamInfo(displayAwayTeamName, awayTeamEntry);
    
    // Ensure display names are preserved (override any changes from resolveTeamName/simplifyTeamName)
    homeTeamInfo.displayName = displayHomeTeamName;
    homeTeamInfo.name = displayHomeTeamName;
    awayTeamInfo.displayName = displayAwayTeamName;
    awayTeamInfo.name = displayAwayTeamName;
    
    // Override with API-Basketball logos if available (they're more reliable for European teams)
    if (homeTeamLogo) {
      homeTeamInfo.logo = homeTeamLogo;
    }
    if (awayTeamLogo) {
      awayTeamInfo.logo = awayTeamLogo;
    }
    
    // Cache team logos to database (async, non-blocking)
    if (homeTeamId && homeTeamLogo) {
      cacheTeamLogo(homeTeamId, displayHomeTeamName, homeTeamLogo, 'api-basketball').catch(err => {
        console.warn('[API-Basketball] Failed to cache home team logo:', err);
      });
    }
    if (awayTeamId && awayTeamLogo) {
      cacheTeamLogo(awayTeamId, displayAwayTeamName, awayTeamLogo, 'api-basketball').catch(err => {
        console.warn('[API-Basketball] Failed to cache away team logo:', err);
      });
    }
    
    // Extract scores if game is completed or live
    // API-Basketball structure: scores: { home: { total: 85 }, away: { total: 78 } }
    const gameStatus = apiGame.status?.short || 'NS';
    const isCompleted = gameStatus === 'FT' || gameStatus === 'AOT' || gameStatus === 'CANC';
    const isLive = gameStatus === 'LIVE' || gameStatus === '1Q' || gameStatus === '2Q' || gameStatus === '3Q' || gameStatus === '4Q' || gameStatus === 'OT';
    
    if (isCompleted || isLive) {
      const homeScoreRaw = apiGame.scores?.home?.total ?? apiGame.scores?.home;
      const awayScoreRaw = apiGame.scores?.away?.total ?? apiGame.scores?.away;
      
      if (homeScoreRaw !== undefined && homeScoreRaw !== null) {
        homeTeamInfo.score = String(homeScoreRaw);
      }
      if (awayScoreRaw !== undefined && awayScoreRaw !== null) {
        awayTeamInfo.score = String(awayScoreRaw);
      }
    }
    
    // Get league/competition name
    const leagueName = apiGame.league?.name || '';
    const note = leagueName ? `${leagueName}${apiGame.stage ? ` - ${apiGame.stage}` : ''}` : undefined;
    
    // Determine game status string
    let gameStatusStr = 'SCHEDULED';
    if (isLive) {
      gameStatusStr = 'LIVE';
    } else if (isCompleted) {
      gameStatusStr = 'COMPLETED';
    } else if (gameStatus === 'NS') {
      gameStatusStr = 'SCHEDULED';
    } else {
      gameStatusStr = gameStatus;
    }
    
    const game: AggregatedGameInternal = {
      id: `api-basketball-${apiGame.id}`,
      date: tipoffTime,
      homeTeam: homeTeamInfo,
      awayTeam: awayTeamInfo,
      status: gameStatusStr,
      venue: apiGame.venue,
      prospects: [],
      homeProspects: [],
      awayProspects: [],
      tipoff: timeStrFormatted,
      tv: undefined,
      note,
      highlight: undefined,
      dateKey,
      locationType,
      sortTimestamp,
      _prospectRanks: new Set<number>(),
      _homeProspectRanks: new Set<number>(),
      _awayProspectRanks: new Set<number>(),
    };
    
    // Determine prospect side (default to home if we can't determine)
    const prospectSide = prospectIsHome ? 'home' : (prospectIsAway ? 'away' : 'home');
    
    return {
      key,
      game,
      prospect,
      prospectSide,
    };
  } catch (error) {
    console.error(`[API-Basketball] Failed to convert game to entry:`, error);
    return null;
  }
}

/**
 * Fetch schedule for a prospect using api-basketball
 */
export async function fetchProspectScheduleFromApiBasketball(
  prospect: Prospect,
  teamDisplay: string,
  directory: Map<string, TeamDirectoryEntry>,
  knownTeamId?: number  // Optional: If provided, skips name resolution
): Promise<ParsedScheduleEntry[]> {
  // Try multiple team name sources, stripping parenthetical info like "(France)" or "(Spain)"
  let teamName = teamDisplay || prospect.espnTeamName || prospect.team || '';
  
  // Ensure teamName is a string
  if (typeof teamName !== 'string') {
    teamName = String(teamName || '');
  }
  
  // Remove parenthetical info like "(France)" or "(Spain)" for matching
  teamName = teamName.replace(/\s*\([^)]+\)\s*$/, '').trim();
  
  console.log(`[API-Basketball] Fetching schedule for ${prospect.name} (team: "${teamName}", original teamDisplay: "${teamDisplay}", original team: "${prospect.team}", knownTeamId: ${knownTeamId || 'none'})`);
  
  // Get team ID - use provided ID if available, otherwise resolve by name
  let teamId: number | null;
  if (knownTeamId) {
    teamId = knownTeamId;
    console.log(`[API-Basketball] ✓ Using provided team ID ${teamId} for ${prospect.name} (skipping name resolution)`);
  } else {
    teamId = await getApiBasketballTeamId(teamName);
    if (!teamId) {
      console.warn(`[API-Basketball] No team ID found for "${teamName}" (prospect: ${prospect.name})`);
      console.warn(`[API-Basketball] Tried teamDisplay: "${teamDisplay}", espnTeamName: "${prospect.espnTeamName}", team: "${prospect.team}"`);
      return [];
    }
    console.log(`[API-Basketball] ✓ Found team ID ${teamId} for ${prospect.name} (team: "${teamName}")`);
  }
  
  // For Mega Superbet, verify the team ID by searching the API
  if (teamId === 1693) {
    console.log(`[API-Basketball] 🔵 MEGA DEBUG - Verifying team ID by searching API for "Mega Superbet"...`);
    const searchResults = await searchTeamByName('Mega Superbet');
    if (searchResults && searchResults !== teamId) {
      console.warn(`[API-Basketball] 🔵 WARNING - API search returned different team ID: ${searchResults} (expected: ${teamId})`);
    } else if (searchResults === teamId) {
      console.log(`[API-Basketball] 🔵 Verified team ID ${teamId} is correct`);
    } else {
      console.warn(`[API-Basketball] 🔵 WARNING - API search returned no results for "Mega Superbet"`);
    }
  }
  
  // Get team mapping info to determine league
  const normalizedName = teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const teamMapping = TEAM_ID_MAPPINGS[normalizedName] || 
    Object.entries(TEAM_ID_MAPPINGS).find(([key]) => 
      normalizedName.includes(key) || key.includes(normalizedName)
    )?.[1];
  
  const leagueIds = teamMapping?.leagueIds || (teamMapping?.leagueId ? [teamMapping.leagueId] : undefined);
  const leagueName = teamMapping?.leagueName || 'Unknown';
  const baseTeamId = teamMapping?.teamId || teamId; // Use mapping team ID if available, otherwise use discovered teamId
  const lnbTeamId = teamMapping?.lnbTeamId; // Separate team ID for LNB Pro A
  
  console.log(`[API-Basketball] Team mapping: leagueIds=${leagueIds?.join(', ') || 'all'}, leagueName=${leagueName}`);
  if (lnbTeamId) {
    console.log(`[API-Basketball] Using separate LNB team ID: ${lnbTeamId} (EuroLeague team ID: ${baseTeamId})`);
  }
  
  // For Mega Superbet / ABA League, try using date range instead of season
  // ABA League might use a different season format or the API might not have season-based data
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateFrom = new Date(today);
  dateFrom.setDate(dateFrom.getDate() - 30); // Start 30 days ago
  const dateTo = new Date(today);
  dateTo.setDate(dateTo.getDate() + 365); // End 365 days from now
  
  const dateFromStr = format(dateFrom, 'yyyy-MM-dd');
  const dateToStr = format(dateTo, 'yyyy-MM-dd');
  
  console.log(`[API-Basketball] 🔵 Trying date range query: ${dateFromStr} to ${dateToStr}`);
  
  // Fetch games from ALL leagues for this team (EuroLeague + domestic league)
  // If leagueIds is specified, fetch from each league; otherwise fetch from all leagues
  let apiGames: any[] = [];
  
  // Determine season format based on leagues
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  const hasACB = leagueIds?.includes(117);
  const hasABALeague = leagueIds?.includes(198);
  
  // For Liga ACB, we need to use season format "YYYY-YYYY"
  // For other leagues, try date range first, then fall back to season if needed
  // Helper function to discover LNB team ID for French teams
  const discoverLnbTeamId = async (teamName: string, leagueId: number, season: string | number): Promise<number | null> => {
    try {
      // Search for teams in the league
      const teamsParams = new URLSearchParams({
        league: String(leagueId),
        season: String(season),
      });
      const teamsUrl = `${BASE_URL}/teams?${teamsParams.toString()}`;
      
      const teamsResponse = await fetch(teamsUrl, {
        headers: {
          'x-apisports-key': API_KEY,
        },
      });
      
      if (!teamsResponse.ok) {
        return null;
      }
      
      const teamsData = await teamsResponse.json();
      const teams = teamsData.response || [];
      
      // Search for matching team
      const normalizedSearchName = teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matchingTeam = teams.find((team: any) => {
        const teamNameNormalized = (team.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return teamNameNormalized.includes(normalizedSearchName) || 
               normalizedSearchName.includes(teamNameNormalized) ||
               (normalizedSearchName.includes('paris') && teamNameNormalized.includes('paris')) ||
               (normalizedSearchName.includes('asvel') && (teamNameNormalized.includes('asvel') || teamNameNormalized.includes('lyon')));
      });
      
      if (matchingTeam) {
        console.log(`[API-Basketball] Discovered LNB team ID ${matchingTeam.id} for "${teamName}" (found as "${matchingTeam.name}")`);
        return matchingTeam.id;
      }
      
      return null;
    } catch (error) {
      console.warn(`[API-Basketball] Error discovering LNB team ID:`, error);
      return null;
    }
  };
  
  if (leagueIds && leagueIds.length > 0) {
    // Fetch from each specified league
    console.log(`[API-Basketball] Fetching games from ${leagueIds.length} league(s): ${leagueIds.join(', ')}`);
    for (const leagueId of leagueIds) {
      // Determine which team ID to use for this league
      let teamIdToUse = baseTeamId;
      if (leagueId === 2) {
        // LNB Pro A - check if we have a separate team ID
        // Note: League ID 2 is the correct LNB Pro A league (not 118)
        if (lnbTeamId) {
          // Use separate LNB team ID if available in mapping
          teamIdToUse = lnbTeamId;
          console.log(`[API-Basketball]   League ${leagueId} (LNB Pro A): Using LNB team ID ${teamIdToUse} from mapping (EuroLeague team ID: ${baseTeamId})`);
        } else {
          // EuroLeague team IDs (108 for Paris, 26 for ASVEL) work for LNB Pro A too
          console.log(`[API-Basketball]   League ${leagueId} (LNB Pro A): Using EuroLeague team ID ${baseTeamId} (same ID works for LNB)`);
        }
      }
      
      let gamesForLeague: any[] = [];
      
      // Determine season format for this league (from teamMapping or league lookup)
      const seasonFormat = teamMapping?.seasonFormat || getLeagueSeasonFormat(leagueId);
      const leagueName = SUPPORTED_LEAGUES.find(l => l.id === leagueId)?.name || `League ${leagueId}`;
      
      if (seasonFormat === 'YYYY-YYYY') {
        // Use "YYYY-YYYY" format (e.g., "2025-2026")
        const season = `${currentYear}-${nextYear}`;
        console.log(`[API-Basketball]   League ${leagueId} (${leagueName}): Using season format "${season}"`);
        gamesForLeague = await fetchTeamGames(teamIdToUse, season, leagueId, undefined, undefined);
        console.log(`[API-Basketball]   League ${leagueId}: Found ${gamesForLeague.length} games with season "${season}"`);
        
        // Also try previous season
        if (gamesForLeague.length === 0) {
          const prevSeason = `${currentYear - 1}-${currentYear}`;
          console.log(`[API-Basketball]   League ${leagueId}: Trying previous season "${prevSeason}"`);
          gamesForLeague = await fetchTeamGames(teamIdToUse, prevSeason, leagueId, undefined, undefined);
          console.log(`[API-Basketball]   League ${leagueId}: Found ${gamesForLeague.length} games with season "${prevSeason}"`);
        }
      } else if (seasonFormat === 'YYYY') {
        // Use single year format (e.g., 2025)
        console.log(`[API-Basketball]   League ${leagueId} (${leagueName}): Using season format "${currentYear}"`);
        gamesForLeague = await fetchTeamGames(teamIdToUse, currentYear, leagueId, undefined, undefined);
        console.log(`[API-Basketball]   League ${leagueId}: Found ${gamesForLeague.length} games with season "${currentYear}"`);
        
        // Also try previous season
        if (gamesForLeague.length === 0) {
          const prevYear = currentYear - 1;
          console.log(`[API-Basketball]   League ${leagueId}: Trying previous season "${prevYear}"`);
          gamesForLeague = await fetchTeamGames(teamIdToUse, prevYear, leagueId, undefined, undefined);
          console.log(`[API-Basketball]   League ${leagueId}: Found ${gamesForLeague.length} games with season "${prevYear}"`);
        }
      } else {
        // Unknown season format - try date range first, then fallback to single year
        console.log(`[API-Basketball]   League ${leagueId} (${leagueName}): Season format unknown, trying date range`);
        gamesForLeague = await fetchTeamGames(teamIdToUse, undefined, leagueId, dateFromStr, dateToStr);
        
        // If date range returns no games, try season format (default to single year)
        if (gamesForLeague.length === 0) {
          console.log(`[API-Basketball]   League ${leagueId}: Date range returned 0 games, trying season "${currentYear}"`);
          gamesForLeague = await fetchTeamGames(teamIdToUse, currentYear, leagueId, undefined, undefined);
        }
      }
      
      console.log(`[API-Basketball]   League ${leagueId}: Found ${gamesForLeague.length} games`);
      apiGames.push(...gamesForLeague);
    }
  } else {
    // Fetch from all leagues (no specific league filter)
    console.log(`[API-Basketball] Fetching games from all leagues`);
    apiGames = await fetchTeamGames(baseTeamId, undefined, undefined, dateFromStr, dateToStr);
  }
  
  // Remove duplicates by game ID
  const uniqueGamesMap = new Map<number, any>();
  apiGames.forEach(game => {
    if (game.id && !uniqueGamesMap.has(game.id)) {
      uniqueGamesMap.set(game.id, game);
    }
  });
  apiGames = Array.from(uniqueGamesMap.values());
  
  console.log(`[API-Basketball] Date range/season queries returned ${apiGames.length} unique games`);
  
  // Declare season outside the if block so it's available for error messages
  let season: string | number | undefined = undefined;
  
  // If no games with date range, try with season
  if (apiGames.length === 0) {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    
    // Determine season format based on leagues
    // If team plays in Liga ACB (117), use "YYYY-YYYY" format
    // If team plays in LNB Pro A (2), use "YYYY-YYYY" format
    // If team plays in ABA League (198), use single year format
    // Otherwise, use single year format
    const hasACB = leagueIds?.includes(117);
    const hasLNB = leagueIds?.includes(2); // LNB Pro A (league ID 2, not 118)
    const hasABALeague = leagueIds?.includes(198);
    
    if (hasACB) {
      // Liga ACB uses "YYYY-YYYY" format (e.g., "2025-2026")
      season = `${currentYear}-${nextYear}`;
      console.log(`[API-Basketball] Using Liga ACB season format: "${season}"`);
    } else if (hasLNB) {
      // LNB Pro A uses single year format (e.g., "2025")
      season = currentYear;
      console.log(`[API-Basketball] Using LNB Pro A season format: "${season}"`);
    } else if (hasABALeague) {
      // ABA League uses single year format (e.g., "2025")
      season = currentYear;
      console.log(`[API-Basketball] Using ABA League season format: "${season}"`);
    } else {
      // Other leagues use single year format
      season = currentYear;
    }
    
    console.log(`[API-Basketball] Fetching games for team ${baseTeamId}, season ${season}, leagues ${leagueIds?.join(', ') || 'all'}`);
    
    // Fetch games from ALL specified leagues and MULTIPLE seasons
    const seasonsToTry: (string | number)[] = [season];
    
    // Add previous season(s) to try
    if (typeof season === 'number') {
      seasonsToTry.push(season - 1); // Previous year
      if (hasACB) {
        // Also try "YYYY-YYYY" format variations
        seasonsToTry.push(`${season}-${season + 1}`);
        seasonsToTry.push(`${season - 1}-${season}`);
      }
    } else if (typeof season === 'string' && season.includes('-')) {
      const [startYear, endYear] = season.split('-').map(Number);
      seasonsToTry.push(`${startYear - 1}-${endYear - 1}`); // Previous season
      seasonsToTry.push(startYear - 1); // Also try single year format
    }
    
    console.log(`[API-Basketball] Fetching games from ${leagueIds?.length || 'all'} league(s) across multiple seasons: ${seasonsToTry.join(', ')}`);
    
    // Fetch games from all seasons and all specified leagues
    const allApiGames: any[] = [];
    
    if (leagueIds && leagueIds.length > 0) {
      // Fetch from each specified league
      for (const leagueId of leagueIds) {
        // Determine which team ID to use for this league
        let teamIdToUse = baseTeamId;
        if (leagueId === 2) {
          // LNB Pro A - EuroLeague team IDs work for LNB Pro A too
          // No need for separate team ID discovery
          console.log(`[API-Basketball] League ${leagueId} (LNB Pro A): Using team ID ${teamIdToUse}`);
        }
        
        for (const seasonToTry of seasonsToTry) {
          const gamesForLeagueSeason = await fetchTeamGames(teamIdToUse, seasonToTry, leagueId, undefined, undefined);
          console.log(`[API-Basketball] League ${leagueId}, Season ${seasonToTry}: Found ${gamesForLeagueSeason.length} games`);
          allApiGames.push(...gamesForLeagueSeason);
        }
      }
    } else {
      // Fetch from all leagues
      for (const seasonToTry of seasonsToTry) {
        const gamesForSeason = await fetchTeamGames(baseTeamId, seasonToTry, undefined, undefined, undefined);
        console.log(`[API-Basketball] Season ${seasonToTry}: Found ${gamesForSeason.length} games from all leagues`);
        allApiGames.push(...gamesForSeason);
      }
    }
    
    // Remove duplicates (same game ID)
    const uniqueGamesMap = new Map<number, any>();
    allApiGames.forEach(game => {
      if (game.id && !uniqueGamesMap.has(game.id)) {
        uniqueGamesMap.set(game.id, game);
      }
    });
    apiGames = Array.from(uniqueGamesMap.values());
    
    console.log(`[API-Basketball] API returned ${apiGames.length} total unique games for team ${teamId} from all leagues and seasons`);
    
    // Log which leagues we found games in
    if (apiGames.length > 0) {
      const leaguesFound = new Map<string, number>();
      apiGames.forEach((g: any) => {
        const leagueKey = `${g.league?.id || 'unknown'} - ${g.league?.name || 'Unknown'}`;
        leaguesFound.set(leagueKey, (leaguesFound.get(leagueKey) || 0) + 1);
      });
      console.log(`[API-Basketball] Found games in ${leaguesFound.size} league(s):`);
      leaguesFound.forEach((count, league) => {
        console.log(`[API-Basketball]   - ${league}: ${count} games`);
      });
    }
  }
  
  // Filter games to relevant date range (past 30 days to future 365 days - extended for European leagues)
  // Reuse the 'today' variable already declared above
  const filterDateFrom = new Date(today);
  filterDateFrom.setDate(filterDateFrom.getDate() - 30); // Start 30 days ago
  const filterDateTo = new Date(today);
  filterDateTo.setDate(filterDateTo.getDate() + 365); // End 365 days from now (extended for full season)
  
  const relevantGames = apiGames.filter(apiGame => {
    if (!apiGame.date) {
      console.warn(`[API-Basketball] Game missing date:`, apiGame.id);
      return false;
    }
    const gameDate = new Date(apiGame.date);
    const inRange = gameDate >= filterDateFrom && gameDate <= filterDateTo;
    if (!inRange && apiGames.length > 0) {
      console.log(`[API-Basketball] Game ${apiGame.id} date ${apiGame.date} is outside range ${format(filterDateFrom, 'yyyy-MM-dd')} to ${format(filterDateTo, 'yyyy-MM-dd')}`);
    }
    return inRange;
  });
  
  console.log(`[API-Basketball] Fetched ${apiGames.length} total games, filtered to ${relevantGames.length} games in date range for ${prospect.name}`);
  
  // Log date range being used
  console.log(`[API-Basketball] Date filter range: ${format(filterDateFrom, 'yyyy-MM-dd')} to ${format(filterDateTo, 'yyyy-MM-dd')}`);
  
  // Log games by league before filtering
  if (apiGames.length > 0) {
    const gamesByLeagueBeforeFilter: Record<string, number> = {};
    apiGames.forEach((game: any) => {
      const leagueName = `${game.league?.id || 'unknown'} - ${game.league?.name || 'Unknown'}`;
      gamesByLeagueBeforeFilter[leagueName] = (gamesByLeagueBeforeFilter[leagueName] || 0) + 1;
    });
    console.log(`[API-Basketball] Games by league (before date filter):`, gamesByLeagueBeforeFilter);
  }
  
  // Log games by league after filtering
  if (relevantGames.length > 0) {
    const gamesByLeagueAfterFilter: Record<string, number> = {};
    relevantGames.forEach((game: any) => {
      const leagueName = `${game.league?.id || 'unknown'} - ${game.league?.name || 'Unknown'}`;
      gamesByLeagueAfterFilter[leagueName] = (gamesByLeagueAfterFilter[leagueName] || 0) + 1;
    });
    console.log(`[API-Basketball] Games by league (after date filter):`, gamesByLeagueAfterFilter);
  }
  
  if (relevantGames.length === 0) {
    console.warn(`[API-Basketball] ⚠️ No games found in date range for team ${teamId} (${teamName})`);
    if (apiGames.length > 0) {
      console.log(`[API-Basketball] Note: Found ${apiGames.length} total games, but none in date range ${format(filterDateFrom, 'yyyy-MM-dd')} to ${format(filterDateTo, 'yyyy-MM-dd')}`);
      // Log first few games to see their dates
      apiGames.slice(0, 10).forEach((game, idx) => {
        console.log(`[API-Basketball] Game ${idx + 1}: date=${game.date}, teams=${game.teams?.home?.name || '?'} vs ${game.teams?.away?.name || '?'}, league=${game.league?.id} - ${game.league?.name}`);
      });
    } else {
      console.warn(`[API-Basketball] ⚠️ API returned zero games for team ${teamId} (${teamName}), season ${season || 'N/A'}, leagues ${leagueIds?.join(', ') || 'all'}`);
    }
    return [];
  }
  
  console.log(`[API-Basketball] Found ${relevantGames.length} games in date range for ${teamName} (team ID: ${teamId})`);
  
  // Convert games to entries
  const entries: ParsedScheduleEntry[] = [];
  for (const apiGame of relevantGames) {
    try {
      const entry = await convertApiBasketballGameToEntry(apiGame, prospect, teamDisplay, directory);
      if (entry) {
        console.log(`[API-Basketball] ✓ Converted game: ${entry.game.dateKey} ${entry.game.tipoff} - ${entry.game.homeTeam.displayName} vs ${entry.game.awayTeam.displayName}`);
        // Apply injury status for this specific game
        const injuryStatus = await getInjuryStatusForGame(prospect, entry.game.id, entry.game.dateKey);
        if (injuryStatus) {
          entry.prospect.injuryStatus = injuryStatus;
        }
        entries.push(entry);
      } else {
        console.warn(`[API-Basketball] ✗ Failed to convert game ${apiGame.id} for ${prospect.name} - returned null`);
      }
    } catch (error) {
      console.warn(`[API-Basketball] ✗ Failed to convert game ${apiGame.id}:`, error);
    }
  }
  
  console.log(`[API-Basketball] Successfully converted ${entries.length} games for ${prospect.name}`);
  return entries;
}

/**
 * Check if a prospect can use api-basketball for schedule fetching
 */
export function canUseApiBasketball(prospect: Prospect): boolean {
  // Try multiple team name sources, stripping parenthetical info like "(Serbia)" or "(France)"
  const originalTeam = prospect.teamDisplay || prospect.espnTeamName || prospect.team || '';
  let team = originalTeam.toLowerCase();
  // Remove parenthetical info like "(Serbia)" or "(France)" for matching
  team = team.replace(/\s*\([^)]+\)\s*$/, '').trim();
  
  if (!team) {
    console.log(`[API-Basketball] No team name for ${prospect.name}`);
    return false;
  }
  
  // Check if team matches any known mappings
  const normalizedTeam = team.replace(/[^a-z0-9]/g, '');
  
  // Check exact matches
  if (TEAM_ID_MAPPINGS[normalizedTeam]) {
    console.log(`[API-Basketball] ✓ Matched "${originalTeam}" -> "${team}" (normalized: "${normalizedTeam}") to known mapping for ${prospect.name}`);
    return true;
  }
  
  // Check partial matches
  for (const key of Object.keys(TEAM_ID_MAPPINGS)) {
    if (normalizedTeam.includes(key) || key.includes(normalizedTeam)) {
      console.log(`[API-Basketball] ✓ Matched "${originalTeam}" -> "${team}" (normalized: "${normalizedTeam}") to "${key}" via partial match for ${prospect.name}`);
      return true;
    }
  }
  
  // International teams that might be in api-basketball
  const internationalKeywords = [
    'valencia',
    'asvel',
    'paris',
    'joventut',
    'joventut badalona',
    'mega',
    'megasuperbet',
    'aba',
    'euroleague',
    'acb',
    'lnb',
  ];
  
  const matches = internationalKeywords.some(keyword => team.includes(keyword));
  if (matches) {
    console.log(`[API-Basketball] ✓ Matched "${originalTeam}" -> "${team}" via keyword match for ${prospect.name}`);
  } else {
    console.log(`[API-Basketball] ✗ No match for ${prospect.name} (team: "${originalTeam}" -> "${team}", normalized: "${normalizedTeam}")`);
  }
  return matches;
}

