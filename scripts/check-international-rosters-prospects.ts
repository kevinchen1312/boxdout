// Check if international roster players in prospects table have international_team_id

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
  console.log('📋 Checking international roster players in prospects table...\n');
  
  // Check how many players are in international_rosters
  const { count: rosterCount } = await supabase
    .from('international_rosters')
    .select('*', { count: 'exact', head: true });
  
  console.log(`Total players in international_rosters table: ${rosterCount}\n`);
  
  // Check prospects with source='international-roster'
  const { data: rosterProspects, error: rosterError } = await supabase
    .from('prospects')
    .select('id, full_name, team_name, source, international_team_id')
    .eq('source', 'international-roster')
    .order('full_name');
  
  if (rosterError) {
    console.error('❌ Error:', rosterError);
    process.exit(1);
  }
  
  if (!rosterProspects || rosterProspects.length === 0) {
    console.log('No prospects with source="international-roster" found');
    return;
  }
  
  console.log(`Prospects with source='international-roster': ${rosterProspects.length}\n`);
  
  const withTeamId = rosterProspects.filter(p => p.international_team_id);
  const withoutTeamId = rosterProspects.filter(p => !p.international_team_id);
  
  console.log(`✅ With international_team_id: ${withTeamId.length}`);
  console.log(`❌ Missing international_team_id: ${withoutTeamId.length}\n`);
  
  if (withoutTeamId.length > 0) {
    console.log('❌ Prospects missing international_team_id:');
    withoutTeamId.slice(0, 20).forEach(p => {
      console.log(`  - ${p.full_name} (${p.team_name})`);
    });
    if (withoutTeamId.length > 20) {
      console.log(`  ... and ${withoutTeamId.length - 20} more`);
    }
  }
  
  // Also check if there are prospects that should be linked to international_rosters
  // by checking prospects that match names in international_rosters but don't have source='international-roster'
  console.log('\n\n📊 Checking if international_rosters players are in prospects table...');
  
  // Get a sample of international_rosters to check
  const { data: sampleRosters } = await supabase
    .from('international_rosters')
    .select('id, name, team_id, international_teams(id, name)')
    .limit(100);
  
  if (sampleRosters && sampleRosters.length > 0) {
    console.log(`Sample of ${sampleRosters.length} roster entries:`);
    sampleRosters.slice(0, 10).forEach(r => {
      const teamName = (r.international_teams as any)?.name || 'Unknown';
      console.log(`  - ${r.name} (Team: ${teamName})`);
    });
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});


