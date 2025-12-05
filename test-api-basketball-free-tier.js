// Test endpoints that might be available on free tier
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
    console.log(`\n=== ${name} ===`);
    const response = await fetch(url, { headers });
    const status = response.status;
    const data = await response.json();
    
    console.log(`Status: ${status}`);
    
    if (data.message) {
      console.log(`Message: ${data.message}`);
      if (status === 403 && data.message.includes('not subscribed')) {
        console.log(`❌ REQUIRES PAID PLAN`);
      } else if (status === 429) {
        console.log(`⚠️ Rate limited - wait and retry`);
      }
      return { available: false, reason: data.message };
    }
    
    if (data.results === 0 || (Array.isArray(data.response) && data.response.length === 0)) {
      console.log(`⚠️ Returns empty data (results: ${data.results || 0})`);
      return { available: true, hasData: false };
    }
    
    console.log(`✅ AVAILABLE! Results: ${data.results || data.response?.length || 'N/A'}`);
    
    // Show sample
    if (data.response && data.response.length > 0) {
      const sample = data.response[0];
      console.log(`Sample:`, JSON.stringify(sample, null, 2).substring(0, 500));
    }
    
    return { available: true, hasData: true, data };
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { available: false, reason: error.message };
  }
}

async function main() {
  console.log('Testing API-Basketball FREE TIER endpoints...\n');
  console.log('Waiting 10 seconds to avoid rate limits...\n');
  await delay(10000);
  
  const results = {};
  
  // Test endpoints that might be free
  results.teams = await testEndpoint(
    '1. Search Teams (teams?search=Valencia)',
    `${BASE_URL}/teams?search=Valencia`
  );
  
  await delay(3000);
  
  results.leagues = await testEndpoint(
    '2. Get Leagues (leagues?name=Euroleague)',
    `${BASE_URL}/leagues?name=Euroleague`
  );
  
  await delay(3000);
  
  results.standings = await testEndpoint(
    '3. Get Standings (standings?league=120&season=2024)',
    `${BASE_URL}/standings?league=120&season=2024`
  );
  
  await delay(3000);
  
  results.games_today = await testEndpoint(
    '4. Get Games Today (games?date=2025-11-19)',
    `${BASE_URL}/games?date=2025-11-19`
  );
  
  await delay(3000);
  
  results.games_team = await testEndpoint(
    '5. Get Team Games (games?team=2341&season=2024)',
    `${BASE_URL}/games?team=2341&season=2024`
  );
  
  await delay(3000);
  
  results.games_league = await testEndpoint(
    '6. Get League Games (games?league=120&season=2024)',
    `${BASE_URL}/games?league=120&season=2024`
  );
  
  await delay(3000);
  
  results.games_daterange = await testEndpoint(
    '7. Get Games by Date Range (games?date=2025-11-19&date=2025-11-20)',
    `${BASE_URL}/games?date=2025-11-19&date=2025-11-20`
  );
  
  console.log('\n\n=== SUMMARY ===');
  console.log('\nWhat\'s AVAILABLE on your plan:');
  Object.entries(results).forEach(([key, result]) => {
    if (result.available && result.hasData) {
      console.log(`✅ ${key}: YES - Returns data`);
    } else if (result.available && !result.hasData) {
      console.log(`⚠️ ${key}: YES but returns empty`);
    } else {
      console.log(`❌ ${key}: NO - ${result.reason || 'Not available'}`);
    }
  });
  
  console.log('\n\n=== RECOMMENDATION ===');
  const hasGames = results.games_today?.available && results.games_today?.hasData ||
                   results.games_team?.available && results.games_team?.hasData ||
                   results.games_league?.available && results.games_league?.hasData;
  
  if (hasGames) {
    console.log('✅ You CAN get game schedules! We can integrate this.');
  } else {
    console.log('❌ Game schedules require a paid plan. Your free tier only gives:');
    if (results.teams?.available) console.log('  - Team search/info');
    if (results.leagues?.available) console.log('  - League info');
    if (results.standings?.available) console.log('  - Standings');
    console.log('\nRecommendation: Stick with text files or upgrade to paid plan.');
  }
}

main().catch(console.error);





