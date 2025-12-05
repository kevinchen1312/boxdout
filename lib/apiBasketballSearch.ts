// Search functions for API-Basketball to find international players and teams

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

/**
 * Format player name from API-Basketball response
 * Handles cases where:
 * 1. name field is in "Last, First" format (e.g., "Ndiaye, Mbaye")
 * 2. name field is in "Last First" format without comma (e.g., "Ndiaye Mbaye")
 * 3. firstname/lastname fields might be reversed (e.g., firstname="Ndiaye", lastname="Mbaye")
 * 4. name field is already correct (e.g., "Mbaye Ndiaye")
 * 
 * Returns name in "First Last" format (e.g., "Mbaye Ndiaye")
 */
function formatPlayerName(player: { name?: string; firstname?: string; lastname?: string }): string {
  // If we have firstname and lastname, prefer those (they're usually more reliable)
  if (player.firstname && player.lastname) {
    // Check if they might be reversed by comparing with the name field
    if (player.name) {
      const nameParts = player.name.trim().split(/\s+/);
      // If name field matches "lastname firstname" format, reverse them
      if (nameParts.length === 2 && 
          nameParts[0].toLowerCase() === player.lastname.toLowerCase() &&
          nameParts[1].toLowerCase() === player.firstname.toLowerCase()) {
        // Fields are reversed: use lastname as firstname and firstname as lastname
        return `${player.lastname} ${player.firstname}`;
      }
      // If name field matches "firstname lastname" format, use as-is
      if (nameParts.length === 2 &&
          nameParts[0].toLowerCase() === player.firstname.toLowerCase() &&
          nameParts[1].toLowerCase() === player.lastname.toLowerCase()) {
        return `${player.firstname} ${player.lastname}`;
      }
    }
    // Default: assume firstname/lastname are correct
    return `${player.firstname} ${player.lastname}`;
  }
  
  // If no firstname/lastname, use name field
  if (player.name) {
    // Check if it's in "Last, First" format (has comma)
    if (player.name.includes(',')) {
      const parts = player.name.split(',').map(p => p.trim());
      if (parts.length === 2) {
        // Reverse: "Ndiaye, Mbaye" -> "Mbaye Ndiaye"
        return `${parts[1]} ${parts[0]}`;
      }
    }
    
    // Check if it's likely in "Last First" format (without comma)
    // Common Senegalese/West African last names that often come first in API responses
    // These names typically appear as last names, so if they're first in the API response, it's likely reversed
    const commonLastNamesFirst = ['ndiaye', 'diallo', 'diop', 'ba', 'sarr', 'fall', 'ndour', 'seck', 'sene', 'toure', 'massa'];
    const nameParts = player.name.trim().split(/\s+/);
    if (nameParts.length === 2) {
      const firstPart = nameParts[0].toLowerCase();
      const secondPart = nameParts[1].toLowerCase();
      
      // If first part matches common last name pattern, likely reversed
      // Example: "Massa Bodian" -> "Bodian Massa" (Massa is typically a last name)
      if (commonLastNamesFirst.some(lastName => firstPart === lastName || firstPart.includes(lastName))) {
        // Reverse: "Ndiaye Mbaye" -> "Mbaye Ndiaye" or "Massa Bodian" -> "Bodian Massa"
        return `${nameParts[1]} ${nameParts[0]}`;
      }
      
      // If second part matches common last name, name is likely already correct
      // Example: "Bodian Massa" stays as "Bodian Massa" (Massa is in the correct last position)
      if (commonLastNamesFirst.some(lastName => secondPart === lastName || secondPart.includes(lastName))) {
        // Name is already in correct format: "Bodian Massa"
        return player.name;
      }
    }
    
    // If no clear indication, return as-is
    return player.name;
  }
  
  // Fallback
  return `${player.firstname || ''} ${player.lastname || ''}`.trim() || '';
}

export interface ApiBasketballPlayer {
  id: number;
  name: string;
  firstname: string;
  lastname: string;
  age?: number;
  birth?: {
    date?: string;
    country?: string;
  };
  nationality?: string;
  height?: string;
  weight?: string;
  injured?: boolean;
  photo?: string;
  team?: {
    id: number;
    name: string;
    logo?: string;
  };
  leagues?: Array<{
    id: number;
    name: string;
    type?: string;
    season?: string;
  }>;
}

