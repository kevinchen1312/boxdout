// Test script to verify api-basketball integration works with your prospects
// Run: node test-api-basketball-integration.js

const API_KEY = process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdbaae2a23471e3aad86e92c73';
const BASE_URL = 'https://api-basketball.p.rapidapi.com';

const headers = {
  'X-RapidAPI-Key': API_KEY,
  'X-RapidAPI-Host': 'api-basketball.p.rapidapi.com',
};

// Test teams that prospects play for
const testTeams = [
  { name: 'Valencia Basket', expectedId: 2341 },
  { name: 'ASVEL', expectedId: 26 },
  { name: 'Paris Basketball', expectedId: 108 },
  { name: 'Joventut Badalona', expectedId: 2334 },
];

async function testTeamSearch(teamName) {
  try {
    console.log(`\n🔍 Searching for team: "${teamName}"`);
    const url = `${BASE_URL}/teams?search=${encodeURIComponent(teamName)}`;
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.log(`❌ Failed: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.response && data.response.length > 0) {
      const team = data.response[0];
      console.log(`✅ Found: ${team.name} (ID: ${team.id})`);
      console.log(`   Country: ${team.country?.name || 'N/A'}`);
      console.log(`   Logo: ${team.logo || 'N/A'}`);
      return team.id;
    } else {
      console.log(`❌ No results found`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return null;
  }
}

async function testTeamSchedule(teamId, teamName) {
  try {
    console.log(`\n📅 Fetching schedule for team ID: ${teamId} (${teamName})`);
    
    // Get current year for season
    const currentYear = new Date().getFullYear();
    
    // Try with league filter (EuroLeague = 120)
    const url = `${BASE_URL}/games?team=${teamId}&season=${currentYear}&league=120`;
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.log(`❌ Failed: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const data = await response.json();
    
    if (data.response && Array.isArray(data.response)) {
      console.log(`✅ Found ${data.response.length} games`);
      
      if (data.response.length > 0) {
        const firstGame = data.response[0];
        console.log(`\n   First game:`);
        console.log(`   Date: ${firstGame.date}`);
        console.log(`   Time: ${firstGame.time}`);
        console.log(`   Home: ${firstGame.teams?.home?.name || 'N/A'}`);
        console.log(`   Away: ${firstGame.teams?.away?.name || 'N/A'}`);
        console.log(`   League: ${firstGame.league?.name || 'N/A'}`);
        console.log(`   Status: ${firstGame.status?.long || 'N/A'}`);
      }
      
      return data.response;
    } else {
      console.log(`❌ No games found`);
      return [];
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return [];
  }
}

async function testDateRangeGames() {
  try {
    console.log(`\n📅 Testing date range query (today's games)`);
    
    const today = new Date().toISOString().split('T')[0];
    const url = `${BASE_URL}/games?date=${today}`;
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.log(`❌ Failed: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const data = await response.json();
    
    if (data.response && Array.isArray(data.response)) {
      console.log(`✅ Found ${data.response.length} games today`);
      
      // Filter for EuroLeague games
      const euroleagueGames = data.response.filter(g => g.league?.id === 120);
      console.log(`   EuroLeague games: ${euroleagueGames.length}`);
      
      return data.response;
    } else {
      console.log(`❌ No games found`);
      return [];
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return [];
  }
}

async function main() {
  console.log('🧪 Testing API-Basketball Integration\n');
  console.log(`API Key: ${API_KEY.substring(0, 8)}...`);
  console.log(`Base URL: ${BASE_URL}\n`);
  
  // Test 1: Search for teams
  console.log('='.repeat(60));
  console.log('TEST 1: Team Search');
  console.log('='.repeat(60));
  
  const teamIds = new Map();
  for (const testTeam of testTeams) {
    const teamId = await testTeamSearch(testTeam.name);
    if (teamId) {
      teamIds.set(testTeam.name, teamId);
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
  }
  
  // Test 2: Fetch schedules for found teams
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Team Schedules');
  console.log('='.repeat(60));
  
  for (const [teamName, teamId] of teamIds.entries()) {
    await testTeamSchedule(teamId, teamName);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
  }
  
  // Test 3: Date range query
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Date Range Query');
  console.log('='.repeat(60));
  
  await testDateRangeGames();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successfully tested ${teamIds.size} teams`);
  console.log(`\nNext steps:`);
  console.log(`1. Verify team IDs match your expectations`);
  console.log(`2. Check that schedules are being returned`);
  console.log(`3. Update TEAM_ID_MAPPINGS in loadSchedulesFromApiBasketball.ts if needed`);
  console.log(`4. Set RAPIDAPI_BASKETBALL_KEY environment variable for production`);
}

main().catch(console.error);





