import { NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

export async function GET() {
  console.log('\n🔵🔵🔵 TESTING ABA LIGA GAMES (ANY TEAM) 🔵🔵🔵\n');
  
  try {
    const ABA_LEAGUE_ID = 132;
    const MEGA_TEAM_ID = 1693;
    
    // Try multiple seasons
    const seasons = ['2025-2026', '2024-2025', '2023-2024', '2024', '2025'];
    const results: any = {};
    
    for (const season of seasons) {
      console.log(`\n🔵 Testing season: ${season}`);
      
      // Try fetching games by league only (no team filter)
      const params = new URLSearchParams();
      params.append('league', String(ABA_LEAGUE_ID));
      params.append('season', season);
      
      const url = `${BASE_URL}/games?${params.toString()}`;
      console.log(`🔵   League only: ${url}`);
      
      const response = await fetch(url, { headers });
      const data = await response.json();
      const games = data.response || [];
      
      console.log(`🔵   ✅ Found ${games.length} games in ABA Liga ${season}`);
      
      if (games.length > 0) {
        console.log(`🔵   First 3 games:`);
        games.slice(0, 3).forEach((game: any, idx: number) => {
          console.log(`🔵     ${idx + 1}. ${game.teams?.home?.name || '?'} vs ${game.teams?.away?.name || '?'} on ${game.date}`);
        });
      }
      
      // Try with team 1693 specifically
      const teamParams = new URLSearchParams();
      teamParams.append('team', String(MEGA_TEAM_ID));
      teamParams.append('league', String(ABA_LEAGUE_ID));
      teamParams.append('season', season);
      
      const teamUrl = `${BASE_URL}/games?${teamParams.toString()}`;
      console.log(`🔵   Mega Superbet: ${teamUrl}`);
      
      const teamResponse = await fetch(teamUrl, { headers });
      const teamData = await teamResponse.json();
      const teamGames = teamData.response || [];
      
      console.log(`🔵   ✅ Found ${teamGames.length} games for Mega Superbet (team ${MEGA_TEAM_ID})`);
      
      results[season] = {
        leagueGames: games.length,
        megaGames: teamGames.length,
        sampleGames: games.slice(0, 5).map((game: any) => ({
          id: game.id,
          date: game.date,
          home: game.teams?.home?.name,
          away: game.teams?.away?.name,
          status: game.status?.long
        })),
        megaSampleGames: teamGames.slice(0, 5).map((game: any) => ({
          id: game.id,
          date: game.date,
          home: game.teams?.home?.name,
          away: game.teams?.away?.name,
          status: game.status?.long
        }))
      };
    }
    
    // Also try with date range (no season)
    console.log(`\n🔵 Testing with date range (no season):`);
    const today = new Date();
    const dateFrom = new Date(today);
    dateFrom.setDate(dateFrom.getDate() - 30);
    const dateTo = new Date(today);
    dateTo.setDate(dateTo.getDate() + 365);
    
    const dateFromStr = dateFrom.toISOString().split('T')[0];
    const dateToStr = dateTo.toISOString().split('T')[0];
    
    const dateParams = new URLSearchParams();
    dateParams.append('league', String(ABA_LEAGUE_ID));
    dateParams.append('dateFrom', dateFromStr);
    dateParams.append('dateTo', dateToStr);
    
    const dateUrl = `${BASE_URL}/games?${dateParams.toString()}`;
    console.log(`🔵   Date range: ${dateUrl}`);
    
    const dateResponse = await fetch(dateUrl, { headers });
    const dateData = await dateResponse.json();
    const dateGames = dateData.response || [];
    
    console.log(`🔵   ✅ Found ${dateGames.length} games with date range`);
    
    // Try Mega Superbet with date range
    const megaDateParams = new URLSearchParams();
    megaDateParams.append('team', String(MEGA_TEAM_ID));
    megaDateParams.append('league', String(ABA_LEAGUE_ID));
    megaDateParams.append('dateFrom', dateFromStr);
    megaDateParams.append('dateTo', dateToStr);
    
    const megaDateUrl = `${BASE_URL}/games?${megaDateParams.toString()}`;
    console.log(`🔵   Mega Superbet with date range: ${megaDateUrl}`);
    
    const megaDateResponse = await fetch(megaDateUrl, { headers });
    const megaDateData = await megaDateResponse.json();
    const megaDateGames = megaDateData.response || [];
    
    console.log(`🔵   ✅ Found ${megaDateGames.length} Mega Superbet games with date range`);
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      league: ABA_LEAGUE_ID,
      team: MEGA_TEAM_ID,
      seasonResults: results,
      dateRangeResults: {
        dateFrom: dateFromStr,
        dateTo: dateToStr,
        leagueGames: dateGames.length,
        megaGames: megaDateGames.length,
        sampleGames: dateGames.slice(0, 10).map((game: any) => ({
          id: game.id,
          date: game.date,
          home: game.teams?.home?.name,
          away: game.teams?.away?.name,
          status: game.status?.long
        })),
        megaSampleGames: megaDateGames.slice(0, 10).map((game: any) => ({
          id: game.id,
          date: game.date,
          home: game.teams?.home?.name,
          away: game.teams?.away?.name,
          status: game.status?.long
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

