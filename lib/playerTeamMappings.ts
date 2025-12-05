import { supabaseAdmin } from './supabase';

export interface PlayerTeamMapping {
  id: number;
  player_id: number;
  player_name: string;
  team_id: number;
  team_name: string;
  league_id: number | null;
  league_name: string | null;
  season: number;
  position: string | null;
  jersey_number: string | null;
  country: string | null;
  age: number | null;
  last_updated: string;
}

export interface PlayerSearchResult {
  playerId: number;
  name: string;
  team: string;
  teamId: number;
  league: string | null;
  leagueId: number | null;
  position: string | null;
  jerseyNumber: string | null;
  country: string | null;
  age: number | null;
  season: number;
}

/**
 * Search for players by name (case-insensitive)
 * 
 * Handles both "First Last" and "Last First" formats to account for
 * API inconsistencies and database migration periods
 */
export async function searchPlayerByName(name: string, season: number = 2025): Promise<PlayerSearchResult[]> {
  try {
    // Split the search term to try alternate formats
    const nameParts = name.trim().split(/\s+/);
    
    // Build search patterns
    const searchPatterns: string[] = [];
    
    // Original search (e.g., "nando de colo")
    searchPatterns.push(`%${name}%`);
    
    // If multi-part name, also try reversed (e.g., "de colo nando")
    if (nameParts.length >= 2) {
      // Simple reversal for 2-part names
      if (nameParts.length === 2) {
        const reversed = `${nameParts[1]} ${nameParts[0]}`;
        searchPatterns.push(`%${reversed}%`);
      }
      // For 3+ part names, try moving last part to front
      else if (nameParts.length >= 3) {
        const lastName = nameParts.slice(1).join(' ');
        const firstName = nameParts[0];
        const reversed = `${lastName} ${firstName}`;
        searchPatterns.push(`%${reversed}%`);
      }
    }
    
    // Search with all patterns using OR logic
    let query = supabaseAdmin
      .from('player_team_mappings')
      .select('*')
      .eq('season', season);
    
    // Build OR condition for all search patterns
    if (searchPatterns.length === 1) {
      query = query.ilike('player_name', searchPatterns[0]);
    } else {
      // Use .or() to search multiple patterns
      const orConditions = searchPatterns
        .map(pattern => `player_name.ilike.${pattern}`)
        .join(',');
      query = query.or(orConditions);
    }
    
    query = query.order('player_name');
    
    const { data, error } = await query;

    if (error) {
      console.error('[PlayerTeamMappings] Search error:', error);
      return [];
    }

    // Remove duplicates and low-quality entries
    // Keep only the best entry for each player
    const playerMap = new Map<number, typeof data[0]>();
    
    (data || []).forEach(mapping => {
      const existing = playerMap.get(mapping.player_id);
      
      if (!existing) {
        playerMap.set(mapping.player_id, mapping);
        return;
      }
      
      // Score each entry by quality (higher is better)
      const scoreEntry = (entry: typeof mapping) => {
        let score = 0;
        
        // Penalize generic "International" entries heavily
        if (entry.league_name?.toLowerCase().includes('international')) score -= 100;
        
        // Penalize youth/U19/U21 teams (less relevant for pro scouting)
        if (entry.team_name?.match(/u\d{2}|u-\d{2}|youth|junior/i)) score -= 50;
        if (entry.league_name?.match(/u\d{2}|u-\d{2}|youth|junior/i)) score -= 50;
        
        // Reward specific team information
        if (entry.team_name && !entry.team_name.toLowerCase().includes('international')) score += 50;
        
        // Reward league information
        if (entry.league_name && entry.league_name !== 'International') score += 30;
        if (entry.league_id) score += 10;
        
        // Reward complete player information
        if (entry.position) score += 5;
        if (entry.jersey_number) score += 5;
        if (entry.country) score += 3;
        if (entry.age) score += 3;
        
        return score;
      };
      
      // Keep the higher quality entry
      if (scoreEntry(mapping) > scoreEntry(existing)) {
        playerMap.set(mapping.player_id, mapping);
      }
    });

    return Array.from(playerMap.values()).map(mapping => ({
      playerId: mapping.player_id,
      name: mapping.player_name,
      team: mapping.team_name,
      teamId: mapping.team_id,
      league: mapping.league_name,
      leagueId: mapping.league_id,
      position: mapping.position,
      jerseyNumber: mapping.jersey_number,
      country: mapping.country,
      age: mapping.age,
      season: mapping.season,
    }));
  } catch (error) {
    console.error('[PlayerTeamMappings] Search exception:', error);
    return [];
  }
}

