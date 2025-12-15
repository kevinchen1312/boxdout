/**
 * Try the senior Chalon/Saone team (ID: 20) instead of U21
 * Run: node try-senior-chalon-team.js
 */

const API_KEY = '137753bdbaae2a23471e3aad86e92c73';
const BASE_URL = 'https://v1.basketball.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
};

console.log('🏀 Trying Senior Chalon/Saone Team (ID: 20)\n');

async function request(url, desc) {
  console.log(`\n${desc}`);
  console.log(`URL: ${url}`);
  
  const response = await fetch(url, { headers });
  const data = await response.json();
  
  console.log(`Status: ${response.status}`);
  console.log(`Results: ${data.response?.length || 0}`);
  
  if (data.errors && Object.keys(data.errors).length > 0) {
    console.log(`Errors:`, data.errors);
  }
  
  if (data.response && data.response.length > 0) {
    console.log('\n✅ DATA FOUND:');
    console.log(JSON.stringify(data, null, 2));
  }
  
  return data;
}

async function main() {
  const seniorTeamId = 20; // Chalon/Saone senior team
  
  console.log('='.repeat(70));
  console.log('TEST 1: Get games for senior team (ID: 20)');
  console.log('='.repeat(70));
  
  const games2025 = await request(
    `${BASE_URL}/games?team=${seniorTeamId}&season=2025`,
    '🔍 Games for season 2025'
  );
  
  await new Promise(r => setTimeout(r, 2000));
  
  const games2024 = await request(
    `${BASE_URL}/games?team=${seniorTeamId}&season=2024`,
    '🔍 Games for season 2024'
  );
  
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('\n' + '='.repeat(70));
  console.log('TEST 2: Get roster for senior team');
  console.log('='.repeat(70));
  
  const roster2025 = await request(
    `${BASE_URL}/players?team=${seniorTeamId}&season=2025`,
    '🔍 Roster for season 2025'
  );
  
  await new Promise(r => setTimeout(r, 2000));
  
  const roster2024 = await request(
    `${BASE_URL}/players?team=${seniorTeamId}&season=2024`,
    '🔍 Roster for season 2024'
  );
  
  // Check if Riethauser is on senior team
  const allPlayers = [
    ...(roster2025.response || []),
    ...(roster2024.response || [])
  ];
  
  const riethauser = allPlayers.find(p => 
    p.name && p.name.toLowerCase().includes('riethauser')
  );
  
  if (riethauser) {
    console.log('\n🎉🎉🎉 FOUND RIETHAUSER ON SENIOR TEAM! 🎉🎉🎉');
    console.log(JSON.stringify(riethauser, null, 2));
  } else if (allPlayers.length > 0) {
    console.log('\n❌ Riethauser not found on senior team roster');
    console.log(`Total players found: ${allPlayers.length}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log('\nWhat we know about K. Riethauser from API Basketball:');
  console.log('1. Player exists with IDs: 16311 and 58819');
  console.log('2. Name: K. Riethauser (first name not provided)');
  console.log('3. Team data: U21 team (ID 6036) has no games/roster in API');
  console.log('4. Senior team (ID 20) data checked above');
  console.log('\nConclusion: API Basketball tracks the player but has minimal');
  console.log('            information and does not track U21/Espoirs teams.');
}

main().catch(console.error);





