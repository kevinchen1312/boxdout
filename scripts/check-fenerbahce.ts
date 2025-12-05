// Check if Fenerbahce exists in the database
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFenerbahce() {
  console.log('🔍 Checking for Fenerbahce in database...\n');
  
  // 1. Check if Fenerbahce team exists
  console.log('1️⃣ Looking for Fenerbahce in international_teams:');
  const { data: teams, error: teamsError } = await supabase
    .from('international_teams')
    .select('id, name, api_team_id, league_name, season_format')
    .ilike('name', '%fenerbahce%');
  
  if (teamsError) {
    console.error('Error:', teamsError);
  } else if (!teams || teams.length === 0) {
    console.log('❌ No Fenerbahce teams found in database');
  } else {
    console.log(`✅ Found ${teams.length} Fenerbahce team(s):`);
    teams.forEach(team => {
      console.log(`   - ${team.name} (ID: ${team.api_team_id}, League: ${team.league_name})`);
    });
    
    // 2. Check for players
    console.log('\n2️⃣ Checking for Fenerbahce players in international_rosters:');
    for (const team of teams) {
      const { data: players, error: playersError } = await supabase
        .from('international_rosters')
        .select('id, player_name, position, number, season')
        .eq('team_id', team.id)
        .order('player_name');
      
      if (playersError) {
        console.error(`Error fetching players for ${team.name}:`, playersError);
      } else if (!players || players.length === 0) {
        console.log(`❌ No players found for ${team.name}`);
      } else {
        console.log(`✅ Found ${players.length} players for ${team.name}:`);
        players.forEach(p => {
          console.log(`   ${p.number ? `#${p.number}` : '   '} ${p.player_name} (${p.position || 'N/A'})`);
        });
      }
    }
  }
  
  // 3. Search for "birsen" regardless of team
  console.log('\n3️⃣ Searching for "birsen" across all international players:');
  const { data: birsenSearch, error: birsenError } = await supabase
    .from('international_rosters')
    .select(`
      id,
      player_name,
      position,
      international_teams (
        name,
        league_name
      )
    `)
    .ilike('player_name', '%birsen%');
  
  if (birsenError) {
    console.error('Error:', birsenError);
  } else if (!birsenSearch || birsenSearch.length === 0) {
    console.log('❌ No players named "birsen" found');
  } else {
    console.log(`✅ Found ${birsenSearch.length} player(s) with "birsen" in name:`);
    birsenSearch.forEach((p: any) => {
      console.log(`   ${p.player_name} - ${p.international_teams?.name} (${p.international_teams?.league_name})`);
    });
  }
}

checkFenerbahce().catch(console.error);




