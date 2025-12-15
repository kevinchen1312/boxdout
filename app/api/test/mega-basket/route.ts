import { NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

export async function GET() {
  console.log('\n🔵🔵🔵 TESTING MEGA BASKET (ID 3161) 🔵🔵🔵\n');
  
  try {
    const TEAM_ID = 3161; // Mega Basket
    
    // 1. Get team info
    console.log(`🔵 1. Getting team info for ID ${TEAM_ID}...`);
    const teamInfoUrl = `${BASE_URL}/teams?id=${TEAM_ID}`;
    const teamInfoResponse = await fetch(teamInfoUrl, { headers });
    const teamInfoData = await teamInfoResponse.json();
    const teamInfo = teamInfoData.response?.[0];
    
    if (teamInfo) {
      console.log(`🔵   ✅ Team found:`);
      console.log(`🔵     Name: ${teamInfo.name}`);
      console.log(`🔵     Country: ${teamInfo.country?.name}`);
      console.log(`🔵     Founded: ${teamInfo.founded || 'N/A'}`);
      console.log(`🔵     Logo: ${teamInfo.logo}`);
    } else {
      console.log(`🔵   ❌ Team not found`);
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }
    
    // 2. Try games with multiple seasons
    console.log(`\n🔵 2. Checking games across multiple seasons...`);
    const seasons = ['2024', '2025', '2023', '2024-2025', '2023-2024', '2022-2023'];
    const seasonResults: any = {};
    
    for (const season of seasons) {
      const gamesUrl = `${BASE_URL}/games?team=${TEAM_ID}&season=${season}`;
      console.log(`🔵   Season ${season}: ${gamesUrl}`);
      
      const gamesResponse = await fetch(gamesUrl, { headers });
      const gamesData = await gamesResponse.json();
      const games = gamesData.response || [];
      
      if (games.length > 0) {
        console.log(`🔵   ✅ Found ${games.length} games for season ${season}`);
        
        // Get unique leagues
        const leagues = new Set(games.map((g: any) => `${g.league?.id} - ${g.league?.name}`));
        console.log(`🔵   Leagues:`);
        leagues.forEach((league: string) => console.log(`🔵     - ${league}`));
        
        console.log(`🔵   Sample games:`);
        games.slice(0, 5).forEach((g: any) => {
          console.log(`🔵     - ${g.teams?.home?.name} vs ${g.teams?.away?.name} on ${g.date} (League: ${g.league?.id} - ${g.league?.name})`);
        });
        
        seasonResults[season] = {
          games: games.length,
          leagues: Array.from(leagues),
          sampleGames: games.slice(0, 10).map((g: any) => ({
            date: g.date,
            home: g.teams?.home?.name,
            away: g.teams?.away?.name,
            league: `${g.league?.id} - ${g.league?.name}`,
            status: g.status?.long
          }))
        };
      } else {
        console.log(`🔵   Found 0 games for season ${season}`);
        seasonResults[season] = { games: 0 };
      }
    }
    
    // 3. Try with date range (no season)
    console.log(`\n🔵 3. Trying games with date range (no season)...`);
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
      const leagues = new Set(dateRangeGames.map((g: any) => `${g.league?.id} - ${g.league?.name}`));
      console.log(`🔵   Leagues:`);
      leagues.forEach((league: string) => console.log(`🔵     - ${league}`));
      dateRangeGames.slice(0, 5).forEach((g: any) => {
        console.log(`🔵   - ${g.teams?.home?.name} vs ${g.teams?.away?.name} on ${g.date} (League: ${g.league?.id} - ${g.league?.name})`);
      });
    }
    
    // 4. Check standings
    console.log(`\n🔵 4. Checking standings...`);
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
    
    // 5. Check if it's in ABA Liga specifically
    console.log(`\n🔵 5. Checking ABA Liga (league 132) specifically...`);
    const abaSeasons = ['2024', '2025', '2024-2025', '2023-2024'];
    
    for (const season of abaSeasons) {
      const abaUrl = `${BASE_URL}/games?team=${TEAM_ID}&league=132&season=${season}`;
      console.log(`🔵   Season ${season}: ${abaUrl}`);
      
      const abaResponse = await fetch(abaUrl, { headers });
      const abaData = await abaResponse.json();
      const abaGames = abaData.response || [];
      
      if (abaGames.length > 0) {
        console.log(`🔵   ✅ Found ${abaGames.length} games in ABA Liga for season ${season}`);
        abaGames.slice(0, 3).forEach((g: any) => {
          console.log(`🔵     - ${g.teams?.home?.name} vs ${g.teams?.away?.name} on ${g.date}`);
        });
        break;
      } else {
        console.log(`🔵   Found 0 games in ABA Liga for season ${season}`);
      }
    }
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      team: {
        id: TEAM_ID,
        name: teamInfo?.name,
        country: teamInfo?.country?.name,
        logo: teamInfo?.logo
      },
      seasonResults,
      dateRangeResults: {
        games: dateRangeGames.length,
        leagues: [...new Set(dateRangeGames.map((g: any) => `${g.league?.id} - ${g.league?.name}`))],
        sampleGames: dateRangeGames.slice(0, 10).map((g: any) => ({
          date: g.date,
          home: g.teams?.home?.name,
          away: g.teams?.away?.name,
          league: `${g.league?.id} - ${g.league?.name}`,
          status: g.status?.long
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






