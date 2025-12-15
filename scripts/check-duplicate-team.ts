// Check which team was causing duplicate errors
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicateTeam() {
  const problemTeamId = '89b531ff-9b43-462a-9bd7-1ca240c71e17';
  
  console.log('🔍 Checking team that caused duplicate errors...\n');
  
  // Get team info
  const { data: team, error: teamError } = await supabase
    .from('international_teams')
    .select('*')
    .eq('id', problemTeamId)
    .single();
  
  if (teamError || !team) {
    console.error('Error fetching team:', teamError);
    return;
  }
  
  console.log('Team causing duplicates:');
  console.log(`  Name: ${team.name}`);
  console.log(`  League: ${team.league_name}`);
  console.log(`  API Team ID: ${team.api_team_id}`);
  console.log(`  Alphabetical position: ${team.name > 'Iserlohn' ? 'AFTER' : 'BEFORE'} Iserlohn\n`);
  
  // Check how many players this team has
  const { count, error: countError } = await supabase
    .from('international_rosters')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', problemTeamId);
  
  if (!countError) {
    console.log(`Players in database for this team: ${count}\n`);
  }
  
  // Now check how many teams alphabetically after Iserlohn already have rosters
  console.log('📊 Checking teams after Iserlohn with rosters...\n');
  
  const { data: teamsAfterIserlohn, error: teamsError } = await supabase
    .from('international_teams')
    .select('id, name')
    .gt('name', 'Iserlohn')
    .order('name');
  
  if (teamsError || !teamsAfterIserlohn) {
    console.error('Error:', teamsError);
    return;
  }
  
  console.log(`Total teams after Iserlohn: ${teamsAfterIserlohn.length}`);
  
  // Check which ones have rosters
  let withRosters = 0;
  let withoutRosters = 0;
  const samplesWithRosters: string[] = [];
  const samplesWithoutRosters: string[] = [];
  
  for (const t of teamsAfterIserlohn) {
    const { count } = await supabase
      .from('international_rosters')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', t.id);
    
    if (count && count > 0) {
      withRosters++;
      if (samplesWithRosters.length < 5) {
        samplesWithRosters.push(`${t.name} (${count} players)`);
      }
    } else {
      withoutRosters++;
      if (samplesWithoutRosters.length < 5) {
        samplesWithoutRosters.push(t.name);
      }
    }
  }
  
  console.log(`  Already have rosters: ${withRosters}`);
  console.log(`  Need rosters: ${withoutRosters}\n`);
  
  console.log('Sample teams WITH rosters (should be skipped):');
  samplesWithRosters.forEach(s => console.log(`  - ${s}`));
  
  console.log('\nSample teams WITHOUT rosters (should be processed):');
  samplesWithoutRosters.forEach(s => console.log(`  - ${s}`));
}

checkDuplicateTeam().catch(console.error);





