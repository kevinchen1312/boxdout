import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/search-team-id?name=Partizan
 * Search for team ID from API-Basketball
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamName = searchParams.get('name');

    if (!teamName) {
      return NextResponse.json({ error: 'Missing team name' }, { status: 400 });
    }

    const apiKey = process.env.API_BASKETBALL_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API_BASKETBALL_KEY not configured' }, { status: 500 });
    }

    // Search for team by name
    const url = `https://v1.basketball.api-sports.io/teams?search=${encodeURIComponent(teamName)}`;
    const response = await fetch(url, {
      headers: {
        'x-apisports-key': apiKey,
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'API request failed', status: response.status }, { status: 500 });
    }

    const data = await response.json();
    const teams = data?.response || [];

    // Format results
    const results = teams.map((item: any) => ({
      id: item.id,
      name: item.name,
      country: item.country?.name,
      logo: item.logo,
      leagues: item.leagues?.map((l: any) => l.name).join(', ') || 'N/A',
    }));

    return NextResponse.json({
      success: true,
      query: teamName,
      count: results.length,
      teams: results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}




