// Check if Izan Almansa is in the database

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🔍 Searching for Izan Almansa...\n');
  
  // Search international_rosters
  console.log('1. Checking international_rosters table...');
  const { data: rosterResults, error: rosterError } = await supabase
    .from('international_rosters')
    .select(`
      id,
      player_name,
      position,
      international_teams (
        id,
        name,
        api_team_id,
        league_name
      )
    `)
    .ilike('player_name', '%izan%almansa%');
  
  if (rosterError) {
    console.error('Error:', rosterError);
  } else {
    console.log(`   Found ${rosterResults?.length || 0} matches in international_rosters`);
    if (rosterResults && rosterResults.length > 0) {
      rosterResults.forEach(r => {
        const team = (r.international_teams as any);
        console.log(`   - ${r.player_name} (Team: ${team?.name || 'Unknown'}, League: ${team?.league_name || 'Unknown'})`);
      });
    }
  }
  
  // Search prospects table
  console.log('\n2. Checking prospects table...');
  const { data: prospectResults, error: prospectError } = await supabase
    .from('prospects')
    .select('id, full_name, team_name, source, international_team_id, league')
    .ilike('full_name', '%izan%almansa%');
  
  if (prospectError) {
    console.error('Error:', prospectError);
  } else {
    console.log(`   Found ${prospectResults?.length || 0} matches in prospects`);
    if (prospectResults && prospectResults.length > 0) {
      prospectResults.forEach(p => {
        console.log(`   - ${p.full_name} (Team: ${p.team_name}, Source: ${p.source}, Has ID: ${!!p.international_team_id})`);
      });
    }
  }
  
  // Check Real Madrid in international_teams
  console.log('\n3. Checking Real Madrid in international_teams...');
  const { data: realMadridTeams, error: rmError } = await supabase
    .from('international_teams')
    .select('id, name, api_team_id, league_name')
    .or('name.ilike.%real madrid%,name.ilike.%realmadrid%')
    .limit(10);
  
  if (rmError) {
    console.error('Error:', rmError);
  } else {
    console.log(`   Found ${realMadridTeams?.length || 0} Real Madrid teams`);
    if (realMadridTeams && realMadridTeams.length > 0) {
      realMadridTeams.forEach(t => {
        console.log(`   - ${t.name} (API ID: ${t.api_team_id}, League: ${t.league_name || 'Unknown'})`);
      });
    }
  }
  
  // Try searching with different name variations
  console.log('\n4. Trying different name variations...');
  const variations = ['izan almansa', 'almansa', 'izan', 'Izan Almansa'];
  
  for (const variation of variations) {
    const { data: varResults } = await supabase
      .from('international_rosters')
      .select('id, player_name')
      .ilike('player_name', `%${variation}%`)
      .limit(5);
    
    if (varResults && varResults.length > 0) {
      console.log(`   "${variation}": Found ${varResults.length} matches`);
      varResults.forEach(r => {
        console.log(`     - ${r.player_name}`);
      });
    }
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});