/**
 * Get player info by player ID
 */
export async function getPlayerById(playerId: number, season: number = 2025): Promise<PlayerSearchResult | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('player_team_mappings')
      .select('*')
      .eq('player_id', playerId)
      .eq('season', season)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      playerId: data.player_id,
      name: data.player_name,
      team: data.team_name,
      teamId: data.team_id,
      league: data.league_name,
      leagueId: data.league_id,
      position: data.position,
      jerseyNumber: data.jersey_number,
      country: data.country,
      age: data.age,
      season: data.season,
    };
  } catch (error) {
    console.error('[PlayerTeamMappings] Get by ID exception:', error);
    return null;
  }
}

/**
 * Get all players for a team
 */
export async function getTeamRoster(teamId: number, season: number = 2025): Promise<PlayerSearchResult[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('player_team_mappings')
      .select('*')
      .eq('team_id', teamId)
      .eq('season', season)
      .order('player_name');

    if (error) {
      console.error('[PlayerTeamMappings] Get roster error:', error);
      return [];
    }

    return (data || []).map(mapping => ({
      playerId: mapping.player_id,
      name: mapping.player_name,
      team: mapping.team_name,
      teamId: mapping.team_id,
      league: mapping.league_name,
      leagueId: mapping.league_id,
      position: mapping.position,
      jerseyNumber: mapping.jersey_number,
      country: mapping.country,
      age: mapping.age,
      season: mapping.season,
    }));
  } catch (error) {
    console.error('[PlayerTeamMappings] Get roster exception:', error);
    return [];
  }
}

/**
 * Bulk insert player mappings (used by scanner script)
 */
export async function insertPlayerMappings(mappings: Omit<PlayerTeamMapping, 'id' | 'last_updated'>[]): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('player_team_mappings')
      .upsert(
        mappings.map(m => ({
          player_id: m.player_id,
          player_name: m.player_name,
          team_id: m.team_id,
          team_name: m.team_name,
          league_id: m.league_id,
          league_name: m.league_name,
          season: m.season,
          position: m.position,
          jersey_number: m.jersey_number,
          country: m.country,
          age: m.age,
        })),
        {
          onConflict: 'player_id,season',
          ignoreDuplicates: false, // Update existing records
        }
      );

    if (error) {
      console.error('[PlayerTeamMappings] Bulk insert error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[PlayerTeamMappings] Bulk insert exception:', error);
    return false;
  }
}

/**
 * Get mapping statistics
 */
export async function getMappingStats(season: number = 2025): Promise<{
  totalPlayers: number;
  totalTeams: number;
  totalLeagues: number;
}> {
  try {
    const [playersResult, teamsResult, leaguesResult] = await Promise.all([
      supabaseAdmin
        .from('player_team_mappings')
        .select('player_id', { count: 'exact', head: true })
        .eq('season', season),
      supabaseAdmin
        .from('player_team_mappings')
        .select('team_id', { count: 'exact', head: true })
        .eq('season', season),
      supabaseAdmin
        .from('player_team_mappings')
        .select('league_id', { count: 'exact', head: true })
        .eq('season', season)
        .not('league_id', 'is', null),
    ]);

    return {
      totalPlayers: playersResult.count || 0,
      totalTeams: teamsResult.count || 0,
      totalLeagues: leaguesResult.count || 0,
    };
  } catch (error) {
    console.error('[PlayerTeamMappings] Get stats exception:', error);
    return { totalPlayers: 0, totalTeams: 0, totalLeagues: 0 };
  }
}

