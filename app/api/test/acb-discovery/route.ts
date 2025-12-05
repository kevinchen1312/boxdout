import { NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

const seasonsToCheck = ["2025-2026", "2024-2025"];
const JOVENTUT_TEAM_ID = 2334;

export async function GET() {
  console.log('\n🔵🔵🔵 ACB DISCOVERY TEST 🔵🔵🔵\n');
  
  try {
    const results = [];
    
    for (const season of seasonsToCheck) {
      console.log(`\n🔵 Processing season: ${season}`);
      
      // Step 1: Fetch all Spanish leagues for this season
      const leaguesUrl = `${BASE_URL}/leagues?country=Spain&season=${season}`;
      console.log(`🔵 Fetching leagues: ${leaguesUrl}`);
      
      let leaguesResponse;
      let leaguesData;
      try {
        leaguesResponse = await fetch(leaguesUrl, { headers });
        leaguesData = await leaguesResponse.json();
        
        if (!leaguesResponse.ok) {
          throw new Error(`HTTP ${leaguesResponse.status}: ${JSON.stringify(leaguesData)}`);
        }
      } catch (error) {
        console.error(`🔵❌ Error fetching leagues for ${season}:`, error);
        console.error(`🔵   URL: ${leaguesUrl}`);
        results.push({
          season,
          error: `Failed to fetch leagues: ${error instanceof Error ? error.message : String(error)}`,
          spanishLeaguesFound: [],
          acbCandidates: [],
        });
        continue;
      }
      
      const allLeagues = leaguesData.response || [];
      console.log(`🔵   Found ${allLeagues.length} Spanish leagues for ${season}`);
      
      // Log all leagues found
      const spanishLeaguesFound = allLeagues.map((league: any) => {
        console.log(`🔵   League: id=${league.id}, name="${league.name}", type="${league.type || 'N/A'}"`);
        return {
          id: league.id,
          name: league.name,
          type: league.type || 'N/A',
        };
      });
      
      // Step 2: Identify ACB candidates (name includes "ACB" or "Endesa")
      const acbCandidates = allLeagues.filter((league: any) => {
        const name = (league.name || '').toLowerCase();
        return name.includes('acb') || name.includes('endesa');
      });
      
      console.log(`🔵   Found ${acbCandidates.length} ACB candidate(s)`);
      
      // Step 3: For each ACB candidate, check games
      const candidateResults = [];
      
      for (const league of acbCandidates) {
        const leagueId = league.id;
        const leagueName = league.name;
        
        console.log(`\n🔵   Checking league: ${leagueId} - ${leagueName}`);
        
        // Step 3a: Get all games for this league+season
        const gamesUrl = `${BASE_URL}/games?league=${leagueId}&season=${season}`;
        console.log(`🔵     Fetching games: ${gamesUrl}`);
        
        let gamesResponse;
        let gamesData;
        try {
          gamesResponse = await fetch(gamesUrl, { headers });
          gamesData = await gamesResponse.json();
          
          if (!gamesResponse.ok) {
            throw new Error(`HTTP ${gamesResponse.status}: ${JSON.stringify(gamesData)}`);
          }
        } catch (error) {
          console.error(`🔵     ❌ Error fetching games:`, error);
          console.error(`🔵       URL: ${gamesUrl}`);
          candidateResults.push({
            leagueId,
            name: leagueName,
            error: `Failed to fetch games: ${error instanceof Error ? error.message : String(error)}`,
            totalGames: 0,
            sampleDates: [],
            distinctTeams: [],
            joventutGames: 0,
          });
          continue;
        }
        
        const games = gamesData.response || [];
        console.log(`🔵     Found ${games.length} total games`);
        
        // Extract sample dates (first 5)
        const sampleDates = games
          .map((g: any) => g.date)
          .filter(Boolean)
          .slice(0, 5);
        
        // Extract distinct teams
        const teamsSet = new Set<string>();
        games.forEach((game: any) => {
          if (game.teams?.home?.name) teamsSet.add(game.teams.home.name);
          if (game.teams?.away?.name) teamsSet.add(game.teams.away.name);
        });
        const distinctTeams = Array.from(teamsSet);
        
        console.log(`🔵     Sample dates: ${sampleDates.slice(0, 3).join(', ')}`);
        console.log(`🔵     Distinct teams: ${distinctTeams.length}`);
        
        // Step 3b: Check Joventut games specifically
        const joventutGamesUrl = `${BASE_URL}/games?team=${JOVENTUT_TEAM_ID}&league=${leagueId}&season=${season}`;
        console.log(`🔵     Fetching Joventut games: ${joventutGamesUrl}`);
        
        let joventutGamesResponse;
        let joventutGamesData;
        let joventutGamesCount = 0;
        
        try {
          joventutGamesResponse = await fetch(joventutGamesUrl, { headers });
          joventutGamesData = await joventutGamesResponse.json();
          
          if (!joventutGamesResponse.ok) {
            throw new Error(`HTTP ${joventutGamesResponse.status}: ${JSON.stringify(joventutGamesData)}`);
          }
          
          const joventutGames = joventutGamesData.response || [];
          joventutGamesCount = joventutGames.length;
          console.log(`🔵     Found ${joventutGamesCount} Joventut games`);
        } catch (error) {
          console.error(`🔵     ❌ Error fetching Joventut games:`, error);
          console.error(`🔵       URL: ${joventutGamesUrl}`);
          // Continue with joventutGamesCount = 0
        }
        
        candidateResults.push({
          leagueId,
          name: leagueName,
          totalGames: games.length,
          sampleDates,
          distinctTeams,
          joventutGames: joventutGamesCount,
        });
      }
      
      results.push({
        season,
        spanishLeaguesFound,
        acbCandidates: candidateResults,
      });
    }
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      seasons: results,
    });
    
  } catch (error) {
    console.error('🔵❌ Test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

