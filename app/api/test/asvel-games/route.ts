import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

/**
 * GET /api/test/asvel-games
 * Test endpoint to verify we can fetch games for ASVEL (team ID 26)
 */
export async function GET(request: NextRequest) {
  try {
    const results: any = {
      euroleagueGames: null,
      lnbGames: null,
    };

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const seasonRange = `${currentYear}-${nextYear}`;

    // Test fetching EuroLeague games (league 120) for team 26
    console.log('[Test] Fetching EuroLeague games for team 26...');
    try {
      const euroUrl = `${BASE_URL}/games?team=26&league=120&season=${seasonRange}`;
      const euroResponse = await fetch(euroUrl, { headers });
      
      if (euroResponse.ok) {
        const euroData = await euroResponse.json();
        const games = euroData.response || [];
        results.euroleagueGames = {
          total: games.length,
          sampleGames: games.slice(0, 5).map((g: any) => ({
            id: g.id,
            date: g.date,
            home: g.teams?.home?.name,
            away: g.teams?.away?.name,
            league: g.league?.name,
          })),
        };
        console.log(`[Test] Found ${games.length} EuroLeague games for team 26`);
      } else {
        results.euroleagueGames = { error: `HTTP ${euroResponse.status}`, statusText: euroResponse.statusText };
      }
    } catch (error) {
      results.euroleagueGames = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Test fetching LNB Pro A games (league 2) for team 26
    console.log('[Test] Fetching LNB Pro A games for team 26...');
    try {
      const lnbUrl = `${BASE_URL}/games?team=26&league=2&season=${seasonRange}`;
      const lnbResponse = await fetch(lnbUrl, { headers });
      
      if (lnbResponse.ok) {
        const lnbData = await lnbResponse.json();
        const games = lnbData.response || [];
        results.lnbGames = {
          total: games.length,
          sampleGames: games.slice(0, 5).map((g: any) => ({
            id: g.id,
            date: g.date,
            home: g.teams?.home?.name,
            away: g.teams?.away?.name,
            league: g.league?.name,
          })),
        };
        console.log(`[Test] Found ${games.length} LNB Pro A games for team 26`);
      } else {
        results.lnbGames = { error: `HTTP ${lnbResponse.status}`, statusText: lnbResponse.statusText };
      }
    } catch (error) {
      results.lnbGames = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    return NextResponse.json({
      teamId: 26,
      teamName: 'Lyon-Villeurbanne (ASVEL)',
      season: seasonRange,
      ...results,
    }, { status: 200 });
  } catch (error) {
    console.error('[Test] Error:', error);
    return NextResponse.json(
      { error: 'Test failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}





