// Test script to check what data is available from API-Basketball
const API_KEY = '137753bdbbaae2a23471e3aad86e92c73';
const BASE_URL = 'https://api-basketball.p.rapidapi.com';

const headers = {
  'X-RapidAPI-Key': API_KEY,
  'X-RapidAPI-Host': 'api-basketball.p.rapidapi.com'
};

async function testEndpoint(name, url) {
  try {
    console.log(`\n=== Testing: ${name} ===`);
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    if (data.results === 0 || (Array.isArray(data.response) && data.response.length === 0)) {
      console.log(`❌ No data returned`);
      return null;
    }
    
    console.log(`✅ Success! Results: ${data.results || data.response?.length || 'N/A'}`);
    console.log(`Sample data:`, JSON.stringify(data, null, 2).substring(0, 500));
    return data;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('Testing API-Basketball endpoints with your API key...\n');
  
  // Test 1: Search for teams we care about
  await testEndpoint(
    'Search Valencia Basket',
    `${BASE_URL}/teams?search=Valencia`
  );
  
  await testEndpoint(
    'Search ASVEL',
    `${BASE_URL}/teams?search=ASVEL`
  );
  
  await testEndpoint(
    'Search Joventut',
    `${BASE_URL}/teams?search=Joventut`
  );
  
  // Test 2: Get leagues
  await testEndpoint(
    'Get EuroLeague',
    `${BASE_URL}/leagues?name=Euroleague`
  );
  
  await testEndpoint(
    'Get ACB League',
    `${BASE_URL}/leagues?name=ACB`
  );
  
  await testEndpoint(
    'Get LNB',
    `${BASE_URL}/leagues?name=LNB`
  );
  
  // Test 3: Get games/fixtures (most important)
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  await testEndpoint(
    'Get games today',
    `${BASE_URL}/games?date=${today}`
  );
  
  await testEndpoint(
    'Get games this week',
    `${BASE_URL}/games?date=${today}&date=${nextWeek}`
  );
  
  // Test 4: Get team fixtures/schedules
  await testEndpoint(
    'Valencia fixtures (by team ID 2341)',
    `${BASE_URL}/games?team=2341&season=2024`
  );
  
  await testEndpoint(
    'Valencia fixtures (season 2025)',
    `${BASE_URL}/games?team=2341&season=2025`
  );
  
  await testEndpoint(
    'ASVEL fixtures (by team ID 26)',
    `${BASE_URL}/games?team=26&season=2024`
  );
  
  await testEndpoint(
    'ASVEL fixtures (season 2025)',
    `${BASE_URL}/games?team=26&season=2025`
  );
  
  // Test 5: League fixtures
  await testEndpoint(
    'EuroLeague fixtures',
    `${BASE_URL}/games?league=120&season=2024`
  );
  
  await testEndpoint(
    'ACB fixtures',
    `${BASE_URL}/games?league=117&season=2024`
  );
  
  // Test 6: Date range queries
  await testEndpoint(
    'Games Nov 19-26, 2025',
    `${BASE_URL}/games?date=2025-11-19&date=2025-11-26`
  );
  
  // Test 7: Standings (to verify league IDs)
  await testEndpoint(
    'EuroLeague standings',
    `${BASE_URL}/standings?league=120&season=2024`
  );
  
  await testEndpoint(
    'ACB standings',
    `${BASE_URL}/standings?league=117&season=2024`
  );
  
  console.log('\n\n=== Summary ===');
  console.log('Check the results above to see what data is actually available.');
}

main().catch(console.error);