export interface ApiBasketballTeam {
  id: number;
  name: string;
  logo?: string;
  country?: {
    id: number;
    name: string;
    code?: string;
  };
  founded?: number;
  national?: boolean;
}

export interface ApiBasketballSearchResult {
  externalId: string; // API-Basketball player ID or team ID
  fullName: string;
  position?: string;
  team?: string;
  league?: string;
  provider: 'api-basketball';
  teamId?: number; // API-Basketball team ID
  leagues?: Array<{ id: number; name: string }>;
  allTeams?: string[]; // All teams this player has been associated with (if multiple)
}

/**
 * Fetch complete player details from API-Basketball by player ID
 * Returns full name, position, team, and league from the most recent season
 */
async function fetchPlayerFullDetails(playerId: number): Promise<{
  fullName: string;
  position?: string;
  team?: string;
  teamId?: number;
  league?: string;
  leagues?: Array<{ id: number; name: string }>;
} | null> {
  try {
    const playerDetailUrl = `${BASE_URL}/players?id=${playerId}`;
    const detailResponse = await fetch(playerDetailUrl, { headers });
    
    if (!detailResponse.ok) {
      console.warn(`[API-Basketball] Failed to fetch details for player ${playerId}: ${detailResponse.status}`);
      return null;
    }
    
    const detailData = await detailResponse.json();
    const playerDetails = detailData.response || [];
    
    if (playerDetails.length === 0) {
      console.warn(`[API-Basketball] No details found for player ${playerId}`);
      return null;
    }
    
    // Sort by season to get most recent data (2024+)
    const sortedByDate = playerDetails.sort((a: any, b: any) => {
      const aLeagues = a.leagues || [];
      const bLeagues = b.leagues || [];
      const aSeason = Math.max(...aLeagues.map((l: any) => parseInt(l.season || '0')));
      const bSeason = Math.max(...bLeagues.map((l: any) => parseInt(l.season || '0')));
      return bSeason - aSeason; // Most recent first
    });
    
    const mostRecent = sortedByDate[0];
    
    // Log the raw player data to understand the structure
    console.log(`[API-Basketball] Raw player data for ${playerId}:`, JSON.stringify({
      name: mostRecent.name,
      firstname: mostRecent.firstname,
      lastname: mostRecent.lastname,
      position: mostRecent.position,
      team: mostRecent.team,
      leagues: mostRecent.leagues,
      allKeys: Object.keys(mostRecent),
    }, null, 2));
    
    // Extract full name using formatPlayerName helper
    const fullName = formatPlayerName(mostRecent);
    
    // Extract position - API-Basketball has this field directly on the player object
    // It could be a string, an object, or null
    let position: string | undefined;
    if (typeof mostRecent.position === 'string' && mostRecent.position) {
      position = mostRecent.position;
    } else if (mostRecent.position && typeof mostRecent.position === 'object') {
      position = mostRecent.position.abbreviation || 
                 mostRecent.position.name || 
                 mostRecent.position.displayName;
    }
    
    // Extract team info
    const team = mostRecent.team?.name;
    const teamId = mostRecent.team?.id;
    
    // Extract league info - prefer current season (2024+)
    const leagues = mostRecent.leagues || [];
    const currentYear = new Date().getFullYear();
    const currentLeague = leagues.find((l: any) => {
      if (!l.season) return false;
      const season = parseInt(l.season);
      return season >= 2024;
    }) || leagues.find((l: any) => {
      const seasonStr = String(l.season || '');
      return seasonStr.includes(String(currentYear)) || seasonStr.includes(String(currentYear + 1));
    }) || leagues[0];
    
    const league = currentLeague?.name || 'International';
    
    console.log(`[API-Basketball] Fetched full details for player ${playerId}:`, {
      fullName,
      position: position || '(not available)',
      team: team || '(not available)',
      league,
    });
    
    // Only skip if we don't have a name - team can be missing
    // Many international players have position data but API doesn't have their current team
    if (!fullName) {
      console.log(`[API-Basketball] Skipping player ${playerId} - no name available`);
      return null;
    }
    
    return {
      fullName,
      position: position || undefined,
      team,
      teamId: teamId || undefined,
      league,
      leagues: leagues.map((l: any) => ({ id: l.id, name: l.name })),
    };
  } catch (error) {
    console.error(`[API-Basketball] Error fetching details for player ${playerId}:`, error);
    return null;
  }
}

