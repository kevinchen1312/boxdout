// Test single endpoint with delay
const API_KEY = '137753bdbbaae2a23471e3aad86e92c73';
const BASE_URL = 'https://api-basketball.p.rapidapi.com';

const headers = {
  'X-RapidAPI-Key': API_KEY,
  'X-RapidAPI-Host': 'api-basketball.p.rapidapi.com'
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testEndpoint(name, url) {
  try {
    console.log(`\n=== Testing: ${name} ===`);
    console.log(`URL: ${url}`);
    const response = await fetch(url, { headers });
    const status = response.status;
    const data = await response.json();
    
    console.log(`Status: ${status}`);
    
    if (data.message) {
      console.log(`Message: ${data.message}`);
      if (data.message.includes('not subscribed')) {
        console.log(`❌ Subscription issue - this endpoint may require a paid plan`);
      } else if (data.message.includes('Too many requests')) {
        console.log(`❌ Rate limit - need to wait`);
      }
      return null;
    }
    
    if (data.results === 0 || (Array.isArray(data.response) && data.response.length === 0)) {
      console.log(`⚠️ No data returned (results: ${data.results || 0})`);
      return null;
    }
    
    console.log(`✅ Success! Results: ${data.results || data.response?.length || 'N/A'}`);
    
    // Show first item if available
    if (data.response && data.response.length > 0) {
      console.log(`\nFirst result:`);
      console.log(JSON.stringify(data.response[0], null, 2).substring(0, 1000));
    } else if (data.results > 0) {
      console.log(`\nSample data structure:`);
      console.log(JSON.stringify(data, null, 2).substring(0, 1000));
    }
    
    return data;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('Testing API-Basketball endpoints (one at a time)...\n');
  
  // Test 1: Basic endpoint - get today's games
  const today = new Date().toISOString().split('T')[0];
  await testEndpoint(
    'Get games today (most basic test)',
    `${BASE_URL}/games?date=${today}`
  );
  
  await delay(2000); // Wait 2 seconds
  
  // Test 2: Search for a team
  await testEndpoint(
    'Search for Valencia Basket',
    `${BASE_URL}/teams?search=Valencia`
  );
  
  await delay(2000);
  
  // Test 3: Get team fixtures (if we have team ID)
  await testEndpoint(
    'Valencia fixtures (team ID 2341, season 2024)',
    `${BASE_URL}/games?team=2341&season=2024`
  );
  
  await delay(2000);
  
  // Test 4: Try season 2025
  await testEndpoint(
    'Valencia fixtures (season 2025)',
    `${BASE_URL}/games?team=2341&season=2025`
  );
  
  await delay(2000);
  
  // Test 5: League fixtures
  await testEndpoint(
    'EuroLeague fixtures (league 120, season 2024)',
    `${BASE_URL}/games?league=120&season=2024`
  );
  
  await delay(2000);
  
  // Test 6: Date range
  await testEndpoint(
    'Games Nov 19-20, 2025',
    `${BASE_URL}/games?date=2025-11-19&date=2025-11-20`
  );
  
  console.log('\n\n=== Summary ===');
  console.log('Check which endpoints returned actual data vs subscription/rate limit errors.');
}

main().catch(console.error);






