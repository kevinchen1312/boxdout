/**
 * Get roster by checking game lineups/rosters
 * Uses endpoints we know work
 * Run: node get-roster-via-games.js
 */

const API_KEY = '137753bdbaae2a23471e3aad86e92c73';
const BASE_URL = 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

console.log('🏀 Getting Chalon Roster via Game Data\n');

async function request(url, description) {
  console.log(`\n${description}`);
  console.log(`URL: ${url}`);
  
  try {
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log(`Results: ${data.response?.length || 0}\n`);
    
    return data;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return null;
  }
}

async function main() {
  const teamId = 6036; // Chalon/Saone U21
  
  // Step 1: Get recent games
  console.log('='.repeat(70));
  console.log('STEP 1: Get Recent Games for Chalon/Saone U21');
  console.log('='.repeat(70));
  
  const games = await request(
    `${BASE_URL}/games?team=${teamId}&season=2025`,
    '🔍 Getting games for team 6036'
  );
  
  if (!games || !games.response || games.response.length === 0) {
    console.log('No games found. Trying season 2024...');
    await new Promise(r => setTimeout(r, 2000));
    
    const games2024 = await request(
      `${BASE_URL}/games?team=${teamId}&season=2024`,
      '🔍 Getting games for team 6036, season 2024'
    );
    
    if (games2024 && games2024.response) {
      games.response = games2024.response;
    }
  }
  
  if (games && games.response && games.response.length > 0) {
    console.log(`✅ Found ${games.response.length} games\n`);
    
    // Show first few games
    console.log('Recent games:');
    games.response.slice(0, 5).forEach((game, i) => {
      console.log(`${i + 1}. ${game.teams?.home?.name} vs ${game.teams?.away?.name}`);
      console.log(`   Date: ${game.date}, Status: ${game.status?.long}`);
      console.log(`   ID: ${game.id}`);
    });
    
    // Step 2: Try to get game details with players
    console.log('\n' + '='.repeat(70));
    console.log('STEP 2: Get Game Details (Looking for Player Info)');
    console.log('='.repeat(70));
    
    const gameId = games.response[0].id;
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Try game details
    const gameDetails = await request(
      `${BASE_URL}/games?id=${gameId}`,
      `🔍 Getting details for game ${gameId}`
    );
    
    if (gameDetails) {
      console.log('Full game details:');
      console.log(JSON.stringify(gameDetails, null, 2));
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Step 3: Try statistics endpoint with proper format
    console.log('\n' + '='.repeat(70));
    console.log('STEP 3: Get Game Statistics (Player Stats)');
    console.log('='.repeat(70));
    
    const stats = await request(
      `${BASE_URL}/games/statistics?id=${gameId}`,
      `🔍 Getting statistics for game ${gameId}`
    );
    
    if (stats) {
      console.log('Full statistics:');
      console.log(JSON.stringify(stats, null, 2));
      
      // Look for Riethauser
      const statsStr = JSON.stringify(stats).toLowerCase();
      if (statsStr.includes('riethauser')) {
        console.log('\n🎉🎉🎉 FOUND RIETHAUSER! 🎉🎉🎉');
      }
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Step 4: Try the statistics endpoint without "games/"
    console.log('\n' + '='.repeat(70));
    console.log('STEP 4: Alternative Statistics Endpoint');
    console.log('='.repeat(70));
    
    const stats2 = await request(
      `${BASE_URL}/statistics/games?id=${gameId}`,
      `🔍 Alternative statistics endpoint`
    );
    
    if (stats2) {
      console.log('Full statistics:');
      console.log(JSON.stringify(stats2, null, 2));
    }
    
  } else {
    console.log('❌ No games found for this team');
  }
  
  // Step 5: Try searching for Riethauser directly again
  console.log('\n' + '='.repeat(70));
  console.log('STEP 5: Direct Player Search for Verification');
  console.log('='.repeat(70));
  
  await new Promise(r => setTimeout(r, 2000));
  
  const player = await request(
    `${BASE_URL}/players?search=Riethauser`,
    '🔍 Searching for Riethauser'
  );
  
  if (player && player.response && player.response.length > 0) {
    console.log('\n✅ Player IDs found:');
    player.response.forEach(p => {
      console.log(`  - ${p.name} (ID: ${p.id})`);
    });
    
    // Get details for first player
    const playerId = player.response[0].id;
    
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('\n' + '='.repeat(70));
    console.log(`STEP 6: Get Player ${playerId} Statistics`);
    console.log('='.repeat(70));
    
    // Try getting player statistics with different parameters
    const playerStats = await request(
      `${BASE_URL}/statistics/players?id=${playerId}&season=2024`,
      `🔍 Getting player statistics`
    );
    
    if (playerStats) {
      console.log('Player statistics:');
      console.log(JSON.stringify(playerStats, null, 2));
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('COMPLETE');
  console.log('='.repeat(70));
}

main().catch(console.error);





