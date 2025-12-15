// Check all international prospects and their international_team_id status

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
  console.log('📋 Checking ALL international prospects...\n');
  
  // Get all international prospects (any source, any league except NCAA)
  const { data: allInternational, error: allError } = await supabase
    .from('prospects')
    .select('id, full_name, team_name, league, source, international_team_id')
    .neq('league', 'NCAA')
    .not('team_name', 'is', null)
    .order('full_name');
  
  if (allError) {
    console.error('❌ Error:', allError);
    process.exit(1);
  }
  
  if (!allInternational || allInternational.length === 0) {
    console.log('No international prospects found');
    return;
  }
  
  console.log(`Total international prospects: ${allInternational.length}\n`);
  
  // Separate by international_team_id status
  const withTeamId = allInternational.filter(p => p.international_team_id);
  const withoutTeamId = allInternational.filter(p => !p.international_team_id);
  
  console.log(`✅ With international_team_id: ${withTeamId.length}`);
  console.log(`❌ Missing international_team_id: ${withoutTeamId.length}\n`);
  
  // Group by source
  const bySource: Record<string, { total: number; withId: number; withoutId: number }> = {};
  allInternational.forEach(p => {
    const source = p.source || 'unknown';
    if (!bySource[source]) {
      bySource[source] = { total: 0, withId: 0, withoutId: 0 };
    }
    bySource[source].total++;
    if (p.international_team_id) {
      bySource[source].withId++;
    } else {
      bySource[source].withoutId++;
    }
  });
  
  console.log('📊 Breakdown by source:');
  Object.entries(bySource).forEach(([source, stats]) => {
    console.log(`  ${source}:`);
    console.log(`    Total: ${stats.total}`);
    console.log(`    With ID: ${stats.withId}`);
    console.log(`    Without ID: ${stats.withoutId}`);
  });
  
  if (withoutTeamId.length > 0) {
    console.log('\n\n❌ Prospects missing international_team_id:');
    withoutTeamId.forEach(p => {
      console.log(`  - ${p.full_name} (${p.team_name}) [source: ${p.source || 'unknown'}, league: ${p.league || 'unknown'}]`);
    });
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});


