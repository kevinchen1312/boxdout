import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkProgress() {
  const { count } = await supabase
    .from('international_rosters')
    .select('*', { count: 'exact', head: true });
  
  const { data: teams } = await supabase
    .from('international_rosters')
    .select('team_id');
  
  const uniqueTeams = new Set(teams?.map(r => r.team_id) || []).size;
  
  console.log(`\n📊 Sync Progress:`);
  console.log(`  Teams synced: ${uniqueTeams}`);
  console.log(`  Total players: ${count || 0}\n`);
  
  // Sample some names to verify format
  const { data: samples } = await supabase
    .from('international_rosters')
    .select('player_name, international_teams(name)')
    .limit(10);
  
  if (samples && samples.length > 0) {
    console.log('Sample player names:');
    samples.forEach((s: any) => {
      const teamName = s.international_teams?.name || 'Unknown';
      console.log(`  ${s.player_name} (${teamName})`);
    });
  }
}

checkProgress().catch(console.error);

