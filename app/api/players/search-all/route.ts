import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';

export interface UnifiedPlayerSearchResult {
  id: string;
  name: string;
  team: string | null;
  teamId?: number | null;
  position?: string | null;
  league?: string | null;
  source: 'college' | 'international' | 'watchlist';
  rank?: number;
  logoUrl?: string | null;
}

/**
 * GET /api/players/search-all?q=...
 * Unified search across college players, international players, and watchlist
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q')?.trim() || '';
    
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    // Get user ID for watchlist search (optional)
    let supabaseUserId: string | null = null;
    try {
      const { userId: clerkUserId } = await auth();
      if (clerkUserId) {
        supabaseUserId = await getSupabaseUserId(clerkUserId);
      }
    } catch (err) {
      console.warn('[search-all] Could not get user ID:', err);
      // Continue without user ID - we can still search college and international players
    }

    // Run all searches in parallel with timeout protection
    // Use Promise.allSettled to ensure one slow query doesn't block others
    const searchPromises = [
      // 1. Search international players (player_team_mappings)
      searchInternationalPlayers(q),
      
      // 2. Search college players (prospects with source='espn')
      searchCollegePlayers(q),
      
      // 3. Search all ESPN players (espn_players table - comprehensive NCAA/NBL roster)
      searchESPNPlayers(q),
      
      // 4. Search watchlist players (user_rankings with source='external')
      supabaseUserId ? searchWatchlistPlayers(q, supabaseUserId) : Promise.resolve([]),
    ];
    
    // Add overall timeout (10 seconds) to prevent hanging
    const timeoutPromise = new Promise<UnifiedPlayerSearchResult[][]>((resolve) => {
      setTimeout(() => {
        console.warn('[search-all] Search timeout after 10 seconds, returning partial results');
        resolve([[], [], [], []]); // Return empty arrays for timed-out searches
      }, 10000);
    });
    
    const [internationalResults, collegeResults, espnPlayersResults, watchlistResults] = await Promise.race([
      Promise.all(searchPromises),
      timeoutPromise,
    ]);

    // Merge results and deduplicate by name
    const allResults = [...internationalResults, ...collegeResults, ...espnPlayersResults, ...watchlistResults];
    
    // Deduplicate by name (case-insensitive) - keep the best result
    const uniqueResults = deduplicateResults(allResults);
    
    // Sort by relevance (exact match > starts with > contains)
    const sortedResults = sortByRelevance(uniqueResults, q);
    
    // Limit to 15 results
    const limitedResults = sortedResults.slice(0, 15);

    return NextResponse.json({ 
      results: limitedResults,
      query: q,
    });
  } catch (err) {
    console.error('[search-all] Handler error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', results: [] },
      { status: 500 }
    );
  }
}

/**
 * Search international players from international_rosters table
 */
