// Final test - wait longer and test key endpoints
const API_KEY = '137753bdbaae2a23471e3aad86e92c73';
const BASE_URL = 'https://api-basketball.p.rapidapi.com';

const headers = {
  'X-RapidAPI-Key': API_KEY,
  'X-RapidAPI-Host': 'api-basketball.p.rapidapi.com'
};

async function testEndpoint(name, url) {
  try {
    const response = await fetch(url, { headers });
    const status = response.status;
    const data = await response.json();
    
    if (status === 200) {
      console.log(`✅ ${name}: SUCCESS`);
      console.log(`   Results: ${data.results || data.response?.length || 'N/A'}`);
      if (data.response && data.response.length > 0) {
        const first = data.response[0];
        console.log(`   Sample: ${first.date || first.id || JSON.stringify(first).substring(0, 100)}`);
      }
      return { success: true, data };
    } else {
      console.log(`❌ ${name}: ${status} - ${data.message || 'Error'}`);
      return { success: false, status, message: data.message };
    }
  } catch (error) {
    console.log(`❌ ${name}: Exception - ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('Testing API-Basketball PRO Plan...\n');
  console.log('If subscription just activated, wait 10-15 minutes for propagation.\n');
  
  const today = new Date().toISOString().split('T')[0];
  
  const tests = [
    ['Games today', `${BASE_URL}/games?date=${today}`],
    ['Search teams (Valencia)', `${BASE_URL}/teams?search=Valencia`],
    ['Get leagues', `${BASE_URL}/leagues?name=Euroleague`],
    ['Team fixtures (Valencia)', `${BASE_URL}/games?team=2341&season=2024`],
    ['League fixtures (EuroLeague)', `${BASE_URL}/games?league=120&season=2024`],
  ];
  
  const results = [];
  for (const [name, url] of tests) {
    const result = await testEndpoint(name, url);
    results.push({ name, ...result });
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
  }
  
  console.log('\n\n=== RESULTS SUMMARY ===');
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  if (successful.length > 0) {
    console.log(`\n✅ ${successful.length} endpoint(s) working:`);
    successful.forEach(r => console.log(`   - ${r.name}`));
  }
  
  if (failed.length > 0) {
    console.log(`\n❌ ${failed.length} endpoint(s) failed:`);
    failed.forEach(r => {
      const reason = r.message || r.error || 'Unknown';
      console.log(`   - ${r.name}: ${reason}`);
    });
  }
  
  if (successful.length === 0) {
    console.log('\n⚠️ No endpoints working yet. This could mean:');
    console.log('1. Subscription needs more time to activate (10-15 min)');
    console.log('2. Check RapidAPI dashboard - is subscription showing as "Active"?');
    console.log('3. Try resetting API key in dashboard and use new key');
    console.log('4. Contact RapidAPI support if still not working after 15 minutes');
  } else {
    console.log('\n✅ API is working! We can proceed with integration.');
  }
}

main().catch(console.error);






