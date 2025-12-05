/**
 * Scan ALL international basketball leagues and build player-to-team mappings
 * 
 * This script:
 * 1. Gets all leagues from API Basketball
 * 2. Filters for international men's basketball leagues
 * 3. For each league, gets all teams
 * 4. For each team, gets the roster
 * 5. Stores player-team mappings in database
 * 
 * Run: node scripts/scan-international-rosters.js
 * 
 * Note: This may take several hours due to rate limiting (7,500 requests/day)
 */

// Import Supabase for database operations
import { createClient } from '@supabase/supabase-js';

const API_KEY = process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdbaae2a23471e3aad86e92c73';
const BASE_URL = 'https://v1.basketball.api-sports.io';
const SEASON = 2025;
const DELAY_MS = 2000; // 2 seconds between requests

const headers = {
  'x-apisports-key': API_KEY,
};

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Leagues to exclude (US college, NBA, women's leagues, etc.)
const EXCLUDED_LEAGUE_NAMES = [
  'ncaa',
  'nba',
  'wnba',
  'g league',
  'g-league',
  'gleague',
  'development league',
  'women',
  'femenina',
  'feminine',
  'damen',
  'female',
];

// Stats tracking
const stats = {
  totalRequests: 0,
  leaguesProcessed: 0,
  teamsProcessed: 0,
  playersFound: 0,
  errors: 0,
  startTime: null,
};

/**
 * Make a request to API Basketball with rate limiting
 */
async function makeRequest(url, description) {
  stats.totalRequests++;
  
  try {
    console.log(`\n[${stats.totalRequests}] ${description}`);
    console.log(`  URL: ${url}`);
    
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    console.log(`  Status: ${response.status}, Results: ${data.response?.length || 0}`);
    
    if (response.status !== 200) {
      console.log(`  ⚠️  Error: ${data.message || 'Unknown error'}`);
      stats.errors++;
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`  ❌ Exception: ${error.message}`);
    stats.errors++;
    return null;
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if league should be excluded
 */
function shouldExcludeLeague(leagueName) {
  const lowerName = leagueName.toLowerCase();
  return EXCLUDED_LEAGUE_NAMES.some(excluded => lowerName.includes(excluded));
}

/**
 * Get all leagues
 */
async function getAllLeagues() {
  console.log('\n' + '='.repeat(70));
  console.log('STEP 1: Getting All Leagues');
  console.log('='.repeat(70));
  
  const data = await makeRequest(
    `${BASE_URL}/leagues`,
    'Fetching all leagues'
  );
  
  if (!data || !data.response) {
    console.log('❌ Failed to get leagues');
    return [];
  }
  
  const allLeagues = data.response;
  console.log(`\n📊 Total leagues found: ${allLeagues.length}`);
  
  // Filter for international men's leagues
  const internationalLeagues = allLeagues.filter(league => {
    // Exclude US collegiate and women's leagues
    if (shouldExcludeLeague(league.name)) {
      return false;
    }
    
    // Include all other leagues (international men's basketball)
    return true;
  });
  
  console.log(`✅ International men's leagues: ${internationalLeagues.length}`);
  console.log(`   (Excluded ${allLeagues.length - internationalLeagues.length} US college/women's leagues)`);
  
  return internationalLeagues;
}

/**
 * Get all teams for a league
 */
async function getLeagueTeams(leagueId, leagueName) {
  await sleep(DELAY_MS);
  
  const data = await makeRequest(
    `${BASE_URL}/teams?league=${leagueId}&season=${SEASON}`,
    `Getting teams for ${leagueName} (ID: ${leagueId})`
  );
  
  if (!data || !data.response) {
    return [];
  }
  
  return data.response;
}

/**
 * Get roster for a team
 */
async function getTeamRoster(teamId, teamName, leagueId, leagueName) {
  await sleep(DELAY_MS);
  
  const data = await makeRequest(
    `${BASE_URL}/players?team=${teamId}&season=${SEASON}`,
    `Getting roster for ${teamName} (ID: ${teamId})`
  );
  
  if (!data || !data.response) {
    return [];
  }
  
  // Map to our format
  return data.response.map(player => ({
    player_id: player.id,
    player_name: player.name || `Player ${player.id}`,
    team_id: teamId,
    team_name: teamName,
    league_id: leagueId,
    league_name: leagueName,
    season: SEASON,
    position: player.position || null,
    jersey_number: player.number || null,
    country: player.country || null,
    age: player.age || null,
  }));
}

/**
 * Save mappings to database (batch)
 */
async function saveMappingsBatch(mappings) {
  if (mappings.length === 0) {
    return;
  }
  
  try {
    const { error } = await supabase
      .from('player_team_mappings')
      .upsert(
        mappings.map(m => ({
          player_id: m.player_id,
          player_name: m.player_name,
          team_id: m.team_id,
          team_name: m.team_name,
          league_id: m.league_id,
          league_name: m.league_name,
          season: m.season,
          position: m.position,
          jersey_number: m.jersey_number,
          country: m.country,
          age: m.age,
        })),
        {
          onConflict: 'player_id,season',
          ignoreDuplicates: false, // Update existing records
        }
      );

    if (error) {
      console.error(`  ❌ Failed to save mappings to database:`, error.message);
      stats.errors++;
    } else {
      console.log(`  ✅ Saved ${mappings.length} player mappings to database`);
      stats.playersFound += mappings.length;
    }
  } catch (error) {
    console.error(`  ❌ Exception saving mappings: ${error.message}`);
    stats.errors++;
  }
}

/**
 * Print progress stats
 */
function printStats() {
  const elapsed = (Date.now() - stats.startTime) / 1000 / 60;
  const requestsPerMin = stats.totalRequests / elapsed;
  const estimatedRemaining = (7500 - stats.totalRequests) / requestsPerMin;
  
  console.log('\n' + '='.repeat(70));
  console.log('PROGRESS STATS');
  console.log('='.repeat(70));
  console.log(`Time elapsed: ${elapsed.toFixed(1)} minutes`);
  console.log(`Total requests: ${stats.totalRequests}`);
  console.log(`Request rate: ${requestsPerMin.toFixed(1)} requests/min`);
  console.log(`Leagues processed: ${stats.leaguesProcessed}`);
  console.log(`Teams processed: ${stats.teamsProcessed}`);
  console.log(`Players found: ${stats.playersFound}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Estimated time remaining: ${estimatedRemaining.toFixed(0)} minutes`);
  console.log('='.repeat(70));
}

/**
 * Main scanning function
 */
async function main() {
  console.log('🏀 International Basketball Roster Scanner');
  console.log('='  .repeat(70));
  console.log(`Season: ${SEASON}`);
  console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
  console.log(`Rate Limit: 7,500 requests/day (2 second delays)`);
  console.log('='  .repeat(70));
  
  stats.startTime = Date.now();
  
  // Step 1: Get all international leagues
  const leagues = await getAllLeagues();
  
  if (leagues.length === 0) {
    console.log('\n❌ No leagues found. Exiting.');
    return;
  }
  
  await sleep(DELAY_MS);
  
  // Step 2 & 3: For each league, get teams and rosters
  console.log('\n' + '='.repeat(70));
  console.log('STEP 2 & 3: Processing Leagues and Teams');
  console.log('='.repeat(70));
  console.log(`\nWill process ${leagues.length} leagues...`);
  console.log(`(This may take several hours)\n`);
  
  let allMappings = [];
  const BATCH_SIZE = 50; // Save to DB every 50 players
  
  for (let i = 0; i < leagues.length; i++) {
    const league = leagues[i];
    stats.leaguesProcessed++;
    
    console.log(`\n[${ stats.leaguesProcessed}/${leagues.length}] Processing: ${league.name} (ID: ${league.id})`);
    
    // Get teams for this league
    const teams = await getLeagueTeams(league.id, league.name);
    
    if (teams.length === 0) {
      console.log(`  ⚠️  No teams found for this league`);
      continue;
    }
    
    console.log(`  Found ${teams.length} teams`);
    
    // Get roster for each team
    for (let j = 0; j < teams.length; j++) {
      const team = teams[j];
      stats.teamsProcessed++;
      
      const roster = await getTeamRoster(team.id, team.name, league.id, league.name);
      
      if (roster.length > 0) {
        console.log(`  ✅ ${team.name}: ${roster.length} players`);
        allMappings.push(...roster);
        
        // Save in batches
        if (allMappings.length >= BATCH_SIZE) {
          await saveMappingsBatch(allMappings);
          allMappings = [];
        }
      } else {
        console.log(`  ⚠️  ${team.name}: No roster data`);
      }
      
      // Print stats every 20 teams
      if (stats.teamsProcessed % 20 === 0) {
        printStats();
      }
    }
  }
  
  // Save remaining mappings
  if (allMappings.length > 0) {
    await saveMappingsBatch(allMappings);
  }
  
  // Final stats
  console.log('\n' + '='.repeat(70));
  console.log('SCAN COMPLETE!');
  console.log('='.repeat(70));
  printStats();
  
  console.log('\n✅ Player-to-team mappings have been built!');
  console.log(`   Total players mapped: ${stats.playersFound}`);
  console.log(`   Across ${stats.teamsProcessed} teams`);
  console.log(`   In ${stats.leaguesProcessed} leagues`);
  
  // Get final stats from database
  try {
    const { count: playersCount } = await supabase
      .from('player_team_mappings')
      .select('player_id', { count: 'exact', head: true })
      .eq('season', SEASON);
    
    const { count: teamsCount } = await supabase
      .from('player_team_mappings')
      .select('team_id', { count: 'exact', head: true })
      .eq('season', SEASON);
    
    const { count: leaguesCount } = await supabase
      .from('player_team_mappings')
      .select('league_id', { count: 'exact', head: true })
      .eq('season', SEASON)
      .not('league_id', 'is', null);
    
    console.log('\n📊 Database Stats:');
    console.log(`   Unique players: ${playersCount || 0}`);
    console.log(`   Unique teams: ${teamsCount || 0}`);
    console.log(`   Unique leagues: ${leaguesCount || 0}`);
  } catch (error) {
    console.log('\n⚠️  Could not fetch database stats:', error.message);
  }
}

// Run the scanner
main().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  console.error(error.stack);
  process.exit(1);
});

