import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAdiguzel() {
  console.log('🔍 Checking E. Adiguzel data...\n');

  // 1. Check prospects table
  const { data: prospects } = await supabase
    .from('prospects')
    .select('*')
    .ilike('full_name', '%adiguzel%');

  if (!prospects || prospects.length === 0) {
    console.log('❌ Adiguzel not found in prospects');
    return;
  }

  console.log(`Found ${prospects.length} prospect(s):\n`);
  prospects.forEach(p => {
    console.log(`Name: ${p.full_name}`);
    console.log(`Team: ${p.team_name}`);
    console.log(`Team ID: ${p.team_id}`);
    console.log(`International Team ID: ${p.international_team_id || 'NULL ❌'}`);
    console.log(`Source: ${p.source}`);
    console.log(`League: ${p.league}\n`);
  });

  // 2. Check if Besiktas is in international_teams
  const { data: teams } = await supabase
    .from('international_teams')
    .select('*')
    .ilike('name', '%besiktas%');

  if (teams && teams.length > 0) {
    console.log('✅ Besiktas teams found:');
    teams.forEach(t => {
      console.log(`  ${t.name} - ${t.league_name} (ID: ${t.id}, API ID: ${t.api_team_id})`);
    });
  } else {
    console.log('❌ Besiktas not found in international_teams');
  }

  // 3. Check if Besiktas has schedule
  if (teams && teams.length > 0) {
    for (const team of teams) {
      const { count } = await supabase
        .from('international_team_schedules')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', team.id);
      
      console.log(`\n${team.name} schedule: ${count || 0} games`);
    }
  }

  // 4. Check international_rosters for Adiguzel
  const { data: rosters } = await supabase
    .from('international_rosters')
    .select('player_name, international_teams(name, id)')
    .ilike('player_name', '%adiguzel%');

  if (rosters && rosters.length > 0) {
    console.log('\n✅ Found in international_rosters:');
    rosters.forEach((r: any) => {
      console.log(`  ${r.player_name} → ${r.international_teams?.name} (Team ID: ${r.international_teams?.id})`);
    });
  }
}

checkAdiguzel().catch(console.error);