/**
 * Search for players in API-Basketball by name
 */
export async function searchPlayers(query: string): Promise<ApiBasketballSearchResult[]> {
  try {
    // Try the query as-is first
    let url = `${BASE_URL}/players?search=${encodeURIComponent(query)}`;
    let response = await fetch(url, { headers });
    
    let data: any = null;
    if (response.ok) {
      const responseData = await response.json();
      if (responseData.response && Array.isArray(responseData.response) && responseData.response.length > 0) {
        data = responseData;
      }
    }
    
    // If no results and query has multiple words, try reversing the name order
    // (e.g., "Mbaye Ndiaye" -> "Ndiaye Mbaye" because API-Basketball stores names as "Last First")
    if ((!data || !data.response || data.response.length === 0) && query.trim().split(/\s+/).length >= 2) {
      const parts = query.trim().split(/\s+/);
      const reversedQuery = `${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}`;
      console.log(`[API-Basketball Search] No results for "${query}", trying reversed name order: "${reversedQuery}"`);
      
      url = `${BASE_URL}/players?search=${encodeURIComponent(reversedQuery)}`;
      response = await fetch(url, { headers });
      
      if (response.ok) {
        const responseData = await response.json();
        if (responseData.response && Array.isArray(responseData.response)) {
          data = responseData;
        }
      }
    }
    
    if (!response.ok) {
      console.warn(`[API-Basketball Search] Failed to search players "${query}": ${response.status}`);
      return [];
    }
    
    if (!data || !data.response || !Array.isArray(data.response)) {
      return [];
    }
    
    const results: ApiBasketballSearchResult[] = [];
    
    // Group players by ID (same player might appear multiple times with different teams)
    const playersById = new Map<number, any[]>();
    for (const player of data.response) {
      if (!playersById.has(player.id)) {
        playersById.set(player.id, []);
      }
      playersById.get(player.id)!.push(player);
    }
    
    // Fetch full details for each player to get complete information
    for (const [playerId, playerEntries] of playersById.entries()) {
      console.log(`[API-Basketball Search] Fetching full details for player ${playerId}...`);
      
      // Fetch complete player details
      const details = await fetchPlayerFullDetails(playerId);
      
      if (!details) {
        console.warn(`[API-Basketball Search] Could not fetch details for player ${playerId}, skipping`);
        continue;
      }
      
      // Get all teams this player has been associated with (for context)
      const sortedEntries = playerEntries.sort((a, b) => {
        const aLeagues = a.leagues || [];
        const bLeagues = b.leagues || [];
        const aSeason = Math.max(...aLeagues.map((l: any) => parseInt(l.season || '0')));
        const bSeason = Math.max(...bLeagues.map((l: any) => parseInt(l.season || '0')));
        return bSeason - aSeason; // Most recent first
      });
      
      const allTeams = sortedEntries
        .map((e: any) => e.team?.name)
        .filter(Boolean)
        .filter((name: string, index: number, arr: string[]) => arr.indexOf(name) === index); // Unique
      
      results.push({
        externalId: `api-basketball-player-${playerId}`,
        fullName: details.fullName,
        position: details.position,
        team: details.team || allTeams[0] || 'Unknown',
        league: details.league || 'International',
        provider: 'api-basketball',
        teamId: details.teamId,
        leagues: details.leagues,
        // Include all teams if multiple
        allTeams: allTeams.length > 1 ? allTeams : undefined,
      });
    }
    
    return results;
  } catch (error) {
    console.error(`[API-Basketball Search] Error searching players "${query}":`, error);
    return [];
  }
}

/**
 * Search for teams in API-Basketball by name
 * Returns players from those teams that match the query
 */
