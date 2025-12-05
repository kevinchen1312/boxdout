import { NextResponse } from 'next/server';
import { fetchProspectScheduleFromApiBasketball } from '@/lib/loadSchedulesFromApiBasketball';
import type { Prospect } from '@/app/types/prospect';

export async function GET() {
  console.log('\n🔵🔵🔵 VALENCIA ACB TEST 🔵🔵🔵\n');
  
  try {
    // Create a mock prospect for Valencia
    const valenciaProspect: Prospect = {
      rank: 31,
      name: 'Sergio de Larrea',
      position: 'PG',
      team: 'Valencia Basket',
      teamDisplay: 'Valencia (Spain)',
    };
    
    console.log(`🔵 Testing API-Basketball for Valencia prospect: ${valenciaProspect.name}`);
    console.log(`🔵 Team: ${valenciaProspect.teamDisplay || valenciaProspect.team}`);
    
    // Get today's date for date range
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 30); // 30 days ago
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 180); // 180 days ahead
    
    console.log(`🔵 Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    
    // Fetch schedule from API-Basketball
    // The function signature is: fetchProspectScheduleFromApiBasketball(prospect, teamDisplay, directory)
    // We need to create a mock directory
    const directory = new Map();
    const entries = await fetchProspectScheduleFromApiBasketball(
      valenciaProspect,
      valenciaProspect.teamDisplay || valenciaProspect.team || '',
      directory
    );
    
    console.log(`🔵 Total entries returned: ${entries.length}`);
    
    // Analyze games by league
    const gamesByLeague = new Map<string, any[]>();
    const leagueInfo = new Map<string, { id: number; name: string; count: number }>();
    
    entries.forEach(entry => {
      // Try to extract league info from the game data
      // The entry might have league info embedded, or we need to check the raw API response
      const game = entry.game;
      const leagueKey = 'unknown';
      
      if (!gamesByLeague.has(leagueKey)) {
        gamesByLeague.set(leagueKey, []);
      }
      gamesByLeague.get(leagueKey)!.push({
        date: game.date,
        dateKey: game.dateKey,
        homeTeam: game.homeTeam.displayName || game.homeTeam.name,
        awayTeam: game.awayTeam.displayName || game.awayTeam.name,
        id: game.id,
        key: entry.key,
      });
    });
    
    // Log detailed information
    console.log(`\n🔵 Games by League:`);
    gamesByLeague.forEach((games, league) => {
      console.log(`🔵   ${league}: ${games.length} games`);
      games.slice(0, 5).forEach(game => {
        console.log(`🔵     - ${game.dateKey}: ${game.awayTeam} @ ${game.homeTeam} (ID: ${game.id})`);
      });
      if (games.length > 5) {
        console.log(`🔵     ... and ${games.length - 5} more`);
      }
    });
    
    // Check if we have ACB games (league 117)
    const acbGames = entries.filter(entry => {
      // We need to check the raw API response to see league IDs
      // For now, let's log all entries to see what we get
      return true; // We'll analyze this below
    });
    
    console.log(`\n🔵 Sample entries (first 10):`);
    entries.slice(0, 10).forEach((entry, idx) => {
      console.log(`🔵   Entry ${idx + 1}:`);
      console.log(`🔵     Key: ${entry.key}`);
      console.log(`🔵     Date: ${entry.game.date}`);
      console.log(`🔵     Teams: ${entry.game.awayTeam.displayName || entry.game.awayTeam.name} @ ${entry.game.homeTeam.displayName || entry.game.homeTeam.name}`);
      console.log(`🔵     Game ID: ${entry.game.id}`);
    });
    
    // Also try to fetch raw API data to see league IDs
    console.log(`\n🔵 Attempting to fetch raw API data for Valencia team ID 2341...`);
    
    const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
    const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';
    
    const dateFromStr = startDate.toISOString().split('T')[0];
    const dateToStr = endDate.toISOString().split('T')[0];
    
    // Fetch from EuroLeague (120)
    const euroleagueUrl = `${BASE_URL}/games?team=2341&league=120&date=${dateFromStr}&date=${dateToStr}`;
    console.log(`🔵 Fetching EuroLeague games: ${euroleagueUrl}`);
    
    const euroleagueResponse = await fetch(euroleagueUrl, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    let euroleagueData: any = null;
    if (euroleagueResponse.ok) {
      euroleagueData = await euroleagueResponse.json();
      console.log(`🔵 EuroLeague response: ${euroleagueData.response?.length || 0} games`);
      if (euroleagueData.response && euroleagueData.response.length > 0) {
        console.log(`🔵   Sample EuroLeague game:`, {
          id: euroleagueData.response[0].id,
          date: euroleagueData.response[0].date,
          league: euroleagueData.response[0].league?.name,
          leagueId: euroleagueData.response[0].league?.id,
          teams: `${euroleagueData.response[0].teams?.away?.name} @ ${euroleagueData.response[0].teams?.home?.name}`,
        });
      }
    } else {
      console.log(`🔵 EuroLeague request failed: ${euroleagueResponse.status} ${euroleagueResponse.statusText}`);
    }
    
    // Fetch from Liga ACB (117)
    const acbUrl = `${BASE_URL}/games?team=2341&league=117&date=${dateFromStr}&date=${dateToStr}`;
    console.log(`🔵 Fetching Liga ACB games: ${acbUrl}`);
    
    const acbResponse = await fetch(acbUrl, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    let acbData: any = null;
    if (acbResponse.ok) {
      acbData = await acbResponse.json();
      console.log(`🔵 Liga ACB response: ${acbData.response?.length || 0} games`);
      if (acbData.response && acbData.response.length > 0) {
        console.log(`🔵   Sample Liga ACB game:`, {
          id: acbData.response[0].id,
          date: acbData.response[0].date,
          league: acbData.response[0].league?.name,
          leagueId: acbData.response[0].league?.id,
          teams: `${acbData.response[0].teams?.away?.name} @ ${acbData.response[0].teams?.home?.name}`,
        });
        console.log(`🔵   First 5 ACB games:`);
        acbData.response.slice(0, 5).forEach((game: any, idx: number) => {
          console.log(`🔵     ${idx + 1}. ${game.date}: ${game.teams?.away?.name} @ ${game.teams?.home?.name} (League: ${game.league?.name}, ID: ${game.league?.id})`);
        });
      } else {
        console.log(`🔵   No ACB games found in date range`);
        console.log(`🔵   Response structure:`, JSON.stringify(acbData).substring(0, 500));
      }
    } else {
      const errorText = await acbResponse.text();
      console.log(`🔵 Liga ACB request failed: ${acbResponse.status} ${acbResponse.statusText}`);
      console.log(`🔵   Error response: ${errorText.substring(0, 500)}`);
    }
    
    // Try with season format instead of date range
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const season = `${currentYear}-${nextYear}`; // Liga ACB uses "YYYY-YYYY" format
    
    console.log(`\n🔵 Trying Liga ACB with season format: ${season}`);
    const acbSeasonUrl = `${BASE_URL}/games?team=2341&league=117&season=${season}`;
    console.log(`🔵 Fetching: ${acbSeasonUrl}`);
    
    const acbSeasonResponse = await fetch(acbSeasonUrl, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    let acbSeasonData: any = null;
    if (acbSeasonResponse.ok) {
      acbSeasonData = await acbSeasonResponse.json();
      console.log(`🔵 Liga ACB (season format) response: ${acbSeasonData.response?.length || 0} games`);
      if (acbSeasonData.response && acbSeasonData.response.length > 0) {
        console.log(`🔵   Sample Liga ACB game (season):`, {
          id: acbSeasonData.response[0].id,
          date: acbSeasonData.response[0].date,
          league: acbSeasonData.response[0].league?.name,
          leagueId: acbSeasonData.response[0].league?.id,
          teams: `${acbSeasonData.response[0].teams?.away?.name} @ ${acbSeasonData.response[0].teams?.home?.name}`,
        });
        console.log(`🔵   First 5 ACB games (season):`);
        acbSeasonData.response.slice(0, 5).forEach((game: any, idx: number) => {
          console.log(`🔵     ${idx + 1}. ${game.date}: ${game.teams?.away?.name} @ ${game.teams?.home?.name} (League: ${game.league?.name}, ID: ${game.league?.id})`);
        });
      } else {
        console.log(`🔵   No ACB games found with season format`);
        console.log(`🔵   Response structure:`, JSON.stringify(acbSeasonData).substring(0, 500));
      }
    } else {
      const errorText = await acbSeasonResponse.text();
      console.log(`🔵 Liga ACB (season) request failed: ${acbSeasonResponse.status} ${acbSeasonResponse.statusText}`);
      console.log(`🔵   Error response: ${errorText.substring(0, 500)}`);
    }
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      dateRange: {
        start: dateFromStr,
        end: dateToStr,
      },
      entriesFromFunction: entries.length,
      rawApiData: {
        euroleague: {
          count: euroleagueData?.response?.length || 0,
          sample: euroleagueData?.response?.[0] || null,
        },
        acbDateRange: {
          count: acbData?.response?.length || 0,
          sample: acbData?.response?.[0] || null,
          error: acbResponse.ok ? null : {
            status: acbResponse.status,
            statusText: acbResponse.statusText,
          },
        },
        acbSeason: {
          count: acbSeasonData?.response?.length || 0,
          sample: acbSeasonData?.response?.[0] || null,
          season: season,
          error: acbSeasonResponse.ok ? null : {
            status: acbSeasonResponse.status,
            statusText: acbSeasonResponse.statusText,
          },
        },
      },
      entries: entries.slice(0, 20).map(entry => ({
        key: entry.key,
        date: entry.game.date,
        dateKey: entry.game.dateKey,
        homeTeam: entry.game.homeTeam.displayName || entry.game.homeTeam.name,
        awayTeam: entry.game.awayTeam.displayName || entry.game.awayTeam.name,
        id: entry.game.id,
      })),
    });
    
  } catch (error) {
    console.error('🔵❌ Test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}

