// Simple test with better error handling
const API_KEY = '137753bdbaae2a23471e3aad86e92c73'; // Pro plan
const BASE_URL = 'https://api-basketball.p.rapidapi.com';

const headers = {
  'X-RapidAPI-Key': API_KEY,
  'X-RapidAPI-Host': 'api-basketball.p.rapidapi.com'
};

async function testEndpoint(name, url) {
  try {
    console.log(`\n=== ${name} ===`);
    console.log(`URL: ${url}`);
    
    const response = await fetch(url, { headers });
    const status = response.status;
    const statusText = response.statusText;
    
    console.log(`Status: ${status} ${statusText}`);
    
    // Get response headers to see rate limits
    const rateLimitRemaining = response.headers.get('x-ratelimit-requests-remaining');
    const rateLimitReset = response.headers.get('x-ratelimit-requests-reset');
    
    if (rateLimitRemaining) {
      console.log(`Rate limit remaining: ${rateLimitRemaining}`);
    }
    
    const data = await response.json();
    
    if (status === 200) {
      console.log(`✅ SUCCESS!`);
      console.log(`Results: ${data.results || data.response?.length || 'N/A'}`);
      
      if (data.response && data.response.length > 0) {
        console.log(`\nFirst result:`);
        console.log(JSON.stringify(data.response[0], null, 2));
      } else if (data.results > 0) {
        console.log(`\nData structure:`);
        console.log(JSON.stringify(data, null, 2).substring(0, 1000));
      }
      return { success: true, data };
    } else if (status === 403) {
      console.log(`❌ 403 Forbidden`);
      console.log(`Message: ${data.message || JSON.stringify(data)}`);
      console.log(`\nThis usually means:`);
      console.log(`- Subscription not active yet (wait 5-10 minutes)`);
      console.log(`- Wrong API key`);
      console.log(`- Plan doesn't include this endpoint`);
      return { success: false, reason: '403 Forbidden' };
    } else if (status === 429) {
      console.log(`⚠️ Rate limited - wait ${rateLimitReset || 'a bit'} seconds`);
      return { success: false, reason: 'Rate limited' };
    } else {
      console.log(`❌ Error: ${JSON.stringify(data)}`);
      return { success: false, reason: data.message || statusText };
    }
  } catch (error) {
    console.log(`❌ Exception: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

async function main() {
  console.log('Testing API-Basketball with your subscription...\n');
  
  // Test the most basic endpoint first
  const today = new Date().toISOString().split('T')[0];
  const result = await testEndpoint(
    'Get games today (basic test)',
    `${BASE_URL}/games?date=${today}`
  );
  
  if (result.success) {
    console.log('\n✅ API is working! Let\'s test more endpoints...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test team search
    await testEndpoint(
      'Search for Valencia Basket',
      `${BASE_URL}/teams?search=Valencia`
    );
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test team fixtures
    await testEndpoint(
      'Valencia fixtures (team 2341, season 2024)',
      `${BASE_URL}/games?team=2341&season=2024`
    );
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test league fixtures
    await testEndpoint(
      'EuroLeague fixtures (league 120, season 2024)',
      `${BASE_URL}/games?league=120&season=2024`
    );
  } else {
    console.log('\n⚠️ API not working yet. Possible reasons:');
    console.log('1. Subscription needs a few minutes to activate');
    console.log('2. Check RapidAPI dashboard to confirm subscription status');
    console.log('3. Verify API key is correct');
  }
}

main().catch(console.error);

