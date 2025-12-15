import { NextResponse } from 'next/server';

const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;
const BASE_URL = 'https://v1.basketball.api-sports.io';

export async function GET() {
  try {
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const besiktasTeamId = 1266;
    const eurocupLeagueId = 121;
    const seasons = ['2025', '2024-2025', '2024'];

    const results = [];
    
    for (const season of seasons) {
      const params = new URLSearchParams({
        league: String(eurocupLeagueId),
        season: season,
        team: String(besiktasTeamId),
      });

      const response = await fetch(`${BASE_URL}/games?${params.toString()}`, {
        headers: { 'x-apisports-key': apiKey },
      });

      const data = await response.json();
      
      results.push({
        season,
        results: data.results,
        games: data.response?.slice(0, 5).map((g: any) => ({
          date: g.date,
          home: g.teams.home.name,
          away: g.teams.away.name,
        })) || [],
      });

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return NextResponse.json({
      besiktasTeamId,
      eurocupLeagueId,
      seasonsChecked: results,
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to search',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}





