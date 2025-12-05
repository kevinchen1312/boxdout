import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

/**
 * GET /api/test/asvel-roster
 * Test endpoint to fetch ASVEL roster using various API-Basketball endpoints
 */
export async function GET(request: NextRequest) {
  try {
    const results: any = {
      method1_playersTeam: null,
      method2_playersTeamLeague120: null,
      method3_playersTeamLeague2: null,
      method4_squads: null,
      method5_gamesWithPlayers: null,
    };

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const seasonRange = `${currentYear}-${nextYear}`;
    const seasonSingle = currentYear;

    // Method 1: /players?team=26 (basic)
    console.log('[Test] Method 1: /players?team=26');
    try {
      const url1 = `${BASE_URL}/players?team=26`;
      const response1 = await fetch(url1, { headers });
      
      if (response1.ok) {
        const data1 = await response1.json();
        const players = data1.response || [];
        results.method1_playersTeam = {
          total: players.length,
          players: players.slice(0, 20).map((p: any) => ({
            id: p.id,
            name: p.name,
            firstname: p.firstname,
            lastname: p.lastname,
            position: p.position,
          })),
        };
        console.log(`[Test] Method 1: Found ${players.length} players`);
      } else {
        results.method1_playersTeam = { error: `HTTP ${response1.status}`, statusText: response1.statusText };
      }
    } catch (error) {
      results.method1_playersTeam = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Method 1b: /players?team=26&season=2025-2026
    console.log('[Test] Method 1b: /players?team=26&season=2025-2026');
    try {
      const url1b = `${BASE_URL}/players?team=26&season=${seasonRange}`;
      const response1b = await fetch(url1b, { headers });
      
      if (response1b.ok) {
        const data1b = await response1b.json();
        const players = data1b.response || [];
        results.method1b_playersTeamSeason = {
          total: players.length,
          players: players.map((p: any) => ({
            id: p.id,
            name: p.name || `${p.firstname || ''} ${p.lastname || ''}`.trim(),
            firstname: p.firstname,
            lastname: p.lastname,
            position: p.position,
            age: p.age,
            height: p.height,
            weight: p.weight,
            nationality: p.nationality,
            team: p.team ? {
              id: p.team.id,
              name: p.team.name,
            } : null,
          })),
        };
        console.log(`[Test] Method 1b: Found ${players.length} players`);
      } else {
        results.method1b_playersTeamSeason = { error: `HTTP ${response1b.status}`, statusText: response1b.statusText };
      }
    } catch (error) {
      results.method1b_playersTeamSeason = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Method 2: /players?team=26&league=120 (EuroLeague)
    console.log('[Test] Method 2: /players?team=26&league=120');
    try {
      const url2 = `${BASE_URL}/players?team=26&league=120`;
      const response2 = await fetch(url2, { headers });
      
      if (response2.ok) {
        const data2 = await response2.json();
        const players = data2.response || [];
        results.method2_playersTeamLeague120 = {
          total: players.length,
          players: players.slice(0, 20).map((p: any) => ({
            id: p.id,
            name: p.name,
            firstname: p.firstname,
            lastname: p.lastname,
            position: p.position,
          })),
        };
        console.log(`[Test] Method 2: Found ${players.length} players`);
      } else {
        results.method2_playersTeamLeague120 = { error: `HTTP ${response2.status}`, statusText: response2.statusText };
      }
    } catch (error) {
      results.method2_playersTeamLeague120 = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Method 2b: /players?team=26&league=120&season=2025-2026
    console.log('[Test] Method 2b: /players?team=26&league=120&season=2025-2026');
    try {
      const url2b = `${BASE_URL}/players?team=26&league=120&season=${seasonRange}`;
      const response2b = await fetch(url2b, { headers });
      
      if (response2b.ok) {
        const data2b = await response2b.json();
        const players = data2b.response || [];
        results.method2b_playersTeamLeague120Season = {
          total: players.length,
          players: players.slice(0, 20).map((p: any) => ({
            id: p.id,
            name: p.name,
            firstname: p.firstname,
            lastname: p.lastname,
            position: p.position,
          })),
        };
        console.log(`[Test] Method 2b: Found ${players.length} players`);
      } else {
        results.method2b_playersTeamLeague120Season = { error: `HTTP ${response2b.status}`, statusText: response2b.statusText };
      }
    } catch (error) {
      results.method2b_playersTeamLeague120Season = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Method 3: /players?team=26&league=2 (LNB Pro A)
    console.log('[Test] Method 3: /players?team=26&league=2');
    try {
      const url3 = `${BASE_URL}/players?team=26&league=2`;
      const response3 = await fetch(url3, { headers });
      
      if (response3.ok) {
        const data3 = await response3.json();
        const players = data3.response || [];
        results.method3_playersTeamLeague2 = {
          total: players.length,
          players: players.slice(0, 20).map((p: any) => ({
            id: p.id,
            name: p.name,
            firstname: p.firstname,
            lastname: p.lastname,
            position: p.position,
          })),
        };
        console.log(`[Test] Method 3: Found ${players.length} players`);
      } else {
        results.method3_playersTeamLeague2 = { error: `HTTP ${response3.status}`, statusText: response3.statusText };
      }
    } catch (error) {
      results.method3_playersTeamLeague2 = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Method 4: /squads?team=26 (if this endpoint exists)
    console.log('[Test] Method 4: /squads?team=26');
    try {
      const url4 = `${BASE_URL}/squads?team=26`;
      const response4 = await fetch(url4, { headers });
      
      if (response4.ok) {
        const data4 = await response4.json();
        results.method4_squads = {
          success: true,
          data: data4,
        };
        console.log(`[Test] Method 4: Success`);
      } else {
        results.method4_squads = { error: `HTTP ${response4.status}`, statusText: response4.statusText };
      }
    } catch (error) {
      results.method4_squads = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Method 3b: /players?team=26&league=2&season=2025-2026
    console.log('[Test] Method 3b: /players?team=26&league=2&season=2025-2026');
    try {
      const url3b = `${BASE_URL}/players?team=26&league=2&season=${seasonRange}`;
      const response3b = await fetch(url3b, { headers });
      
      if (response3b.ok) {
        const data3b = await response3b.json();
        const players = data3b.response || [];
        results.method3b_playersTeamLeague2Season = {
          total: players.length,
          players: players.slice(0, 20).map((p: any) => ({
            id: p.id,
            name: p.name,
            firstname: p.firstname,
            lastname: p.lastname,
            position: p.position,
          })),
        };
        console.log(`[Test] Method 3b: Found ${players.length} players`);
      } else {
        results.method3b_playersTeamLeague2Season = { error: `HTTP ${response3b.status}`, statusText: response3b.statusText };
      }
    } catch (error) {
      results.method3b_playersTeamLeague2Season = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Method 5: Get players from recent games (check if game data includes player info)
    console.log('[Test] Method 5: Checking games for player data');
    try {
      // Get a recent game
      const gamesUrl = `${BASE_URL}/games?team=26&league=2&season=${seasonRange}`;
      const gamesResponse = await fetch(gamesUrl, { headers });
      
      if (gamesResponse.ok) {
        const gamesData = await gamesResponse.json();
        const games = gamesData.response || [];
        
        // Check if games have player/statistics data
        const sampleGame = games[0];
        if (sampleGame) {
          results.method5_gamesWithPlayers = {
            gameId: sampleGame.id,
            date: sampleGame.date,
            hasStatistics: !!sampleGame.statistics,
            hasPlayers: !!sampleGame.players,
            gameKeys: Object.keys(sampleGame),
          };
        } else {
          results.method5_gamesWithPlayers = { note: 'No games found to check' };
        }
      } else {
        results.method5_gamesWithPlayers = { error: `HTTP ${gamesResponse.status}` };
      }
    } catch (error) {
      results.method5_gamesWithPlayers = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Method 6: Try /players/statistics endpoint
    console.log('[Test] Method 6: /players/statistics?team=26&league=2&season=2025-2026');
    try {
      const url6 = `${BASE_URL}/players/statistics?team=26&league=2&season=${seasonRange}`;
      const response6 = await fetch(url6, { headers });
      
      if (response6.ok) {
        const data6 = await response6.json();
        const stats = data6.response || [];
        results.method6_playerStatistics = {
          total: stats.length,
          players: stats.slice(0, 20).map((s: any) => ({
            playerId: s.player?.id,
            playerName: s.player?.name,
            games: s.games,
          })),
        };
        console.log(`[Test] Method 6: Found ${stats.length} player statistics`);
      } else {
        results.method6_playerStatistics = { error: `HTTP ${response6.status}`, statusText: response6.statusText };
      }
    } catch (error) {
      results.method6_playerStatistics = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Check for Mbaye Ndiaye in any successful results
    const allPlayers: any[] = [];
    if (results.method1_playersTeam?.players) {
      allPlayers.push(...results.method1_playersTeam.players);
    }
    if (results.method1b_playersTeamSeason?.players) {
      allPlayers.push(...results.method1b_playersTeamSeason.players);
    }
    if (results.method2_playersTeamLeague120?.players) {
      allPlayers.push(...results.method2_playersTeamLeague120.players);
    }
    if (results.method2b_playersTeamLeague120Season?.players) {
      allPlayers.push(...results.method2b_playersTeamLeague120Season.players);
    }
    if (results.method3_playersTeamLeague2?.players) {
      allPlayers.push(...results.method3_playersTeamLeague2.players);
    }
    if (results.method3b_playersTeamLeague2Season?.players) {
      allPlayers.push(...results.method3b_playersTeamLeague2Season.players);
    }
    if (results.method6_playerStatistics?.players) {
      // Extract player info from statistics
      results.method6_playerStatistics.players.forEach((s: any) => {
        if (s.playerName) {
          allPlayers.push({ name: s.playerName, id: s.playerId });
        }
      });
    }

    const mbayePlayers = allPlayers.filter((p: any) => 
      (p.name && p.name.toLowerCase().includes('mbaye')) ||
      (p.firstname && p.firstname.toLowerCase().includes('mbaye')) ||
      (p.lastname && p.lastname.toLowerCase().includes('ndiaye'))
    );

    // Deduplicate players by ID
    const uniquePlayers = new Map();
    allPlayers.forEach((p: any) => {
      const id = p.id || p.playerId;
      if (id && !uniquePlayers.has(id)) {
        uniquePlayers.set(id, p);
      }
    });
    const deduplicatedPlayers = Array.from(uniquePlayers.values());

    return NextResponse.json({
      teamId: 26,
      teamName: 'Lyon-Villeurbanne (ASVEL)',
      methods: results,
      summary: {
        totalPlayersFound: deduplicatedPlayers.length,
        mbayeNdiayeFound: mbayePlayers.length > 0,
        mbayePlayers: mbayePlayers,
        allPlayerNames: deduplicatedPlayers.map((p: any) => p.name || `${p.firstname || ''} ${p.lastname || ''}`).filter(Boolean).sort(),
        allPlayers: deduplicatedPlayers.map((p: any) => ({
          id: p.id || p.playerId,
          name: p.name || `${p.firstname || ''} ${p.lastname || ''}`.trim(),
          firstname: p.firstname,
          lastname: p.lastname,
          position: p.position,
        })).sort((a: any, b: any) => {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        }),
      },
    }, { status: 200 });
  } catch (error) {
    console.error('[Test] Error:', error);
    return NextResponse.json(
      { error: 'Test failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

