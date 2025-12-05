/**
 * Simple script to find team roster using different API endpoints
 * Run: node find-roster-simple.js
 */

const API_KEY = '137753bdbaae2a23471e3aad86e92c73';
const BASE_URL = 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

console.log('🏀 Finding Team Roster - Testing Different Approaches\n');

async function test(url, description) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(description);
  console.log(`${'='.repeat(70)}`);
  console.log(`URL: ${url}\n`);
  
  try {
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log(`Results: ${data.results || data.response?.length || 0}`);
    console.log(`\nFull Response:`);
    console.log(JSON.stringify(data, null, 2));
    
    return data;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return null;
  }
}

async function main() {
  // Chalon/Saone U21 team ID where Riethauser should be
  const teamId = 6036;
  const season = 2024;
  
  console.log(`Target: Chalon/Saone U21 (Team ID: ${teamId})\n`);
  
  // Test 1: Players by team
  await test(
    `${BASE_URL}/players?team=${teamId}`,
    'TEST 1: Get players by team ID'
  );
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Players by team and season
  await test(
    `${BASE_URL}/players?team=${teamId}&season=${season}`,
    'TEST 2: Get players by team ID and season'
  );
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 3: Get team statistics
  await test(
    `${BASE_URL}/statistics?team=${teamId}&season=${season}`,
    'TEST 3: Get team statistics'
  );
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 4: Get standings (might include roster)
  await test(
    `${BASE_URL}/standings?team=${teamId}&season=${season}`,
    'TEST 4: Get standings for team'
  );
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 5: Get a specific game and its details
  console.log(`\n${'='.repeat(70)}`);
  console.log('TEST 5: Get game roster from recent game');
  console.log(`${'='.repeat(70)}`);
  
  const gamesUrl = `${BASE_URL}/games?team=${teamId}&season=2025`;
  console.log(`Getting games: ${gamesUrl}\n`);
  
  const gamesResponse = await fetch(gamesUrl, { headers });
  const gamesData = await gamesResponse.json();
  
  console.log(`Found ${gamesData.response?.length || 0} games`);
  
  if (gamesData.response && gamesData.response.length > 0) {
    // Get first completed game
    const completedGame = gamesData.response.find(g => 
      g.status?.short === 'FT' || g.status?.long === 'Game Finished'
    );
    
    if (completedGame) {
      const gameId = completedGame.id;
      console.log(`\nChecking game ID: ${gameId}`);
      console.log(`${completedGame.teams?.home?.name} vs ${completedGame.teams?.away?.name}`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try different statistics endpoints
      await test(
        `${BASE_URL}/statistics?game=${gameId}`,
        'TEST 5a: Game statistics (player stats)'
      );
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await test(
        `${BASE_URL}/games/statistics?id=${gameId}`,
        'TEST 5b: Alternative game statistics endpoint'
      );
    }
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 6: Try getting all players from French league
  await test(
    `${BASE_URL}/players?league=118&season=${season}`,
    'TEST 6: Get all players from French LNB Pro A league'
  );
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('TESTS COMPLETE');
  console.log(`${'='.repeat(70)}`);
  console.log('\nLook for responses with results > 0 to find available data');
}

main().catch(console.error);




