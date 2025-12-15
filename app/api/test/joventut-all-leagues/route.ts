import { NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

export async function GET() {
  console.log('\n🔵🔵🔵 CHECKING ALL LEAGUES FOR JOVENTUT BADALONA 🔵🔵🔵\n');
  
  try {
    const TEAM_ID = 2334; // Joventut Badalona
    const currentYear = new Date().getFullYear();
    
    // List of potential leagues Joventut might play in
    const potentialLeagues = [
      { id: 117, name: 'Liga ACB' },
      { id: 119, name: 'Basketball Champions League' },
      { id: 202, name: 'Champions League' }, // Already found this one
      { id: 120, name: 'Euroleague' },
      { id: 121, name: 'ABA League' },
      { id: 122, name: 'EuroCup' },
      { id: 123, name: 'FIBA Europe Cup' },
      { id: 124, name: 'VTB United League' },
      { id: 125, name: 'Turkish Super League' },
      { id: 126, name: 'Greek Basket League' },
      { id: 127, name: 'Italian Serie A' },
      { id: 128, name: 'German BBL' },
      { id: 129, name: 'French LNB Pro A' },
      { id: 130, name: 'Spanish Copa del Rey' },
      { id: 131, name: 'Spanish Supercopa' },
    ];
    
    console.log(`🔵 Testing team ${TEAM_ID} (Joventut Badalona) in season ${currentYear}...`);
    console.log(`🔵 Checking ${potentialLeagues.length} potential leagues...\n`);
    
    const results: any[] = [];
    
    // First, get all games without league filter to see what we get
    console.log(`🔵 1. Fetching ALL games (no league filter)...`);
    const allGamesUrl = `${BASE_URL}/games?team=${TEAM_ID}&season=${currentYear}`;
    const allGamesResponse = await fetch(allGamesUrl, { headers });
    const allGamesData = await allGamesResponse.json();
    const allGames = allGamesData.response || [];
    
    console.log(`🔵   ✅ Found ${allGames.length} total games`);
    
    // Group by league
    const leaguesFound: Record<string, any[]> = {};
    allGames.forEach((game: any) => {
      const leagueId = game.league?.id;
      const leagueName = game.league?.name || 'Unknown';
      const key = `${leagueId} - ${leagueName}`;
      if (!leaguesFound[key]) {
        leaguesFound[key] = [];
      }
      leaguesFound[key].push(game);
    });
    
    console.log(`🔵   Leagues found:`);
    Object.keys(leaguesFound).forEach(league => {
      console.log(`🔵     - ${league}: ${leaguesFound[league].length} games`);
    });
    
    // Now test each potential league individually
    console.log(`\n🔵 2. Testing each league individually...`);
    
    for (const league of potentialLeagues) {
      const leagueUrl = `${BASE_URL}/games?team=${TEAM_ID}&league=${league.id}&season=${currentYear}`;
      console.log(`🔵   Testing league ${league.id} (${league.name})...`);
      
      const leagueResponse = await fetch(leagueUrl, { headers });
      const leagueData = await leagueResponse.json();
      const leagueGames = leagueData.response || [];
      
      if (leagueGames.length > 0) {
        console.log(`🔵     ✅ Found ${leagueGames.length} games in ${league.name}`);
        results.push({
          leagueId: league.id,
          leagueName: league.name,
          games: leagueGames.length,
          sampleGames: leagueGames.slice(0, 3).map((g: any) => ({
            date: g.date,
            home: g.teams?.home?.name,
            away: g.teams?.away?.name
          }))
        });
      } else {
        console.log(`🔵     ❌ No games found in ${league.name}`);
      }
    }
    
    // Also try previous season
    console.log(`\n🔵 3. Testing previous season (${currentYear - 1})...`);
    const prevYearUrl = `${BASE_URL}/games?team=${TEAM_ID}&season=${currentYear - 1}`;
    const prevYearResponse = await fetch(prevYearUrl, { headers });
    const prevYearData = await prevYearResponse.json();
    const prevYearGames = prevYearData.response || [];
    
    console.log(`🔵   ✅ Found ${prevYearGames.length} total games for ${currentYear - 1}`);
    
    const prevLeaguesFound: Record<string, any[]> = {};
    prevYearGames.forEach((game: any) => {
      const leagueId = game.league?.id;
      const leagueName = game.league?.name || 'Unknown';
      const key = `${leagueId} - ${leagueName}`;
      if (!prevLeaguesFound[key]) {
        prevLeaguesFound[key] = [];
      }
      prevLeaguesFound[key].push(game);
    });
    
    console.log(`🔵   Leagues found:`);
    Object.keys(prevLeaguesFound).forEach(league => {
      console.log(`🔵     - ${league}: ${prevLeaguesFound[league].length} games`);
    });
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      teamId: TEAM_ID,
      currentSeason: {
        year: currentYear,
        totalGames: allGames.length,
        leaguesFound: Object.keys(leaguesFound).map(league => ({
          league,
          count: leaguesFound[league].length
        }))
      },
      leaguesWithGames: results,
      previousSeason: {
        year: currentYear - 1,
        totalGames: prevYearGames.length,
        leaguesFound: Object.keys(prevLeaguesFound).map(league => ({
          league,
          count: prevLeaguesFound[league].length
        }))
      }
    });
    
  } catch (error) {
    console.error('🔵❌ Test error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}






