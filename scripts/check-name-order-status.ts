// Check which teams have correct vs reversed names
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkNameOrder() {
  console.log('🔍 Checking name order status across all synced teams...\n');
  
  // Sample teams from different alphabetical ranges
  const sampleTeams = [
    { name: 'Fenerbahce', range: 'A-I (Batch 1 resync)' },
    { name: 'Mega Basket', range: 'I-S (Batch 2)' },
    { name: 'Real Madrid', range: 'S-Z (Batch 3)' },
  ];
  
  for (const sample of sampleTeams) {
    const { data: team } = await supabase
      .from('international_teams')
      .select('id, name')
      .ilike('name', `%${sample.name}%`)
      .limit(1)
      .single();
    
    if (!team) {
      console.log(`❌ ${sample.name} (${sample.range}): Not found in database`);
      continue;
    }
    
    const { data: players } = await supabase
      .from('international_rosters')
      .select('player_name')
      .eq('team_id', team.id)
      .limit(5);
    
    if (!players || players.length === 0) {
      console.log(`⚠️  ${sample.name} (${sample.range}): No roster yet`);
      continue;
    }
    
    console.log(`${sample.name} (${sample.range}):`);
    console.log(`  Sample player names:`);
    players.forEach(p => {
      // Check if name looks reversed (all caps last name first)
      const hasReversedPattern = /^[A-Z][a-z]+ [A-Z]/.test(p.player_name);
      const marker = hasReversedPattern ? '❌ REVERSED' : '✅ CORRECT';
      console.log(`    ${marker}: ${p.player_name}`);
    });
    console.log();
  }
  
  // Overall stats
  const { count: totalPlayers } = await supabase
    .from('international_rosters')
    .select('*', { count: 'exact', head: true });
  
  const { data: distinctTeams } = await supabase
    .from('international_rosters')
    .select('team_id');
  
  const uniqueTeams = new Set(distinctTeams?.map(r => r.team_id) || []).size;
  
  console.log('📊 Overall Status:');
  console.log(`  Teams with rosters: ${uniqueTeams}`);
  console.log(`  Total players: ${totalPlayers || 0}`);
}

checkNameOrder().catch(console.error);





