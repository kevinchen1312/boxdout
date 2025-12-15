// Check if Radojicic is in database
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkRadojicic() {
  console.log('🔍 Searching for Radojicic...\n');
  
  // Search in international rosters
  const { data, error } = await supabase
    .from('international_rosters')
    .select(`
      id,
      player_name,
      position,
      season,
      international_teams (
        name,
        league_name
      )
    `)
    .ilike('player_name', '%radojicic%');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log('❌ No players named Radojicic found in database\n');
    
    // Check what teams we have synced
    const { data: teams } = await supabase
      .from('international_teams')
      .select('name')
      .ilike('name', '%red%')
      .order('name');
    
    console.log('Teams with "Red" in name (where he might play):');
    if (teams && teams.length > 0) {
      teams.forEach(t => console.log(`  - ${t.name}`));
    } else {
      console.log('  None found');
    }
    
    // Check roster sync status
    const { count: totalTeams } = await supabase
      .from('international_teams')
      .select('*', { count: 'exact', head: true });
    
    const { data: teamsWithRosters } = await supabase
      .from('international_rosters')
      .select('team_id');
    
    const uniqueTeamsWithRosters = new Set(teamsWithRosters?.map(r => r.team_id) || []).size;
    
    console.log(`\n📊 Sync progress: ${uniqueTeamsWithRosters}/${totalTeams || 0} teams have rosters`);
    
  } else {
    console.log(`✅ Found ${data.length} player(s):\n`);
    data.forEach((p: any) => {
      console.log(`  ${p.player_name}`);
      console.log(`    Team: ${p.international_teams?.name}`);
      console.log(`    League: ${p.international_teams?.league_name}`);
      console.log(`    Position: ${p.position || 'N/A'}`);
      console.log();
    });
  }
}

checkRadojicic().catch(console.error);





