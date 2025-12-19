import fs from 'fs';
import path from 'path';
import type { Prospect } from '@/app/types/prospect';
import { supabaseAdmin, getSupabaseUserId } from './supabase';

export type RankingSource = 'espn' | 'myboard';

// Cache for team name → ESPN team ID mapping
let teamNameToIdCache: Map<string, string> | null = null;
let teamNameToIdCacheTimestamp: number | null = null;
const TEAM_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Normalizes team name for lookup (lowercase, no special chars)
 */
function normalizeTeamNameForLookup(name: string): string {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Builds a team name → ESPN team ID mapping from the database
 * Uses ncaa_team_schedules to get accurate team IDs
 */
async function buildTeamNameToIdMap(): Promise<Map<string, string>> {
  // Return cached map if still valid
  if (teamNameToIdCache && teamNameToIdCacheTimestamp && 
      Date.now() - teamNameToIdCacheTimestamp < TEAM_CACHE_TTL) {
    return teamNameToIdCache;
  }
  
  console.log('[loadProspects] Building team name → ID mapping from database...');
  const map = new Map<string, string>();
  
  try {
    // Query unique team names and IDs from ncaa_team_schedules
    const { data: homeTeams, error: homeError } = await supabaseAdmin
      .from('ncaa_team_schedules')
      .select('home_team_id, home_team_name, home_team_display_name')
      .limit(5000);
    
    if (homeError) {
      console.error('[loadProspects] Error fetching home teams:', homeError);
    } else if (homeTeams) {
      for (const team of homeTeams) {
        const id = String(team.home_team_id);
        // Map both short name and display name
        if (team.home_team_name) {
          const key = normalizeTeamNameForLookup(team.home_team_name);
          if (!map.has(key)) map.set(key, id);
        }
        if (team.home_team_display_name) {
          const key = normalizeTeamNameForLookup(team.home_team_display_name);
          if (!map.has(key)) map.set(key, id);
        }
      }
    }
    
    const { data: awayTeams, error: awayError } = await supabaseAdmin
      .from('ncaa_team_schedules')
      .select('away_team_id, away_team_name, away_team_display_name')
      .limit(5000);
    
    if (awayError) {
      console.error('[loadProspects] Error fetching away teams:', awayError);
    } else if (awayTeams) {
      for (const team of awayTeams) {
        const id = String(team.away_team_id);
        if (team.away_team_name) {
          const key = normalizeTeamNameForLookup(team.away_team_name);
          if (!map.has(key)) map.set(key, id);
        }
        if (team.away_team_display_name) {
          const key = normalizeTeamNameForLookup(team.away_team_display_name);
          if (!map.has(key)) map.set(key, id);
        }
      }
    }
    
    console.log(`[loadProspects] Built team map with ${map.size} entries`);
    
    // Log some examples for debugging
    const texasId = map.get('texas');
    const texasTechId = map.get('texastech');
    const texasAmId = map.get('texasam');
    console.log(`[loadProspects] Team ID examples: Texas=${texasId}, Texas Tech=${texasTechId}, Texas A&M=${texasAmId}`);
    
    // Log Alabama examples for debugging
    const alabamaId = map.get('alabama');
    const alabamaStateId = map.get('alabamastate');
    console.log(`[loadProspects] Alabama team IDs: Alabama=${alabamaId}, Alabama State=${alabamaStateId}`);
    
    teamNameToIdCache = map;
    teamNameToIdCacheTimestamp = Date.now();
    return map;
  } catch (error) {
    console.error('[loadProspects] Error building team map:', error);
    return new Map();
  }
}

/**
 * Looks up ESPN team ID for a team name
 */
export async function getTeamIdForName(teamName: string): Promise<string | undefined> {
  const map = await buildTeamNameToIdMap();
  const key = normalizeTeamNameForLookup(teamName);
  return map.get(key);
}

/**
 * Separates prospects into big board and watchlist
 * This is needed because loadProspects returns a combined array
 */
export async function getBigBoardAndWatchlistProspects(
  source: RankingSource,
  clerkUserId?: string
): Promise<{ bigBoard: Prospect[]; watchlist: Prospect[] }> {
  const allProspects = await loadProspects(source, clerkUserId);
  
  const bigBoard: Prospect[] = [];
  const watchlist: Prospect[] = [];
  
  for (const prospect of allProspects) {
    if (prospect.isWatchlist) {
      watchlist.push(prospect);
    } else {
      bigBoard.push(prospect);
    }
  }
  
  return { bigBoard, watchlist };
}

let cachedProspectsESPN: Prospect[] | null = null;
let cachedProspectsMyBoard: Prospect[] | null = null;

const RANKING_FILES: Record<RankingSource, string> = {
  espn: 'top_100_espn_2026_big_board.txt',
  myboard: 'my_board_2026.txt',
};

const INTERNATIONAL_MARKERS = ['(', 'Mega Superbet', 'Melbourne United', 'New Zealand Breakers', 'Valencia', 'Paris Basket'];

const classifyProspect = (team: string): string => {
  const lowered = team.toLowerCase();

  if (lowered.includes('g league') || lowered.includes('ignite')) {
    return 'G League';
  }

  const isInternational = INTERNATIONAL_MARKERS.some((marker) =>
    lowered.includes(marker.toLowerCase())
  );

  if (isInternational) {
    return 'International';
  }

  return 'NCAA';
};

const normalizeTeam = (team: string): string => {
  return team.replace(/\s+/g, ' ').trim();
};

export const loadCustomPlayers = async (clerkUserId: string): Promise<Prospect[]> => {
  try {
    const supabaseUserId = await getSupabaseUserId(clerkUserId);
    if (!supabaseUserId) {
      return [];
    }

    // Add timeout to prevent hanging
    const queryPromise = supabaseAdmin
      .from('custom_players')
      .select('*')
      .eq('user_id', supabaseUserId)
      .order('rank', { ascending: true });
    
    const timeoutPromise = new Promise<{ data: null, error: { code: string, message: string } }>((resolve) => {
      setTimeout(() => {
        resolve({ data: null, error: { code: 'TIMEOUT', message: 'Query timeout' } });
      }, 5000); // 5 second timeout
    });
    
    const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as any;

    if (error) {
      // If table doesn't exist (PGRST205) or schema cache issue, return empty array
      if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'TIMEOUT' || error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
        if (error.code === 'TIMEOUT') {
          console.warn('[loadCustomPlayers] Query timeout, returning empty array');
        }
        return [];
      }
      console.error('Error loading custom players:', error);
      return [];
    }

    if (!data) {
      return [];
    }

    return data.map((cp: { rank: number; name: string; position: string; team: string; class?: string; height?: string; jersey?: string; team_id?: string }) => ({
      rank: cp.rank,
      name: cp.name,
      position: cp.position,
      team: cp.team,
      class: cp.class || classifyProspect(cp.team),
      espnRank: cp.rank, // Use custom rank as espnRank for matching
      height: cp.height || undefined,
      jersey: cp.jersey || undefined,
      teamId: cp.team_id || undefined,
      teamDisplay: cp.team,
      source: 'external' as const, // Custom players are treated as external
    }));
  } catch (error) {
    console.error('Error loading custom players:', error);
    return [];
  }
};

