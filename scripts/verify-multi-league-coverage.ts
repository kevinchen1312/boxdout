// Verify that teams playing in multiple leagues have games from all leagues

import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Teams that should play in multiple leagues
const EXPECTED_MULTI_LEAGUE_TEAMS = {
  'Besiktas': [104, 194], // BSL + EuroCup
  'Real Madrid': [119, 120], // Liga ACB + EuroLeague (update IDs as needed)
  'Barcelona': [119, 120], // Liga ACB + EuroLeague
  'Partizan': [198, 120], // ABA League + EuroLeague
};

async function verifyMultiLeagueCoverage() {
  console.log('🔍 Verifying Multi-League Team Coverage\n');
  console.log('='.repeat(80));

  for (const [teamName, expectedLeagues] of Object.entries(EXPECTED_MULTI_LEAGUE_TEAMS)) {
    console.log(`\n📊 ${teamName}`);
    console.log(`   Expected leagues: ${expectedLeagues.join(', ')}`);

    // Find team in database
    const { data: teams, error: teamError } = await supabase
      .from('international_teams')
      .select('id, api_team_id, name, league_id, league_name')
      .ilike('name', teamName);

    if (teamError || !teams || teams.length === 0) {
      console.log(`   ❌ Team not found in database`);
      continue;
    }

    const team = teams[0];
    console.log(`   Primary league: ${team.league_id} (${team.league_name})`);

    // Check games in database
    const { data: schedules, error: scheduleError } = await supabase
      .from('international_team_schedules')
      .select('league_id')
      .eq('team_id', team.id);

    if (scheduleError) {
      console.log(`   ❌ Error fetching schedules: ${scheduleError.message}`);
      continue;
    }

    if (!schedules || schedules.length === 0) {
      console.log(`   ❌ No games found in database`);
      continue;
    }

    // Count games by league
    const gamesByLeague = schedules.reduce((acc, s) => {
      acc[s.league_id] = (acc[s.league_id] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    console.log(`   Games in database:`);
    for (const [leagueId, count] of Object.entries(gamesByLeague)) {
      const expected = expectedLeagues.includes(Number(leagueId));
      const status = expected ? '✅' : '⚠️';
      console.log(`     ${status} League ${leagueId}: ${count} games`);
    }

    // Check if all expected leagues are present
    const missingLeagues = expectedLeagues.filter(
      leagueId => !gamesByLeague[leagueId]
    );

    if (missingLeagues.length > 0) {
      console.log(`   ❌ MISSING leagues: ${missingLeagues.join(', ')}`);
    } else {
      console.log(`   ✅ All expected leagues present`);
    }
  }

  console.log('\n' + '='.repeat(80));
}

verifyMultiLeagueCoverage().catch(error => {
  console.error('Verification failed:', error);
  process.exit(1);
});





