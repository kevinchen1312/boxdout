// Script to discover league IDs from API-Basketball
// Searches for major European leagues and their season formats

const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;

if (!apiKey) {
  console.error('Missing API_BASKETBALL_KEY - set in .env.local');
  process.exit(1);
}

const BASE_URL = 'https://v1.basketball.api-sports.io';

interface LeagueInfo {
  id: number;
  name: string;
  type: string;
  country: string;
  seasons: any[];
}

async function searchLeague(searchTerm: string): Promise<LeagueInfo[]> {
  try {
    const url = `${BASE_URL}/leagues?search=${encodeURIComponent(searchTerm)}`;
    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey! },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.response || [];
  } catch (error) {
    console.error(`Error searching for "${searchTerm}":`, error);
    return [];
  }
}

async function getLeagueSeasons(leagueId: number): Promise<any[]> {
  try {
    const url = `${BASE_URL}/leagues?id=${leagueId}`;
    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey! },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const league = data.response?.[0];
    return league?.seasons || [];
  } catch (error) {
    console.error(`Error fetching seasons for league ${leagueId}:`, error);
    return [];
  }
}

async function discoverLeagues() {
  console.log('🔍 Discovering European Basketball Leagues\n');
  console.log('='.repeat(80));

  const leaguesToSearch = [
    'Bundesliga', // German BBL
    'Basketball Bundesliga',
    'Lega Basket', // Italian
    'Serie A', // Italian
    'Turkish Basketball', // Turkish BSL
    'Super Lig', // Turkish BSL
    'BSL',
    'Greek Basket', // Greek
    'HEBA',
    'A1',
    'VTB', // VTB United League
    'United League',
    'Copa del Rey', // Spanish cup
    'Coupe de France', // French cup
    'Eurocup',
    'FIBA Europe Cup',
    'Adriatic',
    'ABA',
  ];

  const foundLeagues = new Map<number, LeagueInfo>();

  for (const searchTerm of leaguesToSearch) {
    console.log(`\n🔎 Searching for: "${searchTerm}"`);
    const leagues = await searchLeague(searchTerm);
    
    if (leagues.length === 0) {
      console.log(`  ❌ No results`);
    } else {
      console.log(`  ✅ Found ${leagues.length} league(s):`);
      for (const league of leagues) {
        if (!foundLeagues.has(league.id)) {
          foundLeagues.set(league.id, league);
          console.log(`     - [${league.id}] ${league.name} (${league.country?.name || 'Unknown'})`);
        }
      }
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Get detailed info for each league
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 DETAILED LEAGUE INFORMATION\n');

  const leagueDetails: any[] = [];

  for (const [leagueId, league] of foundLeagues) {
    console.log(`\n🏀 ${league.name} (ID: ${leagueId})`);
    console.log(`   Country: ${league.country?.name || 'Unknown'}`);
    console.log(`   Type: ${league.type || 'Unknown'}`);
    
    // Get seasons
    const seasons = await getLeagueSeasons(leagueId);
    
    if (seasons.length > 0) {
      console.log(`   Seasons: ${seasons.length} available`);
      
      // Analyze season format from the most recent seasons
      const recentSeasons = seasons.slice(0, 3);
      const seasonFormats = recentSeasons.map((s: any) => s.season);
      console.log(`   Recent season formats: ${seasonFormats.join(', ')}`);
      
      // Determine if it uses YYYY or YYYY-YYYY format
      const usesRangeFormat = seasonFormats.some((s: string) => s.includes('-'));
      const seasonFormat = usesRangeFormat ? 'YYYY-YYYY' : 'YYYY';
      console.log(`   Detected format: ${seasonFormat}`);
      
      leagueDetails.push({
        id: leagueId,
        name: league.name,
        country: league.country?.name,
        type: league.type,
        seasonFormat,
        recentSeasons: seasonFormats,
      });
    } else {
      console.log(`   ⚠️  No seasons data available`);
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Generate code snippet for SUPPORTED_LEAGUES
  console.log('\n' + '='.repeat(80));
  console.log('\n📝 CODE SNIPPET FOR loadSchedulesFromApiBasketball.ts:\n');
  console.log('// Major European Basketball Leagues');
  console.log('const SUPPORTED_LEAGUES = [');
  console.log('  // Existing leagues');
  console.log('  { id: 120, name: \'Euroleague\', seasonFormat: \'YYYY\' },');
  console.log('  { id: 117, name: \'Liga ACB\', seasonFormat: \'YYYY-YYYY\' },');
  console.log('  { id: 2, name: \'LNB Pro A\', seasonFormat: \'YYYY-YYYY\' },');
  console.log('  { id: 119, name: \'Basketball Champions League\', seasonFormat: \'YYYY-YYYY\' },');
  console.log('  { id: 121, name: \'Eurocup\', seasonFormat: \'YYYY\' },');
  console.log('  { id: 198, name: \'ABA League\', seasonFormat: \'YYYY\' },');
  console.log('  // Newly discovered leagues');
  
  leagueDetails
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(league => {
      console.log(`  { id: ${league.id}, name: '${league.name}', seasonFormat: '${league.seasonFormat}' }, // ${league.country}`);
    });
  
  console.log('];');

  console.log('\n✅ Discovery complete!');
  console.log(`\n💡 Found ${foundLeagues.size} unique leagues`);
}

discoverLeagues().catch(error => {
  console.error('Discovery failed:', error);
  process.exit(1);
});





