/**
 * Get Chalon team roster using API-SPORTS
 * Run: node get-chalon-roster.js
 */

const API_KEY = '137753bdbaae2a23471e3aad86e92c73';
const BASE_URL = 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

console.log('🏀 Getting Chalon Team Roster');
console.log('='  .repeat(70));

// Known Chalon teams from previous search
const chalonTeams = [
  { id: 20, name: 'Chalon/Saone' },
  { id: 6036, name: 'Chalon/Saone U21' },
  { id: 12, name: 'Chalons-Reims' },
  { id: 3666, name: 'Chalons-Reims U21' },
];

async function makeRequest(url, description) {
  try {
    console.log(`\n🔍 ${description}`);
    console.log(`URL: ${url}`);
    
    const response = await fetch(url, { headers });
    const status = response.status;
    const text = await response.text();
    
    console.log(`Status: ${status}`);
    
    if (status === 200) {
      const data = JSON.parse(text);
      const resultCount = data.results || data.response?.length || 0;
      console.log(`✅ SUCCESS! Results: ${resultCount}`);
      return data;
    } else {
      const data = JSON.parse(text);
      console.log(`❌ FAILED: ${data.message || text.substring(0, 100)}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return null;
  }
}

async function getTeamPlayers(teamId) {
  const url = `${BASE_URL}/players?team=${teamId}`;
  return await makeRequest(url, `Getting players for team ${teamId}`);
}

async function getTeamStandings(teamId, season = 2024) {
  const url = `${BASE_URL}/standings?team=${teamId}&season=${season}`;
  return await makeRequest(url, `Getting standings for team ${teamId}, season ${season}`);
}

async function getTeamGames(teamId, season = 2024) {
  const url = `${BASE_URL}/games?team=${teamId}&season=${season}`;
  return await makeRequest(url, `Getting games for team ${teamId}, season ${season}`);
}

async function getGameStatistics(gameId) {
  const url = `${BASE_URL}/statistics?game=${gameId}`;
  return await makeRequest(url, `Getting statistics for game ${gameId}`);
}

async function main() {
  // Try different approaches to get roster
  
  for (const team of chalonTeams) {
    console.log('\n' + '='.repeat(70));
    console.log(`TEAM: ${team.name} (ID: ${team.id})`);
    console.log('='.repeat(70));
    
    // APPROACH 1: Direct players endpoint
    console.log('\n--- Approach 1: Direct Players Endpoint ---');
    const players = await getTeamPlayers(team.id);
    
    if (players && players.response && players.response.length > 0) {
      console.log(`\n✅ Found ${players.response.length} players on roster:`);
      players.response.forEach((player, i) => {
        console.log(`\n${i + 1}. ${player.name || 'N/A'} (ID: ${player.id})`);
        console.log(`   Position: ${player.position || 'N/A'}`);
        console.log(`   Number: ${player.number || 'N/A'}`);
        console.log(`   Country: ${player.country || 'N/A'}`);
        console.log(`   Age: ${player.age || 'N/A'}`);
      });
      
      console.log('\nFull Player Data:');
      console.log(JSON.stringify(players, null, 2));
      
      // Check if Riethauser is in the roster
      const riethauser = players.response.find(p => 
        p.name && p.name.toLowerCase().includes('riethauser')
      );
      
      if (riethauser) {
        console.log('\n🎉🎉🎉 FOUND RIETHAUSER ON THIS TEAM! 🎉🎉🎉');
        console.log(`Player: ${riethauser.name} (ID: ${riethauser.id})`);
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // APPROACH 2: Get recent games and extract players from game statistics
    console.log('\n--- Approach 2: Get Players from Recent Games ---');
    
    for (const season of [2025, 2024]) {
      console.log(`\nSeason ${season}:`);
      const games = await getTeamGames(team.id, season);
      
      if (games && games.response && games.response.length > 0) {
        console.log(`✅ Found ${games.response.length} games`);
        console.log(`\nFirst 3 games:`);
        
        games.response.slice(0, 3).forEach((game, i) => {
          console.log(`\n${i + 1}. ${game.teams?.home?.name} vs ${game.teams?.away?.name}`);
          console.log(`   Date: ${game.date}`);
          console.log(`   Status: ${game.status?.long}`);
          console.log(`   Game ID: ${game.id}`);
        });
        
        // Get statistics for first completed game
        const completedGame = games.response.find(g => 
          g.status?.short === 'FT' || g.status?.short === 'AOT'
        );
        
        if (completedGame) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log(`\n--- Getting player statistics from game ${completedGame.id} ---`);
          const stats = await getGameStatistics(completedGame.id);
          
          if (stats && stats.response) {
            console.log('\n📊 Game Statistics:');
            console.log(JSON.stringify(stats, null, 2));
            
            // Check if Riethauser is in game stats
            const statsStr = JSON.stringify(stats).toLowerCase();
            if (statsStr.includes('riethauser')) {
              console.log('\n🎉🎉🎉 FOUND RIETHAUSER IN GAME STATISTICS! 🎉🎉🎉');
            }
          }
        }
        
        break; // Found games, no need to check other season
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n' + '-'.repeat(70));
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('ROSTER SEARCH COMPLETE');
  console.log('='.repeat(70));
}

main().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  console.error(error.stack);
});




