import { NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

export async function GET() {
  console.log('\n🔵🔵🔵 TESTING JOVENTUT BADALONA LEAGUES 🔵🔵🔵\n');
  
  try {
    const TEAM_ID = 2334; // Joventut Badalona
    const currentYear = new Date().getFullYear();
    
    // Test 1: Fetch games WITHOUT league filter to see all leagues
    console.log(`🔵 1. Fetching ALL games for Joventut (no league filter)...`);
    const allGamesUrl = `${BASE_URL}/games?team=${TEAM_ID}&season=${currentYear}`;
    console.log(`🔵   URL: ${allGamesUrl}`);
    
    const allGamesResponse = await fetch(allGamesUrl, { headers });
    const allGamesData = await allGamesResponse.json();
    const allGames = allGamesData.response || [];
    
    console.log(`🔵   ✅ Found ${allGames.length} total games`);
    
    // Group games by league
    const gamesByLeague: Record<string, any[]> = {};
    allGames.forEach((game: any) => {
      const leagueId = game.league?.id;
      const leagueName = game.league?.name || 'Unknown';
      const key = `${leagueId} - ${leagueName}`;
      if (!gamesByLeague[key]) {
        gamesByLeague[key] = [];
      }
      gamesByLeague[key].push(game);
    });
    
    console.log(`🔵   Leagues found:`);
    Object.keys(gamesByLeague).forEach((league) => {
      console.log(`🔵     - ${league}: ${gamesByLeague[league].length} games`);
    });
    
    // Test 2: Fetch games WITH Liga ACB filter (league 117)
    console.log(`\n🔵 2. Fetching games for Liga ACB (league 117)...`);
    const acbUrl = `${BASE_URL}/games?team=${TEAM_ID}&league=117&season=${currentYear}`;
    console.log(`🔵   URL: ${acbUrl}`);
    
    const acbResponse = await fetch(acbUrl, { headers });
    const acbData = await acbResponse.json();
    const acbGames = acbData.response || [];
    
    console.log(`🔵   ✅ Found ${acbGames.length} games in Liga ACB`);
    
    // Test 3: Fetch games WITH Basketball Champions League filter (league 119)
    console.log(`\n🔵 3. Fetching games for Basketball Champions League (league 119)...`);
    const bclUrl = `${BASE_URL}/games?team=${TEAM_ID}&league=119&season=${currentYear}`;
    console.log(`🔵   URL: ${bclUrl}`);
    
    const bclResponse = await fetch(bclUrl, { headers });
    const bclData = await bclResponse.json();
    const bclGames = bclData.response || [];
    
    console.log(`🔵   ✅ Found ${bclGames.length} games in Basketball Champions League`);
    
    // Test 4: Try previous season too
    console.log(`\n🔵 4. Fetching games for previous season (${currentYear - 1})...`);
    const prevYearUrl = `${BASE_URL}/games?team=${TEAM_ID}&season=${currentYear - 1}`;
    console.log(`🔵   URL: ${prevYearUrl}`);
    
    const prevYearResponse = await fetch(prevYearUrl, { headers });
    const prevYearData = await prevYearResponse.json();
    const prevYearGames = prevYearData.response || [];
    
    console.log(`🔵   ✅ Found ${prevYearGames.length} games for ${currentYear - 1}`);
    
    // Group previous season games by league
    const prevGamesByLeague: Record<string, any[]> = {};
    prevYearGames.forEach((game: any) => {
      const leagueId = game.league?.id;
      const leagueName = game.league?.name || 'Unknown';
      const key = `${leagueId} - ${leagueName}`;
      if (!prevGamesByLeague[key]) {
        prevGamesByLeague[key] = [];
      }
      prevGamesByLeague[key].push(game);
    });
    
    console.log(`🔵   Leagues found:`);
    Object.keys(prevGamesByLeague).forEach((league) => {
      console.log(`🔵     - ${league}: ${prevGamesByLeague[league].length} games`);
    });
    
    // Test 5: Check standings to see what leagues the team is in
    console.log(`\n🔵 5. Checking standings for team ${TEAM_ID}...`);
    const standingsUrl = `${BASE_URL}/standings?team=${TEAM_ID}&season=${currentYear}`;
    console.log(`🔵   URL: ${standingsUrl}`);
    
    const standingsResponse = await fetch(standingsUrl, { headers });
    const standingsData = await standingsResponse.json();
    const standings = standingsData.response || [];
    
    console.log(`🔵   ✅ Found ${standings.length} standings entries`);
    standings.forEach((s: any) => {
      console.log(`🔵     - League: ${s.league?.id} - ${s.league?.name}, Season: ${s.league?.season}`);
    });
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      teamId: TEAM_ID,
      currentSeason: {
        year: currentYear,
        totalGames: allGames.length,
        gamesByLeague: Object.keys(gamesByLeague).map(league => ({
          league,
          count: gamesByLeague[league].length,
          sampleGames: gamesByLeague[league].slice(0, 3).map((g: any) => ({
            date: g.date,
            home: g.teams?.home?.name,
            away: g.teams?.away?.name
          }))
        })),
        acbGames: acbGames.length,
        bclGames: bclGames.length
      },
      previousSeason: {
        year: currentYear - 1,
        totalGames: prevYearGames.length,
        gamesByLeague: Object.keys(prevGamesByLeague).map(league => ({
          league,
          count: prevGamesByLeague[league].length
        }))
      },
      standings: standings.map((s: any) => ({
        leagueId: s.league?.id,
        leagueName: s.league?.name,
        season: s.league?.season
      }))
    });
    
  } catch (error) {
    console.error('🔵❌ Test error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}





