// Backfill international_team_id for ALL prospects that should have it
// This includes prospects that match teams in international_teams but don't have the link

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
  console.log('📋 Checking ALL prospects for missing international_team_id...\n');
  
  // Get ALL prospects that are international (not NCAA) and missing international_team_id
  const { data: allProspects, error: prospectsError } = await supabase
    .from('prospects')
    .select('id, full_name, team_name, league, source, international_team_id')
    .is('international_team_id', null)
    .not('team_name', 'is', null)
    .neq('league', 'NCAA')
    .order('full_name');
  
  if (prospectsError) {
    console.error('❌ Error:', prospectsError);
    process.exit(1);
  }
  
  if (!allProspects || allProspects.length === 0) {
    console.log('✅ No unmatched international prospects found!');
    return;
  }
  
  console.log(`Found ${allProspects.length} prospects missing international_team_id\n`);
  
  // Get total count of all international prospects for context
  const { count: totalInternational } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .neq('league', 'NCAA')
    .not('team_name', 'is', null);
  
  console.log(`Total international prospects in database: ${totalInternational}`);
  console.log(`Missing international_team_id: ${allProspects.length}\n`);
  
  // Group by source
  const bySource: Record<string, number> = {};
  allProspects.forEach(p => {
    const source = p.source || 'unknown';
    bySource[source] = (bySource[source] || 0) + 1;
  });
  
  console.log('Breakdown by source:');
  Object.entries(bySource).forEach(([source, count]) => {
    console.log(`  ${source}: ${count}`);
  });
  
  console.log('\n\nSample of unmatched prospects (first 20):');
  allProspects.slice(0, 20).forEach(p => {
    console.log(`  - ${p.full_name} (${p.team_name}) [${p.source || 'unknown'}]`);
  });
  
  if (allProspects.length > 20) {
    console.log(`  ... and ${allProspects.length - 20} more`);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});


