import { NextResponse } from 'next/server';

export async function GET() {
  console.log('\n🔵🔵🔵 LNB PRO A DISCOVERY TEST 🔵🔵🔵\n');
  
  try {
    const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
    const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';
    
    // Step 1: Fetch all available leagues
    console.log(`🔵 Fetching all available leagues...`);
    const leaguesUrl = `${BASE_URL}/leagues`;
    const leaguesResponse = await fetch(leaguesUrl, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    if (!leaguesResponse.ok) {
      const errorText = await leaguesResponse.text();
      return NextResponse.json({
        success: false,
        error: `Failed to fetch leagues: ${leaguesResponse.status} ${leaguesResponse.statusText}`,
        details: errorText.substring(0, 500),
      }, { status: 500 });
    }
    
    const leaguesData = await leaguesResponse.json();
    const allLeagues = leaguesData.response || [];
    console.log(`🔵 Found ${allLeagues.length} total leagues`);
    
    // Step 2: Filter for French leagues
    const frenchLeagueKeywords = ['lnb', 'élite', 'elite', 'betclic', 'pro a', 'france'];
    const frenchLeagues = allLeagues.filter((league: any) => {
      const leagueName = (league.name || '').toLowerCase();
      const countryName = (league.country?.name || '').toLowerCase();
      return countryName.includes('france') || 
             frenchLeagueKeywords.some(keyword => leagueName.includes(keyword));
    });
    
    console.log(`🔵 Found ${frenchLeagues.length} potential French/LNB leagues:`);
    frenchLeagues.forEach((league: any) => {
      console.log(`🔵   League ID ${league.id}: "${league.name}" (Country: ${league.country?.name || 'Unknown'})`);
    });
    
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const seasonsToTry = [
      `${currentYear}-${nextYear}`,  // 2025-2026
      `${currentYear - 1}-${currentYear}`,  // 2024-2025
      String(currentYear),  // 2025
      String(currentYear - 1),  // 2024
      String(nextYear),  // 2026
      `${nextYear}-${nextYear}`,  // 2026-2026
    ];
    
    const leagueResults: any[] = [];
    
    // Step 3: For each French league, try to find teams and games
    for (const league of frenchLeagues) {
      const leagueId = league.id;
      const leagueName = league.name;
      const countryName = league.country?.name || 'Unknown';
      
      console.log(`\n🔵🔵🔵 Testing League ${leagueId}: ${leagueName} 🔵🔵🔵\n`);
      
      const leagueResult: any = {
        leagueId,
        leagueName,
        countryName,
        seasons: [],
        parisTeam: null,
        asvelTeam: null,
      };
      
      // Try each season format
      for (const season of seasonsToTry) {
        console.log(`🔵 Trying season format: ${season}`);
        
        // Fetch teams for this league/season
        const teamsParams = new URLSearchParams({
          league: String(leagueId),
          season: season,
        });
        const teamsUrl = `${BASE_URL}/teams?${teamsParams.toString()}`;
        
        const teamsResponse = await fetch(teamsUrl, {
          headers: {
            'x-apisports-key': API_KEY,
          },
        });
        
        if (!teamsResponse.ok) {
          const errorText = await teamsResponse.text();
          console.log(`🔵   Teams fetch failed: ${teamsResponse.status}`);
          leagueResult.seasons.push({
            season,
            error: `Teams fetch failed: ${teamsResponse.status}`,
            errorDetails: errorText.substring(0, 200),
          });
          continue;
        }
        
        const teamsData = await teamsResponse.json();
        const teams = teamsData.response || [];
        console.log(`🔵   Found ${teams.length} teams for season ${season}`);
        
        if (teams.length === 0) {
          leagueResult.seasons.push({
            season,
            teamsFound: 0,
            error: 'No teams found',
          });
          continue;
        }
        
        // Search for Paris and ASVEL teams
        const parisTeams = teams.filter((team: any) => {
          const name = (team.name || '').toLowerCase();
          return name.includes('paris') || name.includes('paris basket');
        });
        
        const asvelTeams = teams.filter((team: any) => {
          const name = (team.name || '').toLowerCase();
          return name.includes('asvel') || 
                 name.includes('lyon') || 
                 name.includes('villeurbanne') ||
                 name.includes('ldlc');
        });
        
        console.log(`🔵   Paris teams found: ${parisTeams.length}`);
        console.log(`🔵   ASVEL teams found: ${asvelTeams.length}`);
        
        if (parisTeams.length > 0) {
          parisTeams.forEach((team: any) => {
            console.log(`🔵     Paris: ID=${team.id}, Name="${team.name}"`);
          });
          if (!leagueResult.parisTeam) {
            leagueResult.parisTeam = {
              id: parisTeams[0].id,
              name: parisTeams[0].name,
              season: season,
            };
          }
        }
        
        if (asvelTeams.length > 0) {
          asvelTeams.forEach((team: any) => {
            console.log(`🔵     ASVEL: ID=${team.id}, Name="${team.name}"`);
          });
          if (!leagueResult.asvelTeam) {
            leagueResult.asvelTeam = {
              id: asvelTeams[0].id,
              name: asvelTeams[0].name,
              season: season,
            };
          }
        }
        
        // If we found teams, try fetching games
        const testTeamId = parisTeams.length > 0 ? parisTeams[0].id : (asvelTeams.length > 0 ? asvelTeams[0].id : null);
        
        if (testTeamId) {
          const gamesParams = new URLSearchParams({
            team: String(testTeamId),
            league: String(leagueId),
            season: season,
          });
          const gamesUrl = `${BASE_URL}/games?${gamesParams.toString()}`;
          
          const gamesResponse = await fetch(gamesUrl, {
            headers: {
              'x-apisports-key': API_KEY,
            },
          });
          
          if (gamesResponse.ok) {
            const gamesData = await gamesResponse.json();
            const games = gamesData.response || [];
            console.log(`🔵   Found ${games.length} games for team ${testTeamId}`);
            
            leagueResult.seasons.push({
              season,
              teamsFound: teams.length,
              parisTeamsFound: parisTeams.length,
              asvelTeamsFound: asvelTeams.length,
              gamesFound: games.length,
              sampleGames: games.slice(0, 10).map((g: any) => ({
                id: g.id,
                date: g.date,
                home: g.teams?.home?.name || 'Unknown',
                away: g.teams?.away?.name || 'Unknown',
                leagueId: g.league?.id,
                leagueName: g.league?.name,
                status: g.status?.long || g.status?.short,
                scores: g.scores ? {
                  home: g.scores.home,
                  away: g.scores.away,
                } : null,
              })),
              allGames: games.map((g: any) => ({
                id: g.id,
                date: g.date,
                home: g.teams?.home?.name || 'Unknown',
                away: g.teams?.away?.name || 'Unknown',
                leagueId: g.league?.id,
                leagueName: g.league?.name,
                status: g.status?.long || g.status?.short,
                scores: g.scores ? {
                  home: g.scores.home,
                  away: g.scores.away,
                } : null,
              })),
            });
          } else {
            const errorText = await gamesResponse.text();
            console.log(`🔵   Games fetch failed: ${gamesResponse.status}`);
            leagueResult.seasons.push({
              season,
              teamsFound: teams.length,
              parisTeamsFound: parisTeams.length,
              asvelTeamsFound: asvelTeams.length,
              gamesError: `Games fetch failed: ${gamesResponse.status}`,
              gamesErrorDetails: errorText.substring(0, 200),
            });
          }
        } else {
          leagueResult.seasons.push({
            season,
            teamsFound: teams.length,
            parisTeamsFound: parisTeams.length,
            asvelTeamsFound: asvelTeams.length,
          });
        }
      }
      
      leagueResults.push(leagueResult);
    }
    
    // Step 4: Find the best match
    const workingLeagues = leagueResults.filter(l => 
      (l.parisTeam || l.asvelTeam) && 
      l.seasons.some((s: any) => s.gamesFound > 0)
    );
    
    console.log(`\n🔵🔵🔵 SUMMARY 🔵🔵🔵\n`);
    console.log(`🔵 Found ${workingLeagues.length} working league(s):`);
    workingLeagues.forEach(league => {
      console.log(`🔵   League ${league.leagueId}: ${league.leagueName}`);
      if (league.parisTeam) {
        console.log(`🔵     Paris: ID=${league.parisTeam.id}, Name="${league.parisTeam.name}"`);
      }
      if (league.asvelTeam) {
        console.log(`🔵     ASVEL: ID=${league.asvelTeam.id}, Name="${league.asvelTeam.name}"`);
      }
    });
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      totalLeagues: allLeagues.length,
      frenchLeaguesFound: frenchLeagues.length,
      workingLeagues: workingLeagues.length,
      leagues: leagueResults,
      summary: {
        bestMatch: workingLeagues.length > 0 ? {
          leagueId: workingLeagues[0].leagueId,
          leagueName: workingLeagues[0].leagueName,
          parisTeamId: workingLeagues[0].parisTeam?.id,
          parisTeamName: workingLeagues[0].parisTeam?.name,
          asvelTeamId: workingLeagues[0].asvelTeam?.id,
          asvelTeamName: workingLeagues[0].asvelTeam?.name,
          workingSeasons: workingLeagues[0].seasons.filter((s: any) => s.gamesFound > 0).map((s: any) => s.season),
        } : null,
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

