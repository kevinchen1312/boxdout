import { NextResponse } from 'next/server';
import { fetchProspectScheduleFromApiBasketball } from '@/lib/loadSchedulesFromApiBasketball';
import type { Prospect } from '@/app/types/prospect';

export async function GET() {
  console.log('\n🔵🔵🔵 PARIS LNB PRO A TEST 🔵🔵🔵\n');
  
  try {
    // Create a mock prospect for Paris Basketball
    const parisProspect: Prospect = {
      rank: 79,
      name: 'Mouhamed Faye',
      position: 'PF',
      team: 'Paris Basketball',
      teamDisplay: 'Paris Basket (France)',
    };
    
    console.log(`🔵 Testing API-Basketball for Paris prospect: ${parisProspect.name}`);
    console.log(`🔵 Team: ${parisProspect.teamDisplay || parisProspect.team}`);
    
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
      parisProspect,
      parisProspect.teamDisplay || parisProspect.team || '',
      directory
    );
    
    console.log(`🔵 Total entries returned: ${entries.length}`);
    
    // Analyze games by league
    const gamesByLeague = new Map<string, any[]>();
    
    entries.forEach(entry => {
      // Try to extract league info from the game data
      const game = entry.game;
      const leagueKey = game.note || 'unknown';
      
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
        note: game.note,
      });
    });
    
    // Log detailed information
    console.log(`\n🔵 Games by League:`);
    gamesByLeague.forEach((games, league) => {
      console.log(`🔵   ${league}: ${games.length} games`);
      games.slice(0, 5).forEach(game => {
        console.log(`🔵     - ${game.dateKey}: ${game.awayTeam} @ ${game.homeTeam} (ID: ${game.id}, Note: ${game.note || 'none'})`);
      });
      if (games.length > 5) {
        console.log(`🔵     ... and ${games.length - 5} more`);
      }
    });
    
    console.log(`\n🔵 Sample entries (first 10):`);
    entries.slice(0, 10).forEach((entry, idx) => {
      console.log(`🔵   Entry ${idx + 1}:`);
      console.log(`🔵     Key: ${entry.key}`);
      console.log(`🔵     Date: ${entry.game.date}`);
      console.log(`🔵     Teams: ${entry.game.awayTeam.displayName || entry.game.awayTeam.name} @ ${entry.game.homeTeam.displayName || entry.game.homeTeam.name}`);
      console.log(`🔵     Game ID: ${entry.game.id}`);
      console.log(`🔵     Note: ${entry.game.note || 'none'}`);
    });
    
    // Also try to fetch raw API data to see league IDs
    console.log(`\n🔵 Attempting to fetch raw API data for Paris team ID 108...`);
    
    const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
    const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';
    
    const dateFromStr = startDate.toISOString().split('T')[0];
    const dateToStr = endDate.toISOString().split('T')[0];
    
    // Fetch from EuroLeague (120)
    const euroleagueUrl = `${BASE_URL}/games?team=108&league=120&date=${dateFromStr}&date=${dateToStr}`;
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
    
    // Fetch from LNB Pro A (118) with date range
    const lnbUrl = `${BASE_URL}/games?team=108&league=118&date=${dateFromStr}&date=${dateToStr}`;
    console.log(`🔵 Fetching LNB Pro A games (date range): ${lnbUrl}`);
    
    const lnbResponse = await fetch(lnbUrl, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    let lnbData: any = null;
    if (lnbResponse.ok) {
      lnbData = await lnbResponse.json();
      console.log(`🔵 LNB Pro A (date range) response: ${lnbData.response?.length || 0} games`);
      if (lnbData.response && lnbData.response.length > 0) {
        console.log(`🔵   Sample LNB Pro A game (date range):`, {
          id: lnbData.response[0].id,
          date: lnbData.response[0].date,
          league: lnbData.response[0].league?.name,
          leagueId: lnbData.response[0].league?.id,
          teams: `${lnbData.response[0].teams?.away?.name} @ ${lnbData.response[0].teams?.home?.name}`,
        });
        console.log(`🔵   First 5 LNB Pro A games (date range):`);
        lnbData.response.slice(0, 5).forEach((game: any, idx: number) => {
          console.log(`🔵     ${idx + 1}. ${game.date}: ${game.teams?.away?.name} @ ${game.teams?.home?.name} (League: ${game.league?.name}, ID: ${game.league?.id})`);
        });
      } else {
        console.log(`🔵   No LNB Pro A games found in date range`);
        console.log(`🔵   Response structure:`, JSON.stringify(lnbData).substring(0, 500));
      }
    } else {
      const errorText = await lnbResponse.text();
      console.log(`🔵 LNB Pro A (date range) request failed: ${lnbResponse.status} ${lnbResponse.statusText}`);
      console.log(`🔵   Error response: ${errorText.substring(0, 500)}`);
    }
    
    // Try with season format instead of date range
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    
    // Try single year format first
    const season = currentYear; // LNB Pro A might use single year format
    console.log(`\n🔵 Trying LNB Pro A with season format: ${season}`);
    const lnbSeasonUrl = `${BASE_URL}/games?team=108&league=118&season=${season}`;
    console.log(`🔵 Fetching: ${lnbSeasonUrl}`);
    
    const lnbSeasonResponse = await fetch(lnbSeasonUrl, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    let lnbSeasonData: any = null;
    if (lnbSeasonResponse.ok) {
      lnbSeasonData = await lnbSeasonResponse.json();
      console.log(`🔵 LNB Pro A (season format ${season}) response: ${lnbSeasonData.response?.length || 0} games`);
      if (lnbSeasonData.response && lnbSeasonData.response.length > 0) {
        console.log(`🔵   Sample LNB Pro A game (season ${season}):`, {
          id: lnbSeasonData.response[0].id,
          date: lnbSeasonData.response[0].date,
          league: lnbSeasonData.response[0].league?.name,
          leagueId: lnbSeasonData.response[0].league?.id,
          teams: `${lnbSeasonData.response[0].teams?.away?.name} @ ${lnbSeasonData.response[0].teams?.home?.name}`,
        });
        console.log(`🔵   First 5 LNB Pro A games (season ${season}):`);
        lnbSeasonData.response.slice(0, 5).forEach((game: any, idx: number) => {
          console.log(`🔵     ${idx + 1}. ${game.date}: ${game.teams?.away?.name} @ ${game.teams?.home?.name} (League: ${game.league?.name}, ID: ${game.league?.id})`);
        });
      } else {
        console.log(`🔵   No LNB Pro A games found with season format ${season}`);
        console.log(`🔵   Response structure:`, JSON.stringify(lnbSeasonData).substring(0, 500));
      }
    } else {
      const errorText = await lnbSeasonResponse.text();
      console.log(`🔵 LNB Pro A (season ${season}) request failed: ${lnbSeasonResponse.status} ${lnbSeasonResponse.statusText}`);
      console.log(`🔵   Error response: ${errorText.substring(0, 500)}`);
    }
    
    // Try "YYYY-YYYY" format (like ACB)
    const seasonRange = `${currentYear}-${nextYear}`;
    console.log(`\n🔵 Trying LNB Pro A with season range format: ${seasonRange}`);
    const lnbSeasonRangeUrl = `${BASE_URL}/games?team=108&league=118&season=${seasonRange}`;
    console.log(`🔵 Fetching: ${lnbSeasonRangeUrl}`);
    
    const lnbSeasonRangeResponse = await fetch(lnbSeasonRangeUrl, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    let lnbSeasonRangeData: any = null;
    if (lnbSeasonRangeResponse.ok) {
      lnbSeasonRangeData = await lnbSeasonRangeResponse.json();
      console.log(`🔵 LNB Pro A (season range ${seasonRange}) response: ${lnbSeasonRangeData.response?.length || 0} games`);
      if (lnbSeasonRangeData.response && lnbSeasonRangeData.response.length > 0) {
        console.log(`🔵   Sample LNB Pro A game (season range ${seasonRange}):`, {
          id: lnbSeasonRangeData.response[0].id,
          date: lnbSeasonRangeData.response[0].date,
          league: lnbSeasonRangeData.response[0].league?.name,
          leagueId: lnbSeasonRangeData.response[0].league?.id,
          teams: `${lnbSeasonRangeData.response[0].teams?.away?.name} @ ${lnbSeasonRangeData.response[0].teams?.home?.name}`,
        });
        console.log(`🔵   First 5 LNB Pro A games (season range ${seasonRange}):`);
        lnbSeasonRangeData.response.slice(0, 5).forEach((game: any, idx: number) => {
          console.log(`🔵     ${idx + 1}. ${game.date}: ${game.teams?.away?.name} @ ${game.teams?.home?.name} (League: ${game.league?.name}, ID: ${game.league?.id})`);
        });
      } else {
        console.log(`🔵   No LNB Pro A games found with season range ${seasonRange}`);
        console.log(`🔵   Response structure:`, JSON.stringify(lnbSeasonRangeData).substring(0, 500));
      }
    } else {
      const errorText = await lnbSeasonRangeResponse.text();
      console.log(`🔵 LNB Pro A (season range ${seasonRange}) request failed: ${lnbSeasonRangeResponse.status} ${lnbSeasonRangeResponse.statusText}`);
      console.log(`🔵   Error response: ${errorText.substring(0, 500)}`);
    }
    
    // Try "2026-2026" format as user suggested
    const season2026 = '2026-2026';
    console.log(`\n🔵 Trying LNB Pro A with season format: ${season2026}`);
    const lnb2026Url = `${BASE_URL}/games?team=108&league=118&season=${season2026}`;
    console.log(`🔵 Fetching: ${lnb2026Url}`);
    
    const lnb2026Response = await fetch(lnb2026Url, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    let lnb2026Data: any = null;
    if (lnb2026Response.ok) {
      lnb2026Data = await lnb2026Response.json();
      console.log(`🔵 LNB Pro A (season ${season2026}) response: ${lnb2026Data.response?.length || 0} games`);
      if (lnb2026Data.response && lnb2026Data.response.length > 0) {
        console.log(`🔵   Sample LNB Pro A game (season ${season2026}):`, {
          id: lnb2026Data.response[0].id,
          date: lnb2026Data.response[0].date,
          league: lnb2026Data.response[0].league?.name,
          leagueId: lnb2026Data.response[0].league?.id,
          teams: `${lnb2026Data.response[0].teams?.away?.name} @ ${lnb2026Data.response[0].teams?.home?.name}`,
        });
        console.log(`🔵   First 5 LNB Pro A games (season ${season2026}):`);
        lnb2026Data.response.slice(0, 5).forEach((game: any, idx: number) => {
          console.log(`🔵     ${idx + 1}. ${game.date}: ${game.teams?.away?.name} @ ${game.teams?.home?.name} (League: ${game.league?.name}, ID: ${game.league?.id})`);
        });
      } else {
        console.log(`🔵   No LNB Pro A games found with season ${season2026}`);
        console.log(`🔵   Response structure:`, JSON.stringify(lnb2026Data).substring(0, 500));
      }
    } else {
      const errorText = await lnb2026Response.text();
      console.log(`🔵 LNB Pro A (season ${season2026}) request failed: ${lnb2026Response.status} ${lnb2026Response.statusText}`);
      console.log(`🔵   Error response: ${errorText.substring(0, 500)}`);
    }
    
    // Also try previous season ranges
    const prevSeasonRange = `${currentYear - 1}-${currentYear}`;
    console.log(`\n🔵 Trying LNB Pro A with previous season range format: ${prevSeasonRange}`);
    const lnbPrevSeasonRangeUrl = `${BASE_URL}/games?team=108&league=118&season=${prevSeasonRange}`;
    console.log(`🔵 Fetching: ${lnbPrevSeasonRangeUrl}`);
    
    const lnbPrevSeasonRangeResponse = await fetch(lnbPrevSeasonRangeUrl, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    let lnbPrevSeasonRangeData: any = null;
    if (lnbPrevSeasonRangeResponse.ok) {
      lnbPrevSeasonRangeData = await lnbPrevSeasonRangeResponse.json();
      console.log(`🔵 LNB Pro A (previous season range ${prevSeasonRange}) response: ${lnbPrevSeasonRangeData.response?.length || 0} games`);
      if (lnbPrevSeasonRangeData.response && lnbPrevSeasonRangeData.response.length > 0) {
        console.log(`🔵   Sample LNB Pro A game (previous season range ${prevSeasonRange}):`, {
          id: lnbPrevSeasonRangeData.response[0].id,
          date: lnbPrevSeasonRangeData.response[0].date,
          league: lnbPrevSeasonRangeData.response[0].league?.name,
          leagueId: lnbPrevSeasonRangeData.response[0].league?.id,
          teams: `${lnbPrevSeasonRangeData.response[0].teams?.away?.name} @ ${lnbPrevSeasonRangeData.response[0].teams?.home?.name}`,
        });
        console.log(`🔵   First 5 LNB Pro A games (previous season range ${prevSeasonRange}):`);
        lnbPrevSeasonRangeData.response.slice(0, 5).forEach((game: any, idx: number) => {
          console.log(`🔵     ${idx + 1}. ${game.date}: ${game.teams?.away?.name} @ ${game.teams?.home?.name} (League: ${game.league?.name}, ID: ${game.league?.id})`);
        });
      }
    } else {
      const errorText = await lnbPrevSeasonRangeResponse.text();
      console.log(`🔵 LNB Pro A (previous season range ${prevSeasonRange}) request failed: ${lnbPrevSeasonRangeResponse.status} ${lnbPrevSeasonRangeResponse.statusText}`);
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
        lnbDateRange: {
          count: lnbData?.response?.length || 0,
          sample: lnbData?.response?.[0] || null,
          error: lnbResponse.ok ? null : {
            status: lnbResponse.status,
            statusText: lnbResponse.statusText,
          },
        },
        lnbSeason: {
          count: lnbSeasonData?.response?.length || 0,
          sample: lnbSeasonData?.response?.[0] || null,
          season: season,
          error: lnbSeasonResponse.ok ? null : {
            status: lnbSeasonResponse.status,
            statusText: lnbSeasonResponse.statusText,
          },
        },
        lnbSeasonRange: {
          count: lnbSeasonRangeData?.response?.length || 0,
          sample: lnbSeasonRangeData?.response?.[0] || null,
          season: seasonRange,
          error: lnbSeasonRangeResponse.ok ? null : {
            status: lnbSeasonRangeResponse.status,
            statusText: lnbSeasonRangeResponse.statusText,
          },
        },
        lnb2026: {
          count: lnb2026Data?.response?.length || 0,
          sample: lnb2026Data?.response?.[0] || null,
          season: season2026,
          error: lnb2026Response.ok ? null : {
            status: lnb2026Response.status,
            statusText: lnb2026Response.statusText,
          },
        },
        lnbPrevSeasonRange: {
          count: lnbPrevSeasonRangeData?.response?.length || 0,
          sample: lnbPrevSeasonRangeData?.response?.[0] || null,
          season: prevSeasonRange,
          error: lnbPrevSeasonRangeResponse.ok ? null : {
            status: lnbPrevSeasonRangeResponse.status,
            statusText: lnbPrevSeasonRangeResponse.statusText,
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
        note: entry.game.note,
      })),
      gamesByLeague: Object.fromEntries(
        Array.from(gamesByLeague.entries()).map(([league, games]) => [
          league,
          games.map(g => ({
            dateKey: g.dateKey,
            matchup: `${g.awayTeam} @ ${g.homeTeam}`,
            id: g.id,
            note: g.note,
          })),
        ])
      ),
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

