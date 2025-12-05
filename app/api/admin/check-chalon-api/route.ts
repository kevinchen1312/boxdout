import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.API_BASKETBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const teamId = 20; // Chalon/Saone
  const currentYear = new Date().getFullYear();

  try {
    // Try multiple seasons to find games
    const seasons = [2025, 2024, '2024-2025', '2025-2026'];
    const allResults = [];

    for (const season of seasons) {
      const url = `https://v1.basketball.api-sports.io/games?team=${teamId}&season=${season}`;
      
      const response = await fetch(url, {
        headers: { 'x-apisports-key': apiKey },
      });

      if (response.ok) {
        const data = await response.json();
        const games = data.response || [];
        
        allResults.push({
          season,
          gamesFound: games.length,
          leagues: [...new Set(games.map((g: any) => g.league?.name))],
          sampleGames: games.slice(0, 5).map((g: any) => ({
            id: g.id,
            date: g.date,
            home: g.teams?.home?.name,
            away: g.teams?.away?.name,
            league: g.league?.name,
            leagueId: g.league?.id,
            status: g.status?.long,
          })),
        });
      }
    }

    // Also check what leagues this team plays in
    const teamInfoUrl = `https://v1.basketball.api-sports.io/teams?id=${teamId}`;
    const teamResponse = await fetch(teamInfoUrl, {
      headers: { 'x-apisports-key': apiKey },
    });

    let teamInfo = null;
    if (teamResponse.ok) {
      const teamData = await teamResponse.json();
      teamInfo = teamData.response?.[0];
    }

    return NextResponse.json({
      success: true,
      teamId: 20,
      teamName: 'Chalon/Saone',
      teamInfo: teamInfo ? {
        name: teamInfo.name,
        country: teamInfo.country?.name,
        logo: teamInfo.logo,
      } : null,
      seasonResults: allResults,
      totalGamesAcrossSeasons: allResults.reduce((sum, r) => sum + r.gamesFound, 0),
      recommendation: allResults.find(r => r.gamesFound > 0) ? 
        `Use season: ${allResults.find(r => r.gamesFound > 0)?.season}` : 
        'No games found in any season',
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Internal error',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}




