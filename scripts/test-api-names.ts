// Test what name fields API-Basketball returns
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;

async function testApiNames() {
  console.log('🧪 Testing API-Basketball name formats...\n');
  
  // Test Fenerbahce (should have James Birsen)
  const fenerbahceResponse = await fetch(
    'https://v1.basketball.api-sports.io/players?team=1326&season=2025',
    { headers: { 'x-apisports-key': apiKey! } }
  );
  const fenerbahceData = await fenerbahceResponse.json();
  
  console.log('Fenerbahce sample players:');
  fenerbahceData.response.slice(0, 5).forEach((p: any) => {
    console.log(`  name: "${p.name}" | firstname: "${p.firstname}" | lastname: "${p.lastname}"`);
    const ourFormat = (p.firstname || p.lastname) 
      ? `${p.firstname || ''} ${p.lastname || ''}`.trim()
      : p.name;
    console.log(`  → We store as: "${ourFormat}"\n`);
  });
  
  // Test Real Madrid (should show reversed names)
  const realMadridResponse = await fetch(
    'https://v1.basketball.api-sports.io/players?team=1326&season=2025',
    { headers: { 'x-apisports-key': apiKey! } }
  );
  const realMadridData = await realMadridResponse.json();
  
  console.log('\nReal Madrid sample players:');
  realMadridData.response.slice(0, 5).forEach((p: any) => {
    console.log(`  name: "${p.name}" | firstname: "${p.firstname}" | lastname: "${p.lastname}"`);
    const ourFormat = (p.firstname || p.lastname) 
      ? `${p.firstname || ''} ${p.lastname || ''}`.trim()
      : p.name;
    console.log(`  → We store as: "${ourFormat}"\n`);
  });
}

testApiNames().catch(console.error);





