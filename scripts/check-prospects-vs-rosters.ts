// Check if prospects that match international_rosters entries have international_team_id

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
  console.log('📋 Checking prospects against international_rosters...\n');
  
  // Get all prospects that are international (not NCAA)
  const { data: allProspects, error: prospectsError } = await supabase
    .from('prospects')
    .select('id, full_name, team_name, league, source, international_team_id, espn_id')
    .neq('league', 'NCAA')
    .not('team_name', 'is', null)
    .order('full_name');
  
  if (prospectsError) {
    console.error('❌ Error:', prospectsError);
    process.exit(1);
  }
  
  if (!allProspects || allProspects.length === 0) {
    console.log('No international prospects found');
    return;
  }
  
  console.log(`Total international prospects: ${allProspects.length}\n`);
  
  // Check which ones match international_rosters
  const prospectsWithRosterMatch: any[] = [];
  const prospectsWithoutRosterMatch: any[] = [];
  
  for (const prospect of allProspects) {
    // Check if this prospect matches an international_roster entry
    // Match by name (case-insensitive) and team
    const { data: rosterMatch } = await supabase
      .from('international_rosters')
      .select('id, name, team_id, international_teams(id, name)')
      .ilike('name', prospect.full_name)
      .limit(5);
    
    if (rosterMatch && rosterMatch.length > 0) {
      // Check if team matches
      const teamMatch = rosterMatch.find(r => {
        const teamName = (r.international_teams as any)?.name;
        if (!teamName || !prospect.team_name) return false;
        return teamName.toLowerCase().includes(prospect.team_name.toLowerCase()) ||
               prospect.team_name.toLowerCase().includes(teamName.toLowerCase());
      });
      
      if (teamMatch) {
        prospectsWithRosterMatch.push({
          prospect,
          rosterEntry: teamMatch,
        });
      } else {
        prospectsWithoutRosterMatch.push(prospect);
      }
    } else {
      prospectsWithoutRosterMatch.push(prospect);
    }
  }
  
  console.log(`Prospects matching international_rosters: ${prospectsWithRosterMatch.length}`);
  console.log(`Prospects NOT matching international_rosters: ${prospectsWithoutRosterMatch.length}\n`);
  
  // Check which matched prospects are missing international_team_id
  const matchedButMissingId = prospectsWithRosterMatch.filter(p => !p.prospect.international_team_id);
  
  console.log(`\n⚠️  Prospects that match rosters but MISSING international_team_id: ${matchedButMissingId.length}`);
  matchedButMissingId.forEach(p => {
    const teamName = (p.rosterEntry.international_teams as any)?.name || 'Unknown';
    console.log(`  - ${p.prospect.full_name} (${p.prospect.team_name}) → Should link to: ${teamName} (ID: ${p.rosterEntry.team_id})`);
  });
  
  // Show breakdown by source
  console.log('\n\n📊 Breakdown of all international prospects:');
  const bySource: Record<string, { total: number; withId: number; withoutId: number }> = {};
  allProspects.forEach(p => {
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
  
  Object.entries(bySource).forEach(([source, stats]) => {
    console.log(`  ${source}: ${stats.total} total, ${stats.withId} with ID, ${stats.withoutId} without ID`);
  });
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});