export const loadWatchlistPlayers = async (clerkUserId: string): Promise<Prospect[]> => {
  try {
    const supabaseUserId = await getSupabaseUserId(clerkUserId);
    if (!supabaseUserId) {
      return [];
    }

    // Add timeout to prevent hanging
    const queryPromise = supabaseAdmin
      .from('user_rankings')
      .select(`
        rank,
        prospects!inner (
          id,
          full_name,
          position,
          team_name,
          league,
          source,
          team_id
        )
      `)
      .eq('user_id', supabaseUserId)
      .order('rank', { ascending: true });
    
    const timeoutPromise = new Promise<{ data: null, error: { code: string, message: string } }>((resolve) => {
      setTimeout(() => {
        resolve({ data: null, error: { code: 'TIMEOUT', message: 'Query timeout' } });
      }, 5000); // 5 second timeout
    });
    
    const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as any;

    if (error) {
      if (error.code === 'TIMEOUT') {
        console.warn('[loadWatchlistPlayers] Query timeout, returning empty array');
      } else {
        console.error('[loadWatchlistPlayers] Error loading watchlist players:', error);
      }
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Filter in JavaScript (Supabase doesn't support .in() on nested fields)
    const filtered = data.filter((r: any) => 
      r.prospects && 
      (r.prospects.source === 'external' || 
       r.prospects.source === 'espn' || 
       r.prospects.source === 'international-roster')
    );

    return filtered.map((r: any) => ({
        rank: r.rank,
        name: r.prospects.full_name,
        position: r.prospects.position || '',
        team: r.prospects.team_name || '',
        class: classifyProspect(r.prospects.team_name || ''),
        espnRank: r.rank, // Use watchlist rank as espnRank for matching
        teamDisplay: r.prospects.team_name || '',
        teamId: r.prospects.team_id || undefined,
        source: r.prospects.source, // Include source to identify international-roster players
        // Mark as watchlist player (we'll use this in GameCard)
        isWatchlist: true,
      }));
  } catch (error) {
    console.error('Error loading watchlist players:', error);
    return [];
  }
};

export const loadProspects = async (
  source: RankingSource = 'espn',
  clerkUserId?: string
): Promise<Prospect[]> => {
  // For caching, we need to handle custom players separately since they're user-specific
  const cache = source === 'espn' ? cachedProspectsESPN : cachedProspectsMyBoard;
  
  const filePath = path.join(process.cwd(), RANKING_FILES[source]);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Big board file not found at ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const prospects: Prospect[] = [];

  // Load ESPN rankings to get original ESPN rank for each prospect (for schedule matching)
  const espnProspects = source === 'espn' ? null : loadESPNProspectsForMapping();
  const espnNameToRank = new Map<string, number>();
  if (espnProspects) {
    for (const p of espnProspects) {
      espnNameToRank.set(p.name, p.rank);
    }
  }

  // Build team name → ID mapping for accurate team matching
  const teamNameToId = await buildTeamNameToIdMap();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(\d+)\.\s+([^–-]+)\s*[-–]\s*([^,]+),\s*(.+)$/);
    if (!match) {
      continue;
    }

    const rank = Number.parseInt(match[1], 10);
    if (Number.isNaN(rank)) continue;

    const name = match[2].trim();
    const position = match[3].trim();
    const teamRaw = match[4].trim();
    const team = normalizeTeam(teamRaw);
    
    // Look up team ID from database - this prevents "Texas" matching "Texas Tech"
    const teamKey = normalizeTeamNameForLookup(team);
    const teamId = teamNameToId.get(teamKey);
    
    // Debug logging for problematic prospects
    if (name.includes('Philon') || team.toLowerCase().includes('alabama') || team.toLowerCase().includes('texas')) {
      console.log(`[loadProspects] DEBUG: ${name} - team="${team}" teamKey="${teamKey}" teamId=${teamId || 'UNDEFINED'}`);
    }

    const prospect: Prospect = {
      rank,
      name,
      position,
      team,
      teamId, // Add team ID for accurate matching
      class: classifyProspect(team),
      espnRank: source === 'espn' ? rank : (espnNameToRank.get(name) || rank),
      source: source as 'espn' | 'external', // Set source based on which file we're loading from
    };

    prospects.push(prospect);
  }

  // If userId provided, add custom players (only for 'myboard') and watchlist players (always)
  if (clerkUserId) {
    // Custom players only for 'myboard' source
    if (source === 'myboard') {
      const customPlayers = await loadCustomPlayers(clerkUserId);
      prospects.push(...customPlayers);
    }
    
    // Watchlist players should always be included (regardless of source) so they appear in games
    const watchlistPlayers = await loadWatchlistPlayers(clerkUserId);
    prospects.push(...watchlistPlayers);
    
    // Sort by rank
    prospects.sort((a, b) => a.rank - b.rank);
  }

  // Cache only file-based prospects (not custom players)
  if (source === 'espn') {
    cachedProspectsESPN = prospects.filter(p => !p.teamId); // Custom players have teamId
  } else {
    cachedProspectsMyBoard = prospects.filter(p => !p.teamId);
  }

  return prospects;
};

