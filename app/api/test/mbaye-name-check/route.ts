import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

export async function GET(request: NextRequest) {
  try {
    const headers = {
      'x-apisports-key': API_KEY,
    };

    // Search for Mbaye Ndiaye
    const searchQueries = [
      'Mbaye Ndiaye',
      'Ndiaye Mbaye',
      'mbaye',
      'ndiaye',
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
                leagues: player.leagues?.map((l: any) => ({
                  id: l.id,
                  name: l.name,
                  season: l.season,
                })),
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
                  leagues: player.leagues?.map((l: any) => ({
                    id: l.id,
                    name: l.name,
                    season: l.season,
                  })),
                });
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error searching for "${query}":`, err);
      }
    }

    // Also get full ASVEL roster to see all players
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const seasonRange = `${currentYear}-${nextYear}`;
    const rosterUrl = `${BASE_URL}/players?team=26&season=${seasonRange}`;
    const rosterResponse = await fetch(rosterUrl, { headers });

    let roster: any[] = [];
    if (rosterResponse.ok) {
      const rosterData = await rosterResponse.json();
      if (rosterData.response && Array.isArray(rosterData.response)) {
        roster = rosterData.response
          .filter((p: any) => {
            const nameLower = (p.name || '').toLowerCase();
            const firstnameLower = (p.firstname || '').toLowerCase();
            const lastnameLower = (p.lastname || '').toLowerCase();
            return nameLower.includes('mbaye') || nameLower.includes('ndiaye') ||
                   firstnameLower.includes('mbaye') || firstnameLower.includes('ndiaye') ||
                   lastnameLower.includes('mbaye') || lastnameLower.includes('ndiaye');
          })
          .map((p: any) => ({
            playerId: p.id,
            name: p.name,
            firstname: p.firstname,
            lastname: p.lastname,
            position: p.position,
          }));
      }
    }

    return NextResponse.json({
      searchResults: results,
      rosterMatches: roster,
      analysis: {
        note: 'Check the "name", "firstname", and "lastname" fields to see how API-Basketball stores the name',
        expectedFormat: 'Should be "Mbaye Ndiaye" (firstname="Mbaye", lastname="Ndiaye")',
        currentFormat: results.length > 0 ? {
          name: results[0].name,
          firstname: results[0].firstname,
          lastname: results[0].lastname,
          rawPlayer: results[0], // Include full player object
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

