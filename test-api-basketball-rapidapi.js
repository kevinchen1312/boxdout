// Test using RapidAPI's endpoint format
const API_KEY = '137753bdbaae2a23471e3aad86e92c73';

// Try both possible endpoint formats
const ENDPOINTS = [
  {
    name: 'RapidAPI format (api-basketball.p.rapidapi.com)',
    base: 'https://api-basketball.p.rapidapi.com',
    host: 'api-basketball.p.rapidapi.com'
  },
  {
    name: 'Direct API format (v1.api-sports.io)',
    base: 'https://v1.api-sports.io',
    host: 'v1.api-sports.io'
  }
];

async function testEndpoint(config, path) {
  const headers = {
    'X-RapidAPI-Key': API_KEY,
    'X-RapidAPI-Host': config.host
  };
  
  const url = `${config.base}${path}`;
  
  try {
    console.log(`\nTesting: ${config.name}`);
    console.log(`URL: ${url}`);
    
    const response = await fetch(url, { headers });
    const status = response.status;
    
    if (status === 200) {
      const data = await response.json();
      console.log(`✅ SUCCESS! Status: ${status}`);
      console.log(`Results: ${data.results || data.response?.length || 'N/A'}`);
      
      if (data.response && data.response.length > 0) {
        console.log(`Sample game:`, JSON.stringify(data.response[0], null, 2).substring(0, 500));
      }
      return { success: true, config, data };
    } else {
      const data = await response.json().catch(() => ({ message: 'Unknown error' }));
      console.log(`❌ Status: ${status} - ${data.message || 'Error'}`);
      return { success: false, status, message: data.message };
    }
  } catch (error) {
    console.log(`❌ Exception: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('Testing API-Basketball with different endpoint formats...\n');
  console.log('Waiting 5 seconds to avoid rate limits...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const today = new Date().toISOString().split('T')[0];
  
  for (const config of ENDPOINTS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing ${config.name}`);
    console.log('='.repeat(60));
    
    // Test 1: Games today
    const result1 = await testEndpoint(config, `/games?date=${today}`);
    
    if (result1.success) {
      console.log(`\n✅ FOUND WORKING ENDPOINT: ${config.name}`);
      console.log(`Using base URL: ${config.base}`);
      
      // Test more endpoints
      await new Promise(resolve => setTimeout(resolve, 2000));
      await testEndpoint(config, '/teams?search=Valencia');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      await testEndpoint(config, '/games?team=2341&season=2024');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      await testEndpoint(config, '/games?league=120&season=2024');
      
      break; // Found working endpoint, stop testing
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait between configs
  }
  
  console.log('\n\n=== Summary ===');
  console.log('If no endpoint worked, the subscription may need more time to activate.');
  console.log('Wait 10-15 minutes and try again, or check RapidAPI dashboard.');
}

main().catch(console.error);






