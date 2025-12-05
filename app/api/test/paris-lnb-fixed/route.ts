import { NextResponse } from 'next/server';

export async function GET() {
  console.log('\n🔵🔵🔵 PARIS LNB PRO A FIXED TEST 🔵🔵🔵\n');
  
  try {
    const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
    const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';
    
    // First, let's check what leagues are available
    console.log(`🔵 Checking available leagues...`);
    const leaguesUrl = `${BASE_URL}/leagues`;
    const leaguesResponse = await fetch(leaguesUrl, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    if (leaguesResponse.ok) {
      const leaguesData = await leaguesResponse.json();
      const leagues = leaguesData.response || [];
      console.log(`🔵 Found ${leagues.length} total leagues`);
      const frenchLeagues = leagues.filter((l: any) => 
        (l.name || '').toLowerCase().includes('lnb') || 
        (l.name || '').toLowerCase().includes('france') ||
        (l.country?.name || '').toLowerCase().includes('france')
      );
      console.log(`🔵 French/LNB leagues found: ${frenchLeagues.length}`);
      frenchLeagues.forEach((l: any) => {
        console.log(`🔵   League ID ${l.id}: ${l.name} (Country: ${l.country?.name || 'Unknown'})`);
      });
    }
    
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    // Try multiple season formats
    const seasonsToCheck = [
      `${currentYear}-${nextYear}`,  // 2025-2026
      `${currentYear - 1}-${currentYear}`,  // 2024-2025
      String(currentYear),  // 2025
      String(currentYear - 1),  // 2024
      String(nextYear),  // 2026
      `${nextYear}-${nextYear}`,  // 2026-2026
    ];
    
    console.log(`🔵 Checking seasons: ${seasonsToCheck.join(', ')}`);
    console.log(`🔵 League: 118 (LNB Pro A)`);
    console.log(`🔵 Team search: "Paris"`);
    
    const seasonSummaries: any[] = [];
    
    for (const season of seasonsToCheck) {
      console.log(`\n🔵🔵🔵 Season: ${season} 🔵🔵🔵\n`);
      
      // Step 1: Fetch ALL teams in LNB Pro A (without search parameter)
      const teamsParams = new URLSearchParams({
        league: '118',
        season: season,
      });
      const teamsUrl = `${BASE_URL}/teams?${teamsParams.toString()}`;
      console.log(`[Paris LNB] Fetching all teams URL: ${teamsUrl}`);
      
      const teamsResponse = await fetch(teamsUrl, {
        headers: {
          'x-apisports-key': API_KEY,
        },
      });
      
      if (!teamsResponse.ok) {
        const errorText = await teamsResponse.text();
        console.error(`[Paris LNB] Teams fetch failed: ${teamsResponse.status} ${teamsResponse.statusText}`);
        console.error(`[Paris LNB] Error: ${errorText.substring(0, 500)}`);
        seasonSummaries.push({
          season,
          error: `Teams fetch failed: ${teamsResponse.status}`,
        });
        continue;
      }
      
      const teamsData = await teamsResponse.json();
      const allTeams = teamsData.response || [];
      console.log(`[Paris LNB] Total teams in LNB Pro A ${season}: ${allTeams.length}`);
      
      // Log response structure if no teams found
      if (allTeams.length === 0) {
        console.log(`[Paris LNB] Response structure:`, JSON.stringify(teamsData).substring(0, 500));
        if (teamsData.errors && teamsData.errors.length > 0) {
          console.log(`[Paris LNB] API errors:`, teamsData.errors);
        }
      }
      
      // Step 2: Filter for Paris-related teams
      const parisTeams = allTeams.filter((team: any) => {
        const name = (team.name || '').toLowerCase();
        return name.includes('paris') || name.includes('paris basket');
      });
      
      console.log(`[Paris LNB] Paris-related teams found: ${parisTeams.length}`);
      
      // Log all teams (first 10) for debugging
      console.log(`[Paris LNB] First 10 teams in LNB Pro A:`);
      allTeams.slice(0, 10).forEach((team: any, idx: number) => {
        console.log(`[Paris LNB]   ${idx + 1}. ID=${team.id}, Name="${team.name}", Country=${team.country?.name || 'Unknown'}`);
      });
      
      // Log all Paris-related teams
      const teamSearchResults = parisTeams.map((team: any) => {
        const teamInfo = {
          id: team.id,
          name: team.name,
          country: team.country?.name || 'Unknown',
          leagueName: team.league?.name || 'Unknown',
        };
        console.log(`[Paris LNB]   Paris team: ID=${teamInfo.id}, Name="${teamInfo.name}", Country=${teamInfo.country}, League=${teamInfo.leagueName}`);
        return teamInfo;
      });
      
      if (parisTeams.length === 0) {
        console.log(`[Paris LNB] No Paris teams found for season ${season}`);
        console.log(`[Paris LNB] Checking if Paris might be under a different name...`);
        // Try searching for common variations
        const variations = ['basket', 'basketball', 'pb'];
        const alternativeTeams = allTeams.filter((team: any) => {
          const name = (team.name || '').toLowerCase();
          return variations.some(v => name.includes(v)) && (team.country?.name || '').toLowerCase().includes('france');
        });
        console.log(`[Paris LNB] Found ${alternativeTeams.length} French teams with basket/basketball in name`);
        alternativeTeams.slice(0, 5).forEach((team: any) => {
          console.log(`[Paris LNB]   Alternative: ID=${team.id}, Name="${team.name}", Country=${team.country?.name || 'Unknown'}`);
        });
        
        seasonSummaries.push({
          season,
          teamSearchResults: [],
          allTeamsCount: allTeams.length,
          error: 'No Paris teams found',
        });
        continue;
      }
      
      // Step 3: Choose the most likely Paris team (first result for now)
      const chosenTeam = parisTeams[0];
      const lnbTeamId = chosenTeam.id;
      console.log(`[Paris LNB] Chosen team ID: ${lnbTeamId} (${chosenTeam.name})`);
      
      // Step 3: Fetch games using the LNB team ID
      const gamesParams = new URLSearchParams({
        team: String(lnbTeamId),
        league: '118',
        season: season,
      });
      const gamesUrl = `${BASE_URL}/games?${gamesParams.toString()}`;
      console.log(`[Paris LNB] Games fetch URL: ${gamesUrl}`);
      
      const gamesResponse = await fetch(gamesUrl, {
        headers: {
          'x-apisports-key': API_KEY,
        },
      });
      
      if (!gamesResponse.ok) {
        const errorText = await gamesResponse.text();
        console.error(`[Paris LNB] Games fetch failed: ${gamesResponse.status} ${gamesResponse.statusText}`);
        console.error(`[Paris LNB] Error: ${errorText.substring(0, 500)}`);
        seasonSummaries.push({
          season,
          teamSearchResults,
          chosenTeamId: lnbTeamId,
          error: `Games fetch failed: ${gamesResponse.status}`,
        });
        continue;
      }
      
      const gamesData = await gamesResponse.json();
      const games = gamesData.response || [];
      console.log(`[Paris LNB] Games fetch => ${games.length} games found`);
      
      // Build sample games
      const sampleGames = games.slice(0, 5).map((g: any) => {
        const gameInfo = {
          id: g.id,
          date: g.date,
          home: g.teams?.home?.name || 'Unknown',
          away: g.teams?.away?.name || 'Unknown',
          leagueId: g.league?.id || 'Unknown',
          leagueName: g.league?.name || 'Unknown',
        };
        console.log(`[Paris LNB]   Game: ${gameInfo.date} - ${gameInfo.away} @ ${gameInfo.home} (League: ${gameInfo.leagueName}, ID: ${gameInfo.leagueId})`);
        return gameInfo;
      });
      
      const summary = {
        season,
        teamSearchResults,
        chosenTeamId: lnbTeamId,
        chosenTeamName: chosenTeam.name,
        totalGames: games.length,
        sampleGames,
      };
      
      seasonSummaries.push(summary);
      
      console.log(`[Paris LNB] Season ${season} summary: ${games.length} games found using team ID ${lnbTeamId}`);
    }
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      leagueId: 118,
      leagueName: 'LNB Pro A',
      currentSeason: `${currentYear}-${nextYear}`,
      seasons: seasonSummaries,
      summary: {
        totalSeasonsChecked: seasonsToCheck.length,
        seasonsWithGames: seasonSummaries.filter(s => s.totalGames > 0).length,
        totalGamesFound: seasonSummaries.reduce((sum, s) => sum + (s.totalGames || 0), 0),
      },
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