// Helper to load ESPN prospects for mapping (without caching to avoid recursion)
function loadESPNProspectsForMapping(): Prospect[] {
  const filePath = path.join(process.cwd(), RANKING_FILES.espn);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const prospects: Prospect[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(\d+)\.\s+([^–-]+)\s*[-–]\s*([^,]+),\s*(.+)$/);
    if (!match) continue;

    const rank = Number.parseInt(match[1], 10);
    if (Number.isNaN(rank)) continue;

    const name = match[2].trim();
    const position = match[3].trim();
    const teamRaw = match[4].trim();
    const team = normalizeTeam(teamRaw);

    prospects.push({
      rank,
      name,
      position,
      team,
      class: classifyProspect(team),
      espnRank: rank,
    });
  }

  return prospects;
}

export const getProspectsByRank = async (
  source: RankingSource = 'espn',
  clerkUserId?: string
): Promise<Map<number, Prospect>> => {
  const prospects = await loadProspects(source, clerkUserId);
  // Map by ESPN rank for schedule matching (schedules reference ESPN ranks)
  // Use negative ranks for custom players AND watchlist players to avoid conflicts with ESPN ranks
  const prospectMap = new Map<number, Prospect>();
  let customPlayerOffset = -10000;
  let watchlistPlayerOffset = -20000;
  
  for (const prospect of prospects) {
    if (prospect.teamId) {
      // Custom player - use negative rank to avoid conflicts
      prospectMap.set(customPlayerOffset--, prospect);
    } else if (prospect.isWatchlist && source === 'myboard') {
      // Watchlist player when viewing myboard - use negative rank to avoid ESPN rank collisions
      prospectMap.set(watchlistPlayerOffset--, prospect);
    } else {
      // Regular ESPN prospect
      prospectMap.set(prospect.espnRank || prospect.rank, prospect);
    }
  }
  
  return prospectMap;
};

export const clearProspectCache = (source?: RankingSource) => {
  if (!source || source === 'espn') {
    cachedProspectsESPN = null;
  }
  if (!source || source === 'myboard') {
    cachedProspectsMyBoard = null;
  }
};

