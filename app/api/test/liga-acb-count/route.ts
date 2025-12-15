import { NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

export async function GET() {
  console.log('\n🔵🔵🔵 CHECKING LIGA ACB GAMES COUNT 🔵🔵🔵\n');
  
  try {
    const LIGA_ACB_ID = 117;
    const currentYear = new Date().getFullYear();
    
    // Test current season
    console.log(`🔵 Fetching Liga ACB games for season ${currentYear}...`);
    const currentSeasonUrl = `${BASE_URL}/games?league=${LIGA_ACB_ID}&season=${currentYear}`;
    console.log(`🔵 URL: ${currentSeasonUrl}`);
    
    const currentSeasonResponse = await fetch(currentSeasonUrl, { headers });
    const currentSeasonData = await currentSeasonResponse.json();
    const currentSeasonGames = currentSeasonData.response || [];
    
    console.log(`🔵   ✅ Found ${currentSeasonGames.length} games in Liga ACB for ${currentYear}`);
    
    // Group by teams to see how many teams
    const teams = new Set<string>();
    currentSeasonGames.forEach((game: any) => {
      if (game.teams?.home?.name) teams.add(game.teams.home.name);
      if (game.teams?.away?.name) teams.add(game.teams.away.name);
    });
    
    console.log(`🔵   Teams found: ${teams.size}`);
    console.log(`🔵   Sample teams: ${Array.from(teams).slice(0, 10).join(', ')}`);
    
    // Group by date to see date range
    const dates = currentSeasonGames.map((g: any) => g.date).filter(Boolean).sort();
    if (dates.length > 0) {
      console.log(`🔵   Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
    }
    
    // Test previous season
    console.log(`\n🔵 Fetching Liga ACB games for season ${currentYear - 1}...`);
    const prevSeasonUrl = `${BASE_URL}/games?league=${LIGA_ACB_ID}&season=${currentYear - 1}`;
    console.log(`🔵 URL: ${prevSeasonUrl}`);
    
    const prevSeasonResponse = await fetch(prevSeasonUrl, { headers });
    const prevSeasonData = await prevSeasonResponse.json();
    const prevSeasonGames = prevSeasonData.response || [];
    
    console.log(`🔵   ✅ Found ${prevSeasonGames.length} games in Liga ACB for ${currentYear - 1}`);
    
    // Check if Joventut is in the games
    console.log(`\n🔵 Checking if Joventut Badalona games are in Liga ACB...`);
    const joventutGames = currentSeasonGames.filter((g: any) => 
      g.teams?.home?.name?.toLowerCase().includes('joventut') ||
      g.teams?.away?.name?.toLowerCase().includes('joventut')
    );
    
    console.log(`🔵   Found ${joventutGames.length} Joventut games in Liga ACB for ${currentYear}`);
    
    if (joventutGames.length > 0) {
      console.log(`🔵   Sample Joventut games:`);
      joventutGames.slice(0, 5).forEach((g: any, idx: number) => {
        console.log(`🔵     ${idx + 1}. ${g.date} - ${g.teams?.home?.name} vs ${g.teams?.away?.name}`);
      });
    }
    
    // Check previous season for Joventut
    const prevJoventutGames = prevSeasonGames.filter((g: any) => 
      g.teams?.home?.name?.toLowerCase().includes('joventut') ||
      g.teams?.away?.name?.toLowerCase().includes('joventut')
    );
    
    console.log(`🔵   Found ${prevJoventutGames.length} Joventut games in Liga ACB for ${currentYear - 1}`);
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      leagueId: LIGA_ACB_ID,
      currentSeason: {
        year: currentYear,
        totalGames: currentSeasonGames.length,
        teams: teams.size,
        dateRange: dates.length > 0 ? {
          from: dates[0],
          to: dates[dates.length - 1]
        } : null,
        joventutGames: joventutGames.length,
        sampleJoventutGames: joventutGames.slice(0, 10).map((g: any) => ({
          date: g.date,
          home: g.teams?.home?.name,
          away: g.teams?.away?.name
        }))
      },
      previousSeason: {
        year: currentYear - 1,
        totalGames: prevSeasonGames.length,
        joventutGames: prevJoventutGames.length
      }
    });
    
  } catch (error) {
    console.error('🔵❌ Test error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}






