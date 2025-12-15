// Test with Pro plan - try different endpoint formats
const API_KEY = '137753bdbaae2a23471e3aad86e92c73';
const BASE_URL = 'https://api-basketball.p.rapidapi.com';

const headers = {
  'X-RapidAPI-Key': API_KEY,
  'X-RapidAPI-Host': 'api-basketball.p.rapidapi.com'
};

async function testEndpoint(name, url, method = 'GET') {
  try {
    console.log(`\n=== ${name} ===`);
    console.log(`URL: ${url}`);
    
    const options = { 
      method,
      headers 
    };
    
    const response = await fetch(url, options);
    const status = response.status;
    const statusText = response.statusText;
    
    console.log(`Status: ${status} ${statusText}`);
    
    // Check all response headers
    console.log(`Response headers:`);
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase().includes('rate') || key.toLowerCase().includes('limit') || key.toLowerCase().includes('remaining')) {
        console.log(`  ${key}: ${value}`);
      }
    }
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.log(`Response (not JSON): ${text.substring(0, 200)}`);
      return { success: false, reason: 'Not JSON response' };
    }
    
    if (status === 200) {
      console.log(`✅ SUCCESS!`);
      console.log(`Results: ${data.results || data.response?.length || 'N/A'}`);
      
      if (data.response && data.response.length > 0) {
        console.log(`\nFirst result (preview):`);
        const first = data.response[0];
        console.log(JSON.stringify({
          id: first.id,
          date: first.date,
          time: first.time,
          teams: first.teams,
          league: first.league,
          country: first.country
        }, null, 2));
      }
      return { success: true, data };
    } else {
      console.log(`❌ Error: ${JSON.stringify(data, null, 2)}`);
      return { success: false, reason: data.message || statusText, data };
    }
  } catch (error) {
    console.log(`❌ Exception: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

async function main() {
  console.log('Testing API-Basketball PRO PLAN endpoints...\n');
  
  const today = new Date().toISOString().split('T')[0];
  
  // Test 1: Basic games endpoint
  let result = await testEndpoint(
    '1. Games today (basic)',
    `${BASE_URL}/games?date=${today}`
  );
  
  if (!result.success) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Try with timezone
    result = await testEndpoint(
      '2. Games today (with timezone)',
      `${BASE_URL}/games?date=${today}&timezone=America/New_York`
    );
  }
  
  if (!result.success) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 3: Try fixtures endpoint instead
    result = await testEndpoint(
      '3. Fixtures endpoint',
      `${BASE_URL}/fixtures?date=${today}`
    );
  }
  
  if (!result.success) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 4: Try teams endpoint
    result = await testEndpoint(
      '4. Search teams',
      `${BASE_URL}/teams?search=Valencia`
    );
  }
  
  if (!result.success) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 5: Try leagues endpoint
    result = await testEndpoint(
      '5. Get leagues',
      `${BASE_URL}/leagues?name=Euroleague`
    );
  }
  
  if (result.success) {
    console.log('\n\n✅ API IS WORKING! Found working endpoint.');
    console.log('\nNow testing schedule-specific endpoints...\n');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test team fixtures
    await testEndpoint(
      'Team fixtures (Valencia, team 2341)',
      `${BASE_URL}/games?team=2341&season=2024`
    );
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test league fixtures
    await testEndpoint(
      'League fixtures (EuroLeague, league 120)',
      `${BASE_URL}/games?league=120&season=2024`
    );
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test date range
    await testEndpoint(
      'Date range (Nov 19-26, 2025)',
      `${BASE_URL}/games?date=2025-11-19&date=2025-11-26`
    );
  } else {
    console.log('\n\n❌ Still getting errors. Possible issues:');
    console.log('1. Subscription might need a few more minutes to activate');
    console.log('2. API key might need to be reset in dashboard');
    console.log('3. Check if Pro plan includes these endpoints');
    console.log('\nCheck your RapidAPI dashboard:');
    console.log('- Is the subscription showing as "Active"?');
    console.log('- Are there any usage limits or restrictions?');
    console.log('- Try resetting the API key and use the new one');
  }
}

main().catch(console.error);