export async function searchTeamsAndPlayers(query: string): Promise<ApiBasketballSearchResult[]> {
  try {
    // First search for teams
    const teamUrl = `${BASE_URL}/teams?search=${encodeURIComponent(query)}`;
    const teamResponse = await fetch(teamUrl, { headers });
    
    if (!teamResponse.ok) {
      return [];
    }
    
    const teamData = await teamResponse.json();
    
    if (!teamData.response || !Array.isArray(teamData.response)) {
      return [];
    }
    
    const results: ApiBasketballSearchResult[] = [];
    const currentYear = new Date().getFullYear();
    
    // For each team, search for players with matching names
    for (const team of teamData.response.slice(0, 5)) { // Limit to 5 teams to avoid too many API calls
      try {
        const playersUrl = `${BASE_URL}/players?team=${team.id}&search=${encodeURIComponent(query)}`;
        const playersResponse = await fetch(playersUrl, { headers });
        
        if (playersResponse.ok) {
          const playersData = await playersResponse.json();
          
          if (playersData.response && Array.isArray(playersData.response)) {
            // Fetch full details for each player found
            for (const player of playersData.response) {
              const details = await fetchPlayerFullDetails(player.id);
              
              if (!details) {
                console.warn(`[API-Basketball Search] Could not fetch details for player ${player.id}, skipping`);
                continue;
              }
              
              results.push({
                externalId: `api-basketball-player-${player.id}`,
                fullName: details.fullName,
                position: details.position,
                team: details.team || team.name,
                league: details.league || 'International',
                provider: 'api-basketball',
                teamId: details.teamId || team.id,
                leagues: details.leagues,
              });
            }
          }
        }
      } catch (err) {
        console.warn(`[API-Basketball Search] Error fetching players for team ${team.id}:`, err);
      }
    }
    
    return results;
  } catch (error) {
    console.error(`[API-Basketball Search] Error searching teams and players "${query}":`, error);
    return [];
  }
}

/**
 * Search for a player on a specific team
 */
export async function searchPlayerOnTeam(playerName: string, teamName: string): Promise<ApiBasketballSearchResult[]> {
  try {
    // First, find the team
    const teamUrl = `${BASE_URL}/teams?search=${encodeURIComponent(teamName)}`;
    const teamResponse = await fetch(teamUrl, { headers });
    
    if (!teamResponse.ok) {
      return [];
    }
    
    const teamData = await teamResponse.json();
    
    if (!teamData.response || !Array.isArray(teamData.response)) {
      return [];
    }
    
    const results: ApiBasketballSearchResult[] = [];
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const seasonRange = `${currentYear}-${nextYear}`;
    
    // Search for the player on each matching team
    for (const team of teamData.response.slice(0, 3)) { // Limit to 3 teams
      try {
        // Try with season parameter first (this is what worked for ASVEL)
        let playersUrl = `${BASE_URL}/players?team=${team.id}&search=${encodeURIComponent(playerName)}&season=${seasonRange}`;
        let playersResponse = await fetch(playersUrl, { headers });
        
        // If no results, try without season
        let playersData: any = null;
        if (playersResponse.ok) {
          const responseData = await playersResponse.json();
          if (responseData.response && Array.isArray(responseData.response) && responseData.response.length > 0) {
            playersData = responseData;
          }
        }
        
        // If still no results, try reversed name order
        if (!playersData || !playersData.response || playersData.response.length === 0) {
          const parts = playerName.trim().split(/\s+/);
          if (parts.length >= 2) {
            const reversedName = `${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}`;
            playersUrl = `${BASE_URL}/players?team=${team.id}&search=${encodeURIComponent(reversedName)}&season=${seasonRange}`;
            playersResponse = await fetch(playersUrl, { headers });
            
            if (playersResponse.ok) {
              const responseData = await playersResponse.json();
              if (responseData.response && Array.isArray(responseData.response)) {
                playersData = responseData;
              }
            }
          }
        }
        
        if (playersResponse.ok && playersData && playersData.response && Array.isArray(playersData.response)) {
          // Fetch full details for each player found
          for (const player of playersData.response) {
            const details = await fetchPlayerFullDetails(player.id);
            
            if (!details) {
              console.warn(`[API-Basketball Search] Could not fetch details for player ${player.id}, skipping`);
              continue;
            }
            
            results.push({
              externalId: `api-basketball-player-${player.id}`,
              fullName: details.fullName,
              position: details.position,
              team: details.team || team.name,
              league: details.league || 'International',
              provider: 'api-basketball',
              teamId: details.teamId || team.id,
              leagues: details.leagues,
            });
          }
        }
      } catch (err) {
        console.warn(`[API-Basketball Search] Error fetching players for team ${team.id}:`, err);
      }
    }
    
    return results;
  } catch (error) {
    console.error(`[API-Basketball Search] Error searching player on team "${playerName}" "${teamName}":`, error);
    return [];
  }
}

/**
 * Combined search: search both players and teams
 * Also tries to find players on known teams if the query matches a player name
 */
