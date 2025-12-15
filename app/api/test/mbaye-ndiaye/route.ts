import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

/**
 * GET /api/test/mbaye-ndiaye
 * Test endpoint to check if API-Basketball has Mbaye Ndiaye on ASVEL/Lyon-Villeurbanne
 */
export async function GET(request: NextRequest) {
  try {
    const results: any = {
      playerSearch: null,
      teamSearch: null,
      asvelTeamId: null,
      asvelPlayers: null,
      directPlayerOnTeam: null,
    };

    // 1. Search for "Mbaye Ndiaye" as a player
    console.log('[Test] Searching for player "Mbaye Ndiaye"...');
    try {
      const playerUrl = `${BASE_URL}/players?search=Mbaye Ndiaye`;
      const playerResponse = await fetch(playerUrl, { headers });
      
      if (playerResponse.ok) {
        const playerData = await playerResponse.json();
        results.playerSearch = {
          total: playerData.response?.length || 0,
          players: (playerData.response || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            firstname: p.firstname,
            lastname: p.lastname,
            team: p.team ? {
              id: p.team.id,
              name: p.team.name,
            } : null,
            leagues: (p.leagues || []).map((l: any) => ({
              id: l.id,
              name: l.name,
              season: l.season,
            })),
          })),
        };
        console.log(`[Test] Found ${results.playerSearch.total} players named "Mbaye Ndiaye"`);
      } else {
        results.playerSearch = { error: `HTTP ${playerResponse.status}` };
      }
    } catch (error) {
      results.playerSearch = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // 2. Search for ASVEL/Lyon-Villeurbanne team
    console.log('[Test] Searching for team "ASVEL"...');
    try {
      const teamUrl = `${BASE_URL}/teams?search=ASVEL`;
      const teamResponse = await fetch(teamUrl, { headers });
      
      if (teamResponse.ok) {
        const teamData = await teamResponse.json();
        const asvelTeam = (teamData.response || []).find((t: any) => 
          t.name.toLowerCase().includes('asvel') || 
          t.name.toLowerCase().includes('lyon') ||
          t.name.toLowerCase().includes('villeurbanne')
        );
        
        if (asvelTeam) {
          results.asvelTeamId = asvelTeam.id;
          results.teamSearch = {
            found: true,
            team: {
              id: asvelTeam.id,
              name: asvelTeam.name,
              country: asvelTeam.country?.name,
            },
          };
          console.log(`[Test] Found ASVEL team: ${asvelTeam.name} (ID: ${asvelTeam.id})`);
        } else {
          results.teamSearch = {
            found: false,
            allTeams: (teamData.response || []).map((t: any) => ({
              id: t.id,
              name: t.name,
              country: t.country?.name,
            })),
          };
        }
      } else {
        results.teamSearch = { error: `HTTP ${teamResponse.status}` };
      }
    } catch (error) {
      results.teamSearch = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // 3. If we found ASVEL team ID, search for players on that team
    if (results.asvelTeamId) {
      console.log(`[Test] Searching for players on team ${results.asvelTeamId}...`);
      try {
        const playersUrl = `${BASE_URL}/players?team=${results.asvelTeamId}`;
        const playersResponse = await fetch(playersUrl, { headers });
        
        if (playersResponse.ok) {
          const playersData = await playersResponse.json();
          const allPlayers = playersData.response || [];
          
          // Look for Mbaye Ndiaye specifically
          const mbayePlayers = allPlayers.filter((p: any) => 
            (p.name && p.name.toLowerCase().includes('mbaye')) ||
            (p.firstname && p.firstname.toLowerCase().includes('mbaye')) ||
            (p.lastname && p.lastname.toLowerCase().includes('ndiaye'))
          );
          
          results.asvelPlayers = {
            total: allPlayers.length,
            mbayePlayers: mbayePlayers.map((p: any) => ({
              id: p.id,
              name: p.name,
              firstname: p.firstname,
              lastname: p.lastname,
              leagues: (p.leagues || []).map((l: any) => ({
                id: l.id,
                name: l.name,
                season: l.season,
              })),
            })),
            samplePlayers: allPlayers.slice(0, 10).map((p: any) => ({
              id: p.id,
              name: p.name,
            })),
          };
          console.log(`[Test] Found ${allPlayers.length} players on ASVEL, ${mbayePlayers.length} named Mbaye/Ndiaye`);
        } else {
          results.asvelPlayers = { error: `HTTP ${playersResponse.status}` };
        }
      } catch (error) {
        results.asvelPlayers = { error: error instanceof Error ? error.message : 'Unknown error' };
      }

      // 4. Try searching for "Mbaye Ndiaye" specifically on ASVEL team
      console.log(`[Test] Searching for "Mbaye Ndiaye" on team ${results.asvelTeamId}...`);
      try {
        const directUrl = `${BASE_URL}/players?team=${results.asvelTeamId}&search=Mbaye Ndiaye`;
        const directResponse = await fetch(directUrl, { headers });
        
        if (directResponse.ok) {
          const directData = await directResponse.json();
          results.directPlayerOnTeam = {
            found: (directData.response || []).length > 0,
            players: (directData.response || []).map((p: any) => ({
              id: p.id,
              name: p.name,
              firstname: p.firstname,
              lastname: p.lastname,
              team: p.team ? {
                id: p.team.id,
                name: p.team.name,
              } : null,
              leagues: (p.leagues || []).map((l: any) => ({
                id: l.id,
                name: l.name,
                season: l.season,
              })),
            })),
          };
          console.log(`[Test] Found ${results.directPlayerOnTeam.players.length} players matching "Mbaye Ndiaye" on ASVEL`);
        } else {
          results.directPlayerOnTeam = { error: `HTTP ${directResponse.status}` };
        }
      } catch (error) {
        results.directPlayerOnTeam = { error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }

    // 5. Also try searching for "Lyon-Villeurbanne" team
    console.log('[Test] Searching for team "Lyon-Villeurbanne"...');
    try {
      const lyonUrl = `${BASE_URL}/teams?search=Lyon-Villeurbanne`;
      const lyonResponse = await fetch(lyonUrl, { headers });
      
      if (lyonResponse.ok) {
        const lyonData = await lyonResponse.json();
        results.lyonTeamSearch = {
          total: lyonData.response?.length || 0,
          teams: (lyonData.response || []).map((t: any) => ({
            id: t.id,
            name: t.name,
            country: t.country?.name,
          })),
        };
      }
    } catch (error) {
      // Ignore errors for this search
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('[Test] Error:', error);
    return NextResponse.json(
      { error: 'Test failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}





