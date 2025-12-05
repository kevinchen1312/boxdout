import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkHoshikawa() {
  console.log('🔍 Checking Hoshikawa data...\n');

  // 1. Check if Hoshikawa is in prospects
  console.log('1️⃣ Checking prospects table:');
  const { data: prospects, error: prospectsError } = await supabase
    .from('prospects')
    .select('id, full_name, team_name, international_team_id, source')
    .ilike('full_name', '%hoshikawa%');

  if (prospectsError) {
    console.error('Error:', prospectsError);
    return;
  }

  if (!prospects || prospects.length === 0) {
    console.log('❌ Hoshikawa not found in prospects table');
    return;
  }

  console.log(`✅ Found ${prospects.length} prospect(s):`);
  prospects.forEach(p => {
    console.log(`  - ${p.full_name} (${p.team_name})`);
    console.log(`    Source: ${p.source}`);
    console.log(`    International Team ID: ${p.international_team_id || 'NULL'}`);
  });

  // 2. Check if Nagasaki is in international_teams
  console.log('\n2️⃣ Checking international_teams for Nagasaki:');
  const { data: teams, error: teamsError } = await supabase
    .from('international_teams')
    .select('id, api_team_id, name, league_name')
    .ilike('name', '%nagasaki%');

  if (teamsError) {
    console.error('Error:', teamsError);
    return;
  }

  if (!teams || teams.length === 0) {
    console.log('❌ Nagasaki not found in international_teams table');
    return;
  }

  console.log(`✅ Found ${teams.length} team(s):`);
  teams.forEach(t => {
    console.log(`  - ${t.name} (${t.league_name}) [API ID: ${t.api_team_id}]`);
  });

  // 3. Check if Nagasaki has games in international_team_schedules
  console.log('\n3️⃣ Checking international_team_schedules for Nagasaki:');
  for (const team of teams) {
    const { count, error: gamesError } = await supabase
      .from('international_team_schedules')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id);

    if (gamesError) {
      console.error(`Error checking games for ${team.name}:`, gamesError);
      continue;
    }

    if (count === 0) {
      console.log(`❌ No games found for ${team.name} (Team ID: ${team.id})`);
      console.log(`   → This team hasn't been synced yet!`);
    } else {
      console.log(`✅ Found ${count} games for ${team.name}`);
    }
  }

  // 4. Check if Hoshikawa is linked to a team
  console.log('\n4️⃣ Checking if Hoshikawa prospect is linked to international team:');
  for (const prospect of prospects) {
    if (prospect.international_team_id) {
      console.log(`✅ ${prospect.full_name} is linked to team ID: ${prospect.international_team_id}`);
      
      const linkedTeam = teams.find(t => t.id === prospect.international_team_id);
      if (linkedTeam) {
        console.log(`   Team: ${linkedTeam.name}`);
      }
    } else {
      console.log(`❌ ${prospect.full_name} is NOT linked to any international team`);
      console.log(`   This is the problem! The prospect needs to have international_team_id set.`);
    }
  }

  // 5. Check international_rosters for Hoshikawa
  console.log('\n5️⃣ Checking international_rosters:');
  const { data: rosters, error: rostersError } = await supabase
    .from('international_rosters')
    .select('player_name, international_teams(name, id)')
    .ilike('player_name', '%hoshikawa%');

  if (rostersError) {
    console.error('Error:', rostersError);
    return;
  }

  if (!rosters || rosters.length === 0) {
    console.log('❌ Hoshikawa not found in international_rosters');
  } else {
    console.log(`✅ Found ${rosters.length} roster entry(ies):`);
    rosters.forEach((r: any) => {
      console.log(`  - ${r.player_name} → ${r.international_teams?.name} (ID: ${r.international_teams?.id})`);
    });
  }
}

checkHoshikawa().catch(console.error);




