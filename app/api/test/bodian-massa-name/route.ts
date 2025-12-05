import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

export async function GET(request: NextRequest) {
  try {
    const headers = {
      'x-apisports-key': API_KEY,
    };

    // Search for Bodian Massa
    const searchQueries = [
      'Bodian Massa',
      'Massa Bodian',
      'bodian',
      'massa',
    ];

    const results: any[] = [];

    for (const query of searchQueries) {
      try {
        // Search players
        const playersUrl = `${BASE_URL}/players?search=${encodeURIComponent(query)}`;
        const playersResponse = await fetch(playersUrl, { headers });

        if (playersResponse.ok) {
          const playersData = await playersResponse.json();
          if (playersData.response && Array.isArray(playersData.response)) {
            // Filter for ASVEL players (team ID 26)
            const asvelPlayers = playersData.response.filter((p: any) => {
              const currentYear = new Date().getFullYear();
              const leagues = p.leagues || [];
              return leagues.some((l: any) => {
                if (!l.season) return false;
                const season = parseInt(l.season);
                return season >= 2024 && p.team?.id === 26;
              });
            });

            for (const player of asvelPlayers) {
              results.push({
                query,
                playerId: player.id,
                name: player.name,
                firstname: player.firstname,
                lastname: player.lastname,
                team: player.team?.name,
                teamId: player.team?.id,
                position: player.position,
              });
            }
          }
        }

        // Also try searching on ASVEL team directly
        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;
        const seasonRange = `${currentYear}-${nextYear}`;
        
        const teamPlayersUrl = `${BASE_URL}/players?team=26&search=${encodeURIComponent(query)}&season=${seasonRange}`;
        const teamPlayersResponse = await fetch(teamPlayersUrl, { headers });

        if (teamPlayersResponse.ok) {
          const teamPlayersData = await teamPlayersResponse.json();
          if (teamPlayersData.response && Array.isArray(teamPlayersData.response)) {
            for (const player of teamPlayersData.response) {
              // Avoid duplicates
              if (!results.some(r => r.playerId === player.id)) {
                results.push({
                  query: `${query} (team search)`,
                  playerId: player.id,
                  name: player.name,
                  firstname: player.firstname,
                  lastname: player.lastname,
                  team: player.team?.name,
                  teamId: player.team?.id,
                  position: player.position,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error searching for "${query}":`, err);
      }
    }

    return NextResponse.json({
      searchResults: results,
      analysis: {
        note: 'Check what API-Basketball returns for Bodian Massa',
        expectedFormat: 'Should be "Bodian Massa" (firstname="Bodian", lastname="Massa")',
        currentFormat: results.length > 0 ? {
          name: results[0].name,
          firstname: results[0].firstname,
          lastname: results[0].lastname,
        } : 'No results found',
      },
    });
  } catch (error) {
    console.error('[Test] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check name', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}




