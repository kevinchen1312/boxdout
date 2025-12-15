import { NextResponse } from 'next/server';

const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;
const BASE_URL = 'https://v1.basketball.api-sports.io';

export async function GET() {
  try {
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const besiktasTeamId = 1266;
    const seasons = ['2025', '2024-2025'];

    const allResults = [];
    
    for (const season of seasons) {
      // Fetch ALL games for Besiktas (no league filter)
      const params = new URLSearchParams({
        team: String(besiktasTeamId),
        season: season,
      });

      const response = await fetch(`${BASE_URL}/games?${params.toString()}`, {
        headers: { 'x-apisports-key': apiKey },
      });

      const data = await response.json();
      
      // Group games by league
      const byLeague: Record<string, any[]> = {};
      for (const game of (data.response || [])) {
        const leagueId = game.league.id;
        const leagueName = game.league.name;
        const key = `${leagueId}-${leagueName}`;
        if (!byLeague[key]) {
          byLeague[key] = [];
        }
        byLeague[key].push({
          date: game.date.split('T')[0],
          home: game.teams.home.name,
          away: game.teams.away.name,
        });
      }

      allResults.push({
        season,
        totalGames: data.results,
        leagues: Object.entries(byLeague).map(([key, games]) => ({
          league: key,
          gamesCount: games.length,
          sampleGames: games.slice(0, 3),
        })),
      });

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return NextResponse.json({
      besiktasTeamId,
      results: allResults,
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to search',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}





