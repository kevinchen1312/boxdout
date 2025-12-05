// Debug script to check why international games aren't showing
// Run: node debug-api-basketball.js

// API-Sports (not RapidAPI) - try different endpoint formats
const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdbaae2a23471e3aad86e92c73';

// Try different possible endpoint formats
// FAQ says URLs differ between RapidAPI and Dashboard - try both
const POSSIBLE_ENDPOINTS = [
  'https://api-basketball.p.rapidapi.com', // RapidAPI format
  'https://v1.api-sport.io/basketball',    // API-Sports format
  'https://api.api-sport.io/basketball',   // Alternative API-Sports format
];

let BASE_URL = POSSIBLE_ENDPOINTS[0]; // Default to first one

// Try both header formats
const getHeaders = (endpoint) => {
  if (endpoint.includes('rapidapi.com')) {
    return {
      'X-RapidAPI-Key': API_KEY,
      'X-RapidAPI-Host': 'api-basketball.p.rapidapi.com',
    };
  } else {
    return {
      'X-API-Key': API_KEY,
    };
  }
};

async function testEndpoint(baseUrl) {
  try {
    console.log(`\n   Testing endpoint: ${baseUrl}`);
    const testUrl = `${baseUrl}/teams?search=Valencia`;
    const testHeaders = getHeaders(baseUrl);
    const testResponse = await fetch(testUrl, { headers: testHeaders });
    const testText = await testResponse.text();
    
    if (testResponse.ok) {
      console.log(`   ✅ Endpoint works! Status: ${testResponse.status}`);
      return true;
    } else {
      console.log(`   ❌ Status: ${testResponse.status}, Response: ${testText.substring(0, 200)}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function checkTodayGames() {
  console.log('\n🔍 Testing API endpoints...\n');
  
  // Test each possible endpoint
  for (const endpoint of POSSIBLE_ENDPOINTS) {
    const works = await testEndpoint(endpoint);
    if (works) {
      BASE_URL = endpoint;
      console.log(`\n✅ Using endpoint: ${BASE_URL}`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n🔍 Checking games for TODAY (Nov 19, 2025)...\n');
  
  const today = '2025-11-19';
  
  try {
    // Check Joventut Badalona games
    console.log('1. Checking Joventut Badalona (team ID: 2334)...');
    const joventutUrl = `${BASE_URL}/games?team=2334&date=${today}`;
    const joventutHeaders = getHeaders(BASE_URL);
    const joventutResponse = await fetch(joventutUrl, { headers: joventutHeaders });
    
    if (joventutResponse.ok) {
      const joventutData = await joventutResponse.json();
      console.log(`   Status: ${joventutResponse.status}`);
      console.log(`   Results: ${joventutData.results || joventutData.response?.length || 0}`);
      
      if (joventutData.response && joventutData.response.length > 0) {
        console.log(`   ✅ Found ${joventutData.response.length} games:`);
        joventutData.response.forEach((game, i) => {
          console.log(`   Game ${i + 1}:`);
          console.log(`     Date: ${game.date}`);
          console.log(`     Time: ${game.time}`);
          console.log(`     Home: ${game.teams?.home?.name}`);
          console.log(`     Away: ${game.teams?.away?.name}`);
          console.log(`     League: ${game.league?.name}`);
          console.log(`     Status: ${game.status?.long}`);
        });
      } else {
        console.log(`   ❌ No games found for today`);
        
        // Try without date filter to see all games
        console.log('\n   Checking all games for Joventut (no date filter)...');
        const allGamesUrl = `${BASE_URL}/games?team=2334&season=2025`;
        const allGamesResponse = await fetch(allGamesUrl, { headers });
        if (allGamesResponse.ok) {
          const allGamesData = await allGamesResponse.json();
          console.log(`   Found ${allGamesData.response?.length || 0} total games`);
          if (allGamesData.response && allGamesData.response.length > 0) {
            const upcoming = allGamesData.response.filter(g => {
              const gameDate = new Date(g.date);
              return gameDate >= new Date('2025-11-19');
            }).slice(0, 5);
            console.log(`   Next 5 upcoming games:`);
            upcoming.forEach(g => {
              console.log(`     ${g.date} ${g.time} - ${g.teams?.home?.name} vs ${g.teams?.away?.name}`);
            });
          }
        }
      }
    } else {
      const errorText = await joventutResponse.text().catch(() => 'Could not read error');
      console.log(`   ❌ Error: ${joventutResponse.status} ${joventutResponse.statusText}`);
      console.log(`   Error Details: ${errorText.substring(0, 300)}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check ASVEL games
    console.log('\n2. Checking ASVEL (team ID: 26)...');
    const asvelUrl = `${BASE_URL}/games?team=26&date=${today}`;
    const asvelResponse = await fetch(asvelUrl, { headers });
    
    if (asvelResponse.ok) {
      const asvelData = await asvelResponse.json();
      console.log(`   Status: ${asvelResponse.status}`);
      console.log(`   Results: ${asvelData.results || asvelData.response?.length || 0}`);
      
      if (asvelData.response && asvelData.response.length > 0) {
        console.log(`   ✅ Found ${asvelData.response.length} games:`);
        asvelData.response.forEach((game, i) => {
          console.log(`   Game ${i + 1}:`);
          console.log(`     Date: ${game.date}`);
          console.log(`     Time: ${game.time}`);
          console.log(`     Home: ${game.teams?.home?.name}`);
          console.log(`     Away: ${game.teams?.away?.name}`);
          console.log(`     League: ${game.league?.name}`);
          console.log(`     Status: ${game.status?.long}`);
        });
      } else {
        console.log(`   ❌ No games found for today`);
        
        // Try without date filter
        console.log('\n   Checking all games for ASVEL (no date filter)...');
        const allGamesUrl = `${BASE_URL}/games?team=26&season=2025`;
        const allGamesResponse = await fetch(allGamesUrl, { headers });
        if (allGamesResponse.ok) {
          const allGamesData = await allGamesResponse.json();
          console.log(`   Found ${allGamesData.response?.length || 0} total games`);
          if (allGamesData.response && allGamesData.response.length > 0) {
            const upcoming = allGamesData.response.filter(g => {
              const gameDate = new Date(g.date);
              return gameDate >= new Date('2025-11-19');
            }).slice(0, 5);
            console.log(`   Next 5 upcoming games:`);
            upcoming.forEach(g => {
              console.log(`     ${g.date} ${g.time} - ${g.teams?.home?.name} vs ${g.teams?.away?.name}`);
            });
          }
        }
      }
    } else {
      console.log(`   ❌ Error: ${asvelResponse.status} ${asvelResponse.statusText}`);
    }
    
    // Check all games for today
    console.log('\n3. Checking ALL games for today (Nov 19, 2025)...');
    const allTodayUrl = `${BASE_URL}/games?date=${today}`;
    const allTodayResponse = await fetch(allTodayUrl, { headers });
    
    if (allTodayResponse.ok) {
      const allTodayData = await allTodayResponse.json();
      console.log(`   Status: ${allTodayResponse.status}`);
      console.log(`   Total games today: ${allTodayData.results || allTodayData.response?.length || 0}`);
      
      if (allTodayData.response && allTodayData.response.length > 0) {
        // Filter for EuroLeague/ACB games
        const euroGames = allTodayData.response.filter(g => 
          g.league?.id === 120 || g.league?.id === 117
        );
        console.log(`   EuroLeague/ACB games: ${euroGames.length}`);
        
        euroGames.forEach((game, i) => {
          console.log(`   Game ${i + 1}:`);
          console.log(`     ${game.teams?.home?.name} vs ${game.teams?.away?.name}`);
          console.log(`     Time: ${game.time}`);
          console.log(`     League: ${game.league?.name}`);
        });
      }
    } else {
      console.log(`   ❌ Error: ${allTodayResponse.status} ${allTodayResponse.statusText}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function checkEnvironmentVariable() {
  console.log('\n🔍 Checking environment variable...\n');
  console.log(`API_SPORTS_BASKETBALL_KEY: ${process.env.API_SPORTS_BASKETBALL_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`RAPIDAPI_BASKETBALL_KEY: ${process.env.RAPIDAPI_BASKETBALL_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`Using API key: ${API_KEY.substring(0, 8)}...`);
  console.log(`Using endpoint: ${BASE_URL}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('API-BASKETBALL DEBUG SCRIPT');
  console.log('='.repeat(60));
  
  await checkEnvironmentVariable();
  await checkTodayGames();
  
  console.log('\n' + '='.repeat(60));
  console.log('TROUBLESHOOTING TIPS:');
  console.log('='.repeat(60));
  console.log('1. If no games found for today, the games might have already been played');
  console.log('2. Make sure to RESTART your Next.js dev server after adding .env.local');
  console.log('3. Check the server logs for "[API-Basketball]" messages');
  console.log('4. Verify team names match exactly in your prospect data');
}

main().catch(console.error);

