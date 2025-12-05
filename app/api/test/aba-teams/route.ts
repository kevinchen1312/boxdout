import { NextResponse } from 'next/server';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

export async function GET() {
  console.log('\n🔵🔵🔵 SEARCHING FOR ABA LIGA TEAMS 🔵🔵🔵\n');
  
  try {
    const ABA_LEAGUE_ID = 132;
    
    // First, get all teams in ABA Liga (season parameter is required!)
    console.log(`🔵 Fetching teams for league ${ABA_LEAGUE_ID}...`);
    // Try multiple seasons to find teams
    const seasons = ['2024', '2025', '2024-2025'];
    let teams: any[] = [];
    
    for (const season of seasons) {
      const teamsUrl = `${BASE_URL}/teams?league=${ABA_LEAGUE_ID}&season=${season}`;
      console.log(`🔵   Trying season ${season}: ${teamsUrl}`);
      
      const teamsResponse = await fetch(teamsUrl, { headers });
      const teamsData = await teamsResponse.json();
      
      console.log(`🔵   Response:`, {
        get: teamsData.get,
        errors: teamsData.errors,
        results: teamsData.results,
        responseLength: teamsData.response?.length
      });
      
      if (teamsData.response && teamsData.response.length > 0) {
        teams = teamsData.response;
        console.log(`🔵✅ Found ${teams.length} teams in ABA Liga for season ${season}`);
        break;
      }
    }
    
    if (teams.length === 0) {
      console.log(`🔵⚠️ No teams found for ABA Liga with any season format`);
    }
    
    // Search for Mega-related teams
    const megaTeams = teams.filter((team: any) => 
      team.name?.toLowerCase().includes('mega') || 
      team.name?.toLowerCase().includes('superbet')
    );
    
    console.log(`\n🔵 Teams matching "mega" or "superbet": ${megaTeams.length}`);
    megaTeams.forEach((team: any) => {
      console.log(`🔵   - ID: ${team.id}, Name: ${team.name}`);
    });
    
    // List all teams
    console.log(`\n🔵 All ABA Liga teams:`);
    teams.slice(0, 20).forEach((team: any, idx: number) => {
      console.log(`🔵   ${idx + 1}. ID: ${team.id}, Name: ${team.name}`);
    });
    
    // Also try searching for teams by name
    console.log(`\n🔵 Searching for teams with "Mega" in name...`);
    const searchUrl = `${BASE_URL}/teams?search=mega`;
    console.log(`🔵 URL: ${searchUrl}`);
    
    const searchResponse = await fetch(searchUrl, { headers });
    const searchData = await searchResponse.json();
    const searchTeams = searchData.response || [];
    
    console.log(`🔵✅ Found ${searchTeams.length} teams matching "mega"`);
    searchTeams.forEach((team: any) => {
      console.log(`🔵   - ID: ${team.id}, Name: ${team.name}`);
    });
    
    // Try searching for "Superbet"
    console.log(`\n🔵 Searching for teams with "Superbet" in name...`);
    const superbetSearchUrl = `${BASE_URL}/teams?search=superbet`;
    console.log(`🔵 URL: ${superbetSearchUrl}`);
    
    const superbetResponse = await fetch(superbetSearchUrl, { headers });
    const superbetData = await superbetResponse.json();
    const superbetTeams = superbetData.response || [];
    
    console.log(`🔵✅ Found ${superbetTeams.length} teams matching "superbet"`);
    superbetTeams.forEach((team: any) => {
      console.log(`🔵   - ID: ${team.id}, Name: ${team.name}`);
    });
    
    // Test the potential Mega team IDs we found - try multiple seasons
    const potentialTeamIds = [1693, 3929, 2344]; // 1693 (original), 3929 (Mega MIS W), 2344 (Mega Soccerbet)
    const testSeasons = ['2024', '2025', '2023', '2024-2025', '2023-2024'];
    
    console.log(`\n🔵 Testing potential Mega Superbet team IDs across multiple seasons...`);
    const teamTestResults: any = {};
    
    for (const teamId of potentialTeamIds) {
      console.log(`\n🔵 Testing team ID ${teamId}...`);
      teamTestResults[teamId] = {};
      
      for (const season of testSeasons) {
        // Try without league filter first
        const teamUrl = `${BASE_URL}/games?team=${teamId}&season=${season}`;
        console.log(`🔵   Season ${season} (no league): ${teamUrl}`);
        
        const teamResponse = await fetch(teamUrl, { headers });
        const teamData = await teamResponse.json();
        const teamGames = teamData.response || [];
        
        if (teamGames.length > 0) {
          const teamName = teamGames[0].teams?.home?.id === teamId 
            ? teamGames[0].teams?.home?.name 
            : teamGames[0].teams?.away?.name;
          console.log(`🔵   ✅ Found ${teamGames.length} games for team ${teamId} (${teamName}) in season ${season}`);
          console.log(`🔵   Leagues found:`);
          const leagues = new Set(teamGames.map((g: any) => `${g.league?.id} - ${g.league?.name}`));
          leagues.forEach((league: string) => console.log(`🔵     - ${league}`));
          
          teamGames.slice(0, 3).forEach((game: any) => {
            console.log(`🔵   - ${game.teams?.home?.name} vs ${game.teams?.away?.name} on ${game.date} (League: ${game.league?.id} - ${game.league?.name})`);
          });
          
          teamTestResults[teamId][season] = {
            name: teamName,
            games: teamGames.length,
            leagues: Array.from(leagues),
            sampleGames: teamGames.slice(0, 5).map((g: any) => ({
              date: g.date,
              home: g.teams?.home?.name,
              away: g.teams?.away?.name,
              league: `${g.league?.id} - ${g.league?.name}`
            }))
          };
          
          // Found games, no need to check other seasons for this team
          break;
        } else {
          console.log(`🔵   Found 0 games for team ${teamId} in season ${season}`);
        }
      }
      
      // If no games found in any season, try with ABA Liga filter for 2024
      if (Object.keys(teamTestResults[teamId]).length === 0) {
        const abaUrl = `${BASE_URL}/games?team=${teamId}&league=132&season=2024`;
        console.log(`🔵   Trying with ABA Liga filter: ${abaUrl}`);
        
        const abaResponse = await fetch(abaUrl, { headers });
        const abaData = await abaResponse.json();
        const abaGames = abaData.response || [];
        
        console.log(`🔵   Found ${abaGames.length} games for team ${teamId} in ABA Liga (season 2024)`);
        
        teamTestResults[teamId].noGames = {
          abaGames: abaGames.length
        };
      }
    }
    
    // Also check what leagues "Mega Soccerbet" (2344) plays in by getting team info
    console.log(`\n🔵 Getting detailed info for Mega Soccerbet (team 2344)...`);
    const teamInfoUrl = `${BASE_URL}/teams?id=2344`;
    console.log(`🔵 URL: ${teamInfoUrl}`);
    
    const teamInfoResponse = await fetch(teamInfoUrl, { headers });
    const teamInfoData = await teamInfoResponse.json();
    const teamInfo = teamInfoData.response?.[0];
    
    if (teamInfo) {
      console.log(`🔵 Team Info:`);
      console.log(`🔵   ID: ${teamInfo.id}`);
      console.log(`🔵   Name: ${teamInfo.name}`);
      console.log(`🔵   Country: ${teamInfo.country?.name}`);
      console.log(`🔵   Founded: ${teamInfo.founded}`);
      console.log(`🔵   Logo: ${teamInfo.logo}`);
    }
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      league: ABA_LEAGUE_ID,
      totalTeams: teams.length,
      megaTeams: megaTeams.map((t: any) => ({ id: t.id, name: t.name })),
      allTeams: teams.slice(0, 30).map((t: any) => ({ id: t.id, name: t.name })),
      searchResults: {
        mega: searchTeams.map((t: any) => ({ id: t.id, name: t.name })),
        superbet: superbetTeams.map((t: any) => ({ id: t.id, name: t.name }))
      },
      teamTests: teamTestResults
    });
    
  } catch (error) {
    console.error('🔵❌ Test error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

