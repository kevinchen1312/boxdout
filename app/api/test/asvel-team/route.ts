import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

/**
 * GET /api/test/asvel-team
 * Test endpoint to verify ASVEL team ID and get roster
 */
export async function GET(request: NextRequest) {
  try {
    const results: any = {
      teamId26: null,
      teamId108: null,
      allPlayers: null,
    };

    // Test with team ID 26 (our mapping says ASVEL is 26)
    console.log('[Test] Fetching team info for ID 26...');
    try {
      const team26Url = `${BASE_URL}/teams?id=26`;
      const team26Response = await fetch(team26Url, { headers });
      
      if (team26Response.ok) {
        const team26Data = await team26Response.json();
        if (team26Data.response && team26Data.response.length > 0) {
          results.teamId26 = team26Data.response[0];
          console.log(`[Test] Team ID 26: ${team26Data.response[0].name}`);
        }
      }
    } catch (error) {
      results.teamId26 = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Get all players on team 26
    if (results.teamId26) {
      console.log('[Test] Fetching players for team 26...');
      try {
        const playersUrl = `${BASE_URL}/players?team=26`;
        const playersResponse = await fetch(playersUrl, { headers });
        
        if (playersResponse.ok) {
          const playersData = await playersResponse.json();
          const allPlayers = playersData.response || [];
          
          // Look for Mbaye Ndiaye
          const mbayePlayers = allPlayers.filter((p: any) => 
            (p.name && p.name.toLowerCase().includes('mbaye')) ||
            (p.firstname && p.firstname.toLowerCase().includes('mbaye')) ||
            (p.lastname && p.lastname.toLowerCase().includes('ndiaye'))
          );
          
          results.allPlayers = {
            total: allPlayers.length,
            mbayePlayers: mbayePlayers.map((p: any) => ({
              id: p.id,
              name: p.name,
              firstname: p.firstname,
              lastname: p.lastname,
            })),
            samplePlayers: allPlayers.slice(0, 20).map((p: any) => ({
              id: p.id,
              name: p.name,
              firstname: p.firstname,
              lastname: p.lastname,
            })),
          };
          console.log(`[Test] Found ${allPlayers.length} players on team 26, ${mbayePlayers.length} named Mbaye/Ndiaye`);
        }
      } catch (error) {
        results.allPlayers = { error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }

    // Also test team ID 108 (Paris) for comparison
    console.log('[Test] Fetching team info for ID 108 (Paris)...');
    try {
      const team108Url = `${BASE_URL}/teams?id=108`;
      const team108Response = await fetch(team108Url, { headers });
      
      if (team108Response.ok) {
        const team108Data = await team108Response.json();
        if (team108Data.response && team108Data.response.length > 0) {
          results.teamId108 = team108Data.response[0];
          console.log(`[Test] Team ID 108: ${team108Data.response[0].name}`);
        }
      }
    } catch (error) {
      results.teamId108 = { error: error instanceof Error ? error.message : 'Unknown error' };
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





