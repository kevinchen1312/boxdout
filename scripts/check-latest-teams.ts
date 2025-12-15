import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkLatestTeams() {
  // Get the last 10 teams synced (by team name)
  const { data: rosters } = await supabase
    .from('international_rosters')
    .select('team_id, international_teams(name)')
    .order('created_at', { ascending: false })
    .limit(50);
  
  if (!rosters || rosters.length === 0) {
    console.log('No rosters found yet');
    return;
  }
  
  const uniqueTeams = new Map();
  for (const r of rosters) {
    const team: any = r.international_teams;
    if (team && !uniqueTeams.has(team.name)) {
      uniqueTeams.set(team.name, true);
    }
  }
  
  const teamNames = Array.from(uniqueTeams.keys());
  console.log(`\n📊 Last ${teamNames.length} teams synced (most recent first):\n`);
  teamNames.forEach((name, i) => {
    console.log(`  ${i + 1}. ${name}`);
  });
  
  console.log(`\nFirst team alphabetically: ${teamNames[teamNames.length - 1]}`);
  console.log(`Latest team alphabetically: ${teamNames[0]}`);
}

checkLatestTeams().catch(console.error);