async function searchInternationalPlayers(query: string): Promise<UnifiedPlayerSearchResult[]> {
  try {
    // Search international rosters with team info
    const { data, error } = await supabaseAdmin
      .from('international_rosters')
      .select(`
        id,
        player_name,
        position,
        international_teams (
          id,
          api_team_id,
          name,
          logo_url,
          league_name,
          country
        )
      `)
      .ilike('player_name', `%${query}%`)
      .limit(25);

    if (error) {
      console.error('[search-all] Error searching international players:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data
      .filter((r: any) => r.international_teams) // Ensure team data exists
      .map((r: any) => ({
        id: `intl-roster-${r.id}`,
        name: r.player_name,
        team: r.international_teams.name,
        teamId: r.international_teams.api_team_id,
        position: r.position,
        league: r.international_teams.league_name,
        source: 'international' as const,
        logoUrl: r.international_teams.logo_url,
      }));
  } catch (error) {
    console.error('[search-all] Error searching international players:', error);
    return [];
  }
}

/**
 * Search college players from prospects table (ESPN cached)
 */
async function searchCollegePlayers(query: string): Promise<UnifiedPlayerSearchResult[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospects')
      .select('id, espn_id, full_name, position, team_name, team_id, league')
      .eq('source', 'espn')
      .or(`full_name.ilike.%${query}%,team_name.ilike.%${query}%`)
      .limit(25);

    if (error) {
      console.error('[search-all] Error searching college players:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Fetch team logos for college teams (ESPN source)
    const teamIds = data.map(p => p.team_id).filter(Boolean);
    let teamLogos = new Map<string, string>();
    
    if (teamIds.length > 0) {
      // For ESPN teams, team_id is a string (e.g., "2305" for Kansas)
      // We need to look up logos differently or skip for now
      // TODO: Add ESPN team logo support if needed
    }

    return data.map(player => ({
      id: player.id,
      name: player.full_name,
      team: player.team_name,
      teamId: player.team_id ? parseInt(player.team_id) : null,
      position: player.position,
      league: player.league || 'NCAA',
      source: 'college' as const,
      logoUrl: null, // ESPN logos handled separately
    }));
  } catch (error) {
    console.error('[search-all] Error searching college players:', error);
    return [];
  }
}

/**
 * Search all ESPN players from espn_players table (comprehensive NCAA/NBL roster)
 */
async function searchESPNPlayers(query: string): Promise<UnifiedPlayerSearchResult[]> {
  try {
    // Use word-by-word matching for better search results
    const queryWords = query.trim().split(/\s+/).filter(Boolean);
    const searchPattern = queryWords.map(word => `%${word}%`).join('');
    
    const { data, error } = await supabaseAdmin
      .from('espn_players')
      .select('espn_player_id, espn_team_id, full_name, position, jersey_number, league')
      .ilike('full_name', searchPattern)
      .limit(50);

    if (error) {
      console.error('[search-all] Error searching ESPN players:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Get unique team IDs to fetch team names
    const teamIds = [...new Set(data.map(p => p.espn_team_id))];
    
    // Fetch team names from ncaa_team_schedules or nbl_team_schedules
    // Use DISTINCT ON to get unique team names quickly, with timeout protection
    const teamNamesMap = new Map<string, string>();
    
    if (teamIds.length > 0) {
      try {
        // Fetch team names with timeout protection (3 seconds per query)
        const ncaaPromise = supabaseAdmin
          .from('ncaa_team_schedules')
          .select('espn_team_id, home_team_display_name')
          .in('espn_team_id', teamIds)
          .limit(50); // Reduced limit for faster queries
        
        const nblPromise = supabaseAdmin
          .from('nbl_team_schedules')
          .select('espn_team_id, home_team_display_name')
          .in('espn_team_id', teamIds)
          .limit(50); // Reduced limit for faster queries
        
        // Race queries against timeout - if timeout wins, use empty result
        const timeoutMs = 3000;
        const timeoutPromise = new Promise<{ data: null }>((resolve) => {
          setTimeout(() => resolve({ data: null }), timeoutMs);
        });
        
        const [ncaaResult, nblResult] = await Promise.all([
          Promise.race([ncaaPromise, timeoutPromise]).catch(() => ({ data: null as null })),
          Promise.race([nblPromise, timeoutPromise]).catch(() => ({ data: null as null })),
        ]);
        
        // Extract data safely with type assertion
        const ncaaData = ncaaResult && 'data' in ncaaResult && ncaaResult.data ? ncaaResult.data as any[] : [];
        const nblData = nblResult && 'data' in nblResult && nblResult.data ? nblResult.data as any[] : [];
        
        ncaaData.forEach((game) => {
          if (game.espn_team_id && game.home_team_display_name && !teamNamesMap.has(game.espn_team_id)) {
            teamNamesMap.set(game.espn_team_id, game.home_team_display_name);
          }
        });
        
        nblData.forEach((game) => {
          if (game.espn_team_id && game.home_team_display_name && !teamNamesMap.has(game.espn_team_id)) {
            teamNamesMap.set(game.espn_team_id, game.home_team_display_name);
          }
        });
      } catch (error) {
        console.warn('[search-all] Error fetching team names (non-fatal):', error);
        // Continue without team names - search will still work
      }
    }

    return data.map(player => ({
      id: `espn-player-${player.espn_player_id}-${player.espn_team_id}`, // Unique ID for this player-team combo
      name: player.full_name,
      team: teamNamesMap.get(player.espn_team_id) || null,
      teamId: player.espn_team_id, // ESPN team ID as string
      position: player.position,
      league: player.league === 'ncaa' ? 'NCAA' : player.league === 'nbl' ? 'NBL' : player.league || null,
      source: 'college' as const, // Use 'college' source for consistency
      logoUrl: null,
    }));
  } catch (error) {
    console.error('[search-all] Error searching ESPN players:', error);
    return [];
  }
}

/**
 * Search watchlist players from user_rankings
 */
async function searchWatchlistPlayers(query: string, userId: string): Promise<UnifiedPlayerSearchResult[]> {
  try {
    const { data, error } = await supabaseAdmin
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
      .eq('user_id', userId)
      .limit(50);

    if (error) {
      console.error('[search-all] Error searching watchlist:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Filter to watchlist prospects (source: 'external') and match query
    const filtered = data
      .filter((r: any) => {
        if (!r.prospects) return false;
        const source = r.prospects.source;
        const isWatchlist = source === 'external';
        const matchesQuery = r.prospects.full_name?.toLowerCase().includes(query.toLowerCase());
        return isWatchlist && matchesQuery;
      })
      .slice(0, 10);

    // Fetch team logos
    const teamIds = filtered
      .map((r: any) => r.prospects?.team_id)
      .filter(Boolean)
      .filter((id: any) => typeof id === 'number');
    
    let teamLogos = new Map<number, string>();
    
    if (teamIds.length > 0) {
      const { data: logos } = await supabaseAdmin
        .from('team_logos')
        .select('team_id, logo_url')
        .in('team_id', teamIds);
      
      if (logos) {
        logos.forEach(logo => {
          teamLogos.set(logo.team_id, logo.logo_url);
        });
      }
    }

    return filtered.map((r: any) => ({
      id: r.prospect_id,
      name: r.prospects.full_name,
      team: r.prospects.team_name,
      teamId: r.prospects.team_id,
      position: r.prospects.position,
      league: r.prospects.league,
      source: 'watchlist' as const,
      rank: r.rank,
      logoUrl: r.prospects.team_id ? teamLogos.get(r.prospects.team_id) : null,
    }));
  } catch (error) {
    console.error('[search-all] Error searching watchlist:', error);
    return [];
  }
}

/**
 * Deduplicate results by player name (case-insensitive)
 * Priority: watchlist > international > college
 */
function deduplicateResults(results: UnifiedPlayerSearchResult[]): UnifiedPlayerSearchResult[] {
  const seen = new Map<string, UnifiedPlayerSearchResult>();
  
  // Define source priority (higher number = higher priority)
  const sourcePriority = {
    'watchlist': 3,
    'international': 2,
    'college': 1,
  };
  
  for (const result of results) {
    const key = result.name.toLowerCase();
    const existing = seen.get(key);
    
    if (!existing) {
      seen.set(key, result);
      continue;
    }
    
    // Keep the result with higher priority
    if (sourcePriority[result.source] > sourcePriority[existing.source]) {
      seen.set(key, result);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Sort results by relevance to query
 * Priority: exact match > starts with > contains
 */
function sortByRelevance(results: UnifiedPlayerSearchResult[], query: string): UnifiedPlayerSearchResult[] {
  const queryLower = query.toLowerCase();
  
  return results.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    
    // Exact match (highest priority)
    const aExact = aName === queryLower ? 1 : 0;
    const bExact = bName === queryLower ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    
    // Starts with (second priority)
    const aStarts = aName.startsWith(queryLower) ? 1 : 0;
    const bStarts = bName.startsWith(queryLower) ? 1 : 0;
    if (aStarts !== bStarts) return bStarts - aStarts;
    
    // Contains (third priority - all results contain query due to filtering)
    // Shorter names rank higher (more specific match)
    return aName.length - bName.length;
  });
}
