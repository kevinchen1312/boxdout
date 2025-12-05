// Check if Birsen James is actually in user_rankings
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkBirsen() {
  console.log('🔍 Checking for Birsen James in watchlist...\n');
  
  // Search for Birsen in prospects
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, full_name, team_name, league, source')
    .ilike('full_name', '%birsen%');
  
  console.log('Prospects with "Birsen" in name:');
  if (!prospects || prospects.length === 0) {
    console.log('  ❌ None found\n');
  } else {
    prospects.forEach(p => {
      console.log(`  - ${p.full_name} (${p.team_name}) [ID: ${p.id}]`);
    });
  }
  
  // Check if any are in user_rankings
  if (prospects && prospects.length > 0) {
    console.log('\nChecking if any are in user_rankings:');
    for (const p of prospects) {
      const { data: ranking } = await supabase
        .from('user_rankings')
        .select('rank, user_id')
        .eq('prospect_id', p.id);
      
      if (ranking && ranking.length > 0) {
        console.log(`  ✅ ${p.full_name} - Rank ${ranking[0].rank} (User ID: ${ranking[0].user_id})`);
      } else {
        console.log(`  ❌ ${p.full_name} - NOT in user_rankings`);
      }
    }
  }
  
  // Show all rankings
  console.log('\n📊 All user_rankings entries:');
  const { data: allRankings } = await supabase
    .from('user_rankings')
    .select(`
      rank,
      prospect_id,
      prospects (
        full_name,
        team_name
      )
    `)
    .order('rank');
  
  if (allRankings) {
    allRankings.forEach((r: any) => {
      console.log(`  Rank ${r.rank}: ${r.prospects?.full_name || 'Unknown'} (${r.prospects?.team_name || 'N/A'})`);
    });
  }
}

checkBirsen().catch(console.error);




