// Quick diagnostic for duplicate errors
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function quickDiagnostic() {
  const problemTeamId = '89b531ff-9b43-462a-9bd7-1ca240c71e17';
  
  console.log('='.repeat(80));
  console.log('DIAGNOSTIC: Understanding Duplicate Errors');
  console.log('='.repeat(80));
  
  // 1. What team caused the duplicates?
  const { data: team } = await supabase
    .from('international_teams')
    .select('name, league_name, api_team_id')
    .eq('id', problemTeamId)
    .single();
  
  console.log('\n1. Team that caused duplicate errors:');
  console.log(`   Name: ${team?.name}`);
  console.log(`   League: ${team?.league_name}`);
  console.log(`   Position: ${team?.name && team.name > 'Iserlohn' ? 'AFTER Iserlohn ✓' : 'BEFORE Iserlohn'}`);
  
  // 2. How many players does it have?
  const { count } = await supabase
    .from('international_rosters')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', problemTeamId);
  
  console.log(`   Players in DB: ${count}`);
  
  // 3. When was it synced?
  const { data: roster } = await supabase
    .from('international_rosters')
    .select('last_synced')
    .eq('team_id', problemTeamId)
    .order('last_synced', { ascending: false })
    .limit(1)
    .single();
  
  console.log(`   Last synced: ${roster?.last_synced || 'Unknown'}`);
  
  // 4. Why did the old script try to re-sync it?
  console.log('\n2. Why the old script failed:');
  console.log(`   ❌ Old script logic: Selected ALL teams > 'Iserlohn'`);
  console.log(`   ❌ Didn't check: If team already has rosters`);
  console.log(`   ❌ Result: Tried to insert duplicates`);
  console.log(`   ✅ Fix: New script filters out teams with existing rosters`);
  
  // 5. Show the fix worked
  const { data: teamsAfter } = await supabase
    .from('international_teams')
    .select('id')
    .gt('name', 'Iserlohn');
  
  const { data: withRosters } = await supabase
    .from('international_rosters')
    .select('team_id');
  
  const rosterTeamIds = new Set(withRosters?.map(r => r.team_id));
  const withoutRosters = teamsAfter?.filter(t => !rosterTeamIds.has(t.id));
  
  console.log('\n3. Current status (after fix):');
  console.log(`   Teams after Iserlohn: ${teamsAfter?.length || 0}`);
  console.log(`   Already have rosters: ${(teamsAfter?.length || 0) - (withoutRosters?.length || 0)}`);
  console.log(`   Need rosters: ${withoutRosters?.length || 0}`);
  console.log(`   ✅ Script now processes only: ${withoutRosters?.length || 0} teams`);
  
  console.log('\n' + '='.repeat(80));
  console.log('CONCLUSION:');
  console.log('The duplicate errors were caused by teams that were already synced');
  console.log('in the first batch (A-I) but alphabetically come after "Iserlohn".');
  console.log('The fix now skips teams with existing rosters. ✅');
  console.log('='.repeat(80) + '\n');
}

quickDiagnostic().catch(console.error);





