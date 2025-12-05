import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/test-team-fetch?teamId=40&teamName=Partizan
 * Test fetching games for a specific team
 */
export async function GET(request: NextRequest) {
  const apiKey = process.env.API_BASKETBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const teamId = request.nextUrl.searchParams.get('teamId');
  const teamName = request.nextUrl.searchParams.get('teamName') || 'Unknown';

  if (!teamId) {
    return NextResponse.json({ error: 'Missing teamId parameter' }, { status: 400 });
  }

  try {
    // Get current season
    const currentYear = new Date().getFullYear();
    const season = currentYear; // Try current year (2025)

    // Try fetching games with season parameter
    const url = `https://v1.basketball.api-sports.io/games?team=${teamId}&season=${season}`;
    
    console.log(`[test-team-fetch] Fetching: ${url}`);
    
    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey },
    });

    if (!response.ok) {
      return NextResponse.json({ 
        error: `API error: ${response.status}`,
        teamId,
        teamName,
      }, { status: 500 });
    }

    const data = await response.json();
    const games = data.response || [];

    return NextResponse.json({
      success: true,
      teamId,
      teamName,
      season,
      gamesFound: games.length,
      sampleGames: games.slice(0, 10).map((g: any) => ({
        date: g.date,
        home: g.teams?.home?.name,
        away: g.teams?.away?.name,
        league: g.league?.name,
        status: g.status?.long,
      })),
      apiResponse: data,
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Internal error',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}