export async function searchApiBasketball(query: string): Promise<ApiBasketballSearchResult[]> {
  const [playerResults, teamPlayerResults] = await Promise.all([
    searchPlayers(query),
    searchTeamsAndPlayers(query),
  ]);
  
  // Also try searching for the player on known European teams if it looks like a player name
  // Known teams: ASVEL, Lyon-Villeurbanne, Valencia, Paris Basketball
  const knownTeams = [
    { name: 'ASVEL', id: 26 },
    { name: 'Lyon-Villeurbanne', id: 26 },
    { name: 'Valencia', id: 2341 },
    { name: 'Paris Basketball', id: 108 },
  ];
  const queryLower = query.toLowerCase();
  const looksLikePlayerName = queryLower.split(' ').length >= 2; // Has at least 2 words
  
  let teamSpecificResults: ApiBasketballSearchResult[] = [];
  if (looksLikePlayerName) {
    // Try searching on known teams directly using team ID and season
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const seasonRange = `${currentYear}-${nextYear}`;
    
    for (const team of knownTeams) {
      try {
        // Search for player on this specific team with season parameter
        const parts = query.trim().split(/\s+/);
        const queriesToTry = [
          query,
          parts.length >= 2 ? `${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}` : query, // Reversed name
        ];
        
        for (const searchQuery of queriesToTry) {
          const playersUrl = `${BASE_URL}/players?team=${team.id}&search=${encodeURIComponent(searchQuery)}&season=${seasonRange}`;
          const playersResponse = await fetch(playersUrl, { headers });
          
          if (playersResponse.ok) {
            const playersData = await playersResponse.json();
            if (playersData.response && Array.isArray(playersData.response) && playersData.response.length > 0) {
              // Found player on this team - fetch full details
              for (const player of playersData.response) {
                const details = await fetchPlayerFullDetails(player.id);
                
                if (!details) {
                  console.warn(`[API-Basketball Search] Could not fetch details for player ${player.id}, skipping`);
                  continue;
                }
                
                teamSpecificResults.push({
                  externalId: `api-basketball-player-${player.id}`,
                  fullName: details.fullName,
                  position: details.position,
                  team: details.team || team.name,
                  league: details.league || 'International',
                  provider: 'api-basketball',
                  teamId: details.teamId || team.id,
                  leagues: details.leagues,
                });
              }
              break; // Found on this team, move to next team
            }
          }
        }
      } catch (err) {
        // Ignore errors for individual team searches
      }
    }
  }
  
  // Combine and deduplicate by externalId, prioritizing team-specific results
  const seen = new Set<string>();
  const combined: ApiBasketballSearchResult[] = [];
  
  // Add team-specific results first (most reliable, have team info)
  for (const result of teamSpecificResults) {
    if (!seen.has(result.externalId)) {
      seen.add(result.externalId);
      combined.push(result);
    }
  }
  
  // Then add general player search results (may not have team info)
  for (const result of playerResults) {
    if (!seen.has(result.externalId)) {
      seen.add(result.externalId);
      combined.push(result);
    }
  }
  
  // Finally add team/player search results
  for (const result of teamPlayerResults) {
    if (!seen.has(result.externalId)) {
      seen.add(result.externalId);
      combined.push(result);
    }
  }
  
  // Sort: prioritize results with known European teams and team info
  const knownTeamKeywords = ['asvel', 'lyon', 'villeurbanne', 'valencia', 'paris', 'euroleague', 'acb', 'lnb'];
  combined.sort((a, b) => {
    // First, prioritize results that have team info
    const aHasTeam = a.team && a.team !== 'Unknown';
    const bHasTeam = b.team && b.team !== 'Unknown';
    if (aHasTeam && !bHasTeam) return -1;
    if (!aHasTeam && bHasTeam) return 1;
    
    // Then prioritize known European teams
    const aTeamLower = (a.team || '').toLowerCase();
    const bTeamLower = (b.team || '').toLowerCase();
    const aMatches = knownTeamKeywords.some(t => aTeamLower.includes(t));
    const bMatches = knownTeamKeywords.some(t => bTeamLower.includes(t));
    if (aMatches && !bMatches) return -1;
    if (!aMatches && bMatches) return 1;
    
    return 0;
  });
  
  return combined.slice(0, 25); // Limit to 25 results
}

