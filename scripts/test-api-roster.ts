// Quick test to check API roster response for a known team
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;
const BASE_URL = 'https://v1.basketball.api-sports.io';

async function testTeam(teamId: number, teamName: string, season: string) {
  console.log(`\n🔍 Testing: ${teamName} (ID: ${teamId})`);
  console.log(`   Season: ${season}`);
  
  const params = new URLSearchParams({
    team: String(teamId),
    season: season,
  });
  
  const url = `${BASE_URL}/players?${params.toString()}`;
  console.log(`   URL: ${url}`);
  
  const response = await fetch(url, {
    headers: { 'x-apisports-key': apiKey! },
  });
  
  const data = await response.json();
  
  console.log(`\n📊 Response:`);
  console.log(`   Status: ${response.status}`);
  console.log(`   Errors:`, data.errors);
  console.log(`   Results: ${data.results || 0}`);
  console.log(`   Players found: ${data.response?.length || 0}`);
  
  if (data.response && data.response.length > 0) {
    console.log(`\n✅ Sample player:`, data.response[0]);
  }
}

async function main() {
  console.log('🧪 Testing API-Basketball roster endpoint\n');
  console.log('='.repeat(80));
  
  // Test JL Bourg - French Pro A team (should have data)
  await testTeam(530, 'JL Bourg', '2025-2026');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test Real Madrid - EuroLeague team (definitely should have data)
  await testTeam(1326, 'Real Madrid', '2025-2026');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test with single year format
  await testTeam(530, 'JL Bourg', '2025');
  
  console.log('\n' + '='.repeat(80));
}

main().catch(console.error);





