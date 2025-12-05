import fs from 'fs';
import path from 'path';
import type { Prospect } from '@/app/types/prospect';
import { supabaseAdmin, getSupabaseUserId } from './supabase';

export type RankingSource = 'espn' | 'myboard';

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

    const { data, error } = await supabaseAdmin
      .from('custom_players')
      .select('*')
      .eq('user_id', supabaseUserId)
      .order('rank', { ascending: true });

    if (error || !data) {
      console.error('Error loading custom players:', error);
      return [];
    }

    return data.map((cp) => ({
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
      console.log('[loadWatchlistPlayers] No supabase user ID found');
      return [];
    }

    console.log('[loadWatchlistPlayers] Loading watchlist for user:', supabaseUserId);

    // Load watchlist players (imported prospects with source: 'external' or 'espn')
    const { data, error } = await supabaseAdmin
      .from('user_rankings')
      .select(`
        rank,
        prospects (
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

    if (error) {
      console.error('[loadWatchlistPlayers] Error loading watchlist players:', error);
      return [];
    }

    if (!data) {
      console.log('[loadWatchlistPlayers] No data returned');
      return [];
    }

    console.log('[loadWatchlistPlayers] Loaded', data.length, 'rankings');

    // Filter in JavaScript instead of using .or() on nested field
    const filtered = data.filter((r: any) => r.prospects && (r.prospects.source === 'external' || r.prospects.source === 'espn' || r.prospects.source === 'international-roster'));
    console.log('[loadWatchlistPlayers] Filtered to', filtered.length, 'watchlist players');

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

    const prospect: Prospect = {
      rank,
      name,
      position,
      team,
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

