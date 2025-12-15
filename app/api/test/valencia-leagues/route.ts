import { NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

export async function GET() {
  console.log('\n🔵🔵🔵 CHECKING VALENCIA LEAGUES 🔵🔵🔵\n');
  
  try {
    const VALENCIA_TEAM_ID = 2341;
    const currentYear = new Date().getFullYear();
    
    // Fetch all games for Valencia (no league filter)
    console.log(`🔵 Fetching ALL games for Valencia (team ${VALENCIA_TEAM_ID}) in season ${currentYear}...`);
    const allGamesUrl = `${BASE_URL}/games?team=${VALENCIA_TEAM_ID}&season=${currentYear}`;
    console.log(`🔵 URL: ${allGamesUrl}`);
    
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
    
    // Specifically check Liga ACB (117)
    console.log(`\n🔵 Checking Liga ACB (117) specifically...`);
    const ligaAcbGames = allGames.filter((g: any) => g.league?.id === 117);
    console.log(`🔵   Found ${ligaAcbGames.length} Liga ACB games`);
    
    if (ligaAcbGames.length > 0) {
      console.log(`🔵   Sample Liga ACB games:`);
      ligaAcbGames.slice(0, 5).forEach((g: any, idx: number) => {
        console.log(`🔵     ${idx + 1}. ${g.date} - ${g.teams?.home?.name} vs ${g.teams?.away?.name}`);
      });
    }
    
    // Check Euroleague (120)
    console.log(`\n🔵 Checking Euroleague (120) specifically...`);
    const euroleagueGames = allGames.filter((g: any) => g.league?.id === 120);
    console.log(`🔵   Found ${euroleagueGames.length} Euroleague games`);
    
    // Try different season formats for Liga ACB
    console.log(`\n🔵 Testing different season formats for Liga ACB...`);
    const seasonFormats = [
      currentYear.toString(),
      (currentYear - 1).toString(),
      `${currentYear - 1}-${currentYear}`,
      `${currentYear}-${currentYear + 1}`
    ];
    
    for (const seasonFormat of seasonFormats) {
      const ligaAcbUrl = `${BASE_URL}/games?league=117&season=${seasonFormat}`;
      console.log(`🔵   Testing season format "${seasonFormat}": ${ligaAcbUrl}`);
      
      const ligaAcbResponse = await fetch(ligaAcbUrl, { headers });
      const ligaAcbData = await ligaAcbResponse.json();
      const ligaAcbGamesForSeason = ligaAcbData.response || [];
      
      if (ligaAcbGamesForSeason.length > 0) {
        console.log(`🔵     ✅ Found ${ligaAcbGamesForSeason.length} Liga ACB games for season ${seasonFormat}`);
        
        // Check if Valencia is in these games
        const valenciaInLigaAcb = ligaAcbGamesForSeason.filter((g: any) => 
          g.teams?.home?.id === VALENCIA_TEAM_ID || g.teams?.away?.id === VALENCIA_TEAM_ID
        );
        console.log(`🔵     Valencia games in Liga ACB: ${valenciaInLigaAcb.length}`);
        
        // Check if Joventut is in these games
        const joventutInLigaAcb = ligaAcbGamesForSeason.filter((g: any) => 
          g.teams?.home?.name?.toLowerCase().includes('joventut') ||
          g.teams?.away?.name?.toLowerCase().includes('joventut')
        );
        console.log(`🔵     Joventut games in Liga ACB: ${joventutInLigaAcb.length}`);
      } else {
        console.log(`🔵     ❌ No games found for season ${seasonFormat}`);
      }
    }
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      teamId: VALENCIA_TEAM_ID,
      currentSeason: {
        year: currentYear,
        totalGames: allGames.length,
        leaguesFound: Object.keys(leaguesFound).map(league => ({
          league,
          count: leaguesFound[league].length
        })),
        ligaAcbGames: ligaAcbGames.length,
        euroleagueGames: euroleagueGames.length
      }
    });
    
  } catch (error) {
    console.error('🔵❌ Test error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}






