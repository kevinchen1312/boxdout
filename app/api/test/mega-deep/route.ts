import { NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

export async function GET() {
  console.log('\n🔵🔵🔵 DEEP DIVE: MEGA SOCCERBET (2344) 🔵🔵🔵\n');
  
  try {
    const TEAM_ID = 2344; // Mega Soccerbet
    
    // 1. Get team info
    console.log(`🔵 1. Getting team info for ID ${TEAM_ID}...`);
    const teamInfoUrl = `${BASE_URL}/teams?id=${TEAM_ID}`;
    const teamInfoResponse = await fetch(teamInfoUrl, { headers });
    const teamInfoData = await teamInfoResponse.json();
    const teamInfo = teamInfoData.response?.[0];
    
    if (teamInfo) {
      console.log(`🔵   Name: ${teamInfo.name}`);
      console.log(`🔵   Country: ${teamInfo.country?.name}`);
      console.log(`🔵   Logo: ${teamInfo.logo}`);
    }
    
    // 2. Try fixtures endpoint (might be different from games)
    console.log(`\n🔵 2. Trying fixtures endpoint...`);
    const seasons = ['2024', '2025', '2024-2025', '2023-2024'];
    
    for (const season of seasons) {
      const fixturesUrl = `${BASE_URL}/fixtures?team=${TEAM_ID}&season=${season}`;
      console.log(`🔵   Season ${season}: ${fixturesUrl}`);
      
      const fixturesResponse = await fetch(fixturesUrl, { headers });
      const fixturesData = await fixturesResponse.json();
      const fixtures = fixturesData.response || [];
      
      if (fixtures.length > 0) {
        console.log(`🔵   ✅ Found ${fixtures.length} fixtures for season ${season}`);
        fixtures.slice(0, 3).forEach((f: any) => {
          console.log(`🔵     - ${f.teams?.home?.name} vs ${f.teams?.away?.name} on ${f.date} (League: ${f.league?.id} - ${f.league?.name})`);
        });
        break;
      } else {
        console.log(`🔵   Found 0 fixtures for season ${season}`);
      }
    }
    
    // 3. Try standings to see what leagues this team is in
    console.log(`\n🔵 3. Checking standings for team ${TEAM_ID}...`);
    const standingsSeasons = ['2024', '2025', '2024-2025'];
    
    for (const season of standingsSeasons) {
      const standingsUrl = `${BASE_URL}/standings?team=${TEAM_ID}&season=${season}`;
      console.log(`🔵   Season ${season}: ${standingsUrl}`);
      
      const standingsResponse = await fetch(standingsUrl, { headers });
      const standingsData = await standingsResponse.json();
      const standings = standingsData.response || [];
      
      if (standings.length > 0) {
        console.log(`🔵   ✅ Found standings for season ${season}:`);
        standings.forEach((s: any) => {
          console.log(`🔵     League: ${s.league?.id} - ${s.league?.name}`);
          console.log(`🔵     Season: ${s.league?.season}`);
        });
        break;
      } else {
        console.log(`🔵   Found 0 standings for season ${season}`);
      }
    }
    
    // 4. Try games with date range (no season)
    console.log(`\n🔵 4. Trying games with date range (no season)...`);
    const today = new Date();
    const dateFrom = new Date(today);
    dateFrom.setDate(dateFrom.getDate() - 180); // 6 months ago
    const dateTo = new Date(today);
    dateTo.setDate(dateTo.getDate() + 180); // 6 months ahead
    
    const dateFromStr = dateFrom.toISOString().split('T')[0];
    const dateToStr = dateTo.toISOString().split('T')[0];
    
    const dateRangeUrl = `${BASE_URL}/games?team=${TEAM_ID}&dateFrom=${dateFromStr}&dateTo=${dateToStr}`;
    console.log(`🔵   Date range: ${dateRangeUrl}`);
    
    const dateRangeResponse = await fetch(dateRangeUrl, { headers });
    const dateRangeData = await dateRangeResponse.json();
    const dateRangeGames = dateRangeData.response || [];
    
    console.log(`🔵   Found ${dateRangeGames.length} games with date range`);
    if (dateRangeGames.length > 0) {
      console.log(`🔵   Leagues found:`);
      const leagues = new Set(dateRangeGames.map((g: any) => `${g.league?.id} - ${g.league?.name}`));
      leagues.forEach((league: string) => console.log(`🔵     - ${league}`));
      dateRangeGames.slice(0, 5).forEach((g: any) => {
        console.log(`🔵   - ${g.teams?.home?.name} vs ${g.teams?.away?.name} on ${g.date} (League: ${g.league?.id} - ${g.league?.name})`);
      });
    }
    
    // 5. Check if team 1693 has any data at all
    console.log(`\n🔵 5. Checking if team 1693 exists...`);
    const team1693InfoUrl = `${BASE_URL}/teams?id=1693`;
    const team1693InfoResponse = await fetch(team1693InfoUrl, { headers });
    const team1693InfoData = await team1693InfoResponse.json();
    const team1693Info = team1693InfoData.response?.[0];
    
    if (team1693Info) {
      console.log(`🔵   ✅ Team 1693 exists:`);
      console.log(`🔵     Name: ${team1693Info.name}`);
      console.log(`🔵     Country: ${team1693Info.country?.name}`);
      console.log(`🔵     Logo: ${team1693Info.logo}`);
      
      // Try games for 1693 with date range
      const team1693DateUrl = `${BASE_URL}/games?team=1693&dateFrom=${dateFromStr}&dateTo=${dateToStr}`;
      const team1693DateResponse = await fetch(team1693DateUrl, { headers });
      const team1693DateData = await team1693DateResponse.json();
      const team1693Games = team1693DateData.response || [];
      console.log(`🔵     Games with date range: ${team1693Games.length}`);
      if (team1693Games.length > 0) {
        team1693Games.slice(0, 3).forEach((g: any) => {
          console.log(`🔵     - ${g.teams?.home?.name} vs ${g.teams?.away?.name} on ${g.date} (League: ${g.league?.id} - ${g.league?.name})`);
        });
      }
    } else {
      console.log(`🔵   ❌ Team 1693 does not exist in API`);
    }
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      team2344: {
        info: teamInfo,
        dateRangeGames: dateRangeGames.length,
        leagues: [...new Set(dateRangeGames.map((g: any) => `${g.league?.id} - ${g.league?.name}`))],
        sampleGames: dateRangeGames.slice(0, 10).map((g: any) => ({
          date: g.date,
          home: g.teams?.home?.name,
          away: g.teams?.away?.name,
          league: `${g.league?.id} - ${g.league?.name}`
        }))
      },
      team1693: {
        exists: !!team1693Info,
        info: team1693Info,
        games: team1693Info ? (await fetch(`${BASE_URL}/games?team=1693&dateFrom=${dateFromStr}&dateTo=${dateToStr}`, { headers }).then(r => r.json()).then(d => d.response?.length || 0)) : 0
      }
    });
    
  } catch (error) {
    console.error('🔵❌ Test error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}






