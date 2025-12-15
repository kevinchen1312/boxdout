/**
 * Script to list all teams that have schedules synced in the database
 * Run with: npx tsx scripts/list-synced-teams.ts
 */

import { config } from 'dotenv';
import * as path from 'path';

// Load environment variables FIRST before any other imports
config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables. Make sure .env.local exists.');
  process.exit(1);
}

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('[List] Fetching synced teams...\n');
  
  try {
    // Get unique NCAA teams
    const { data: ncaaTeams, error: ncaaError } = await supabase
      .from('ncaa_team_schedules')
      .select('espn_team_id, home_team_display_name, away_team_display_name')
      .limit(10000);
    
    if (ncaaError) {
      throw ncaaError;
    }
    
    // Get unique NBL teams
    const { data: nblTeams, error: nblError } = await supabase
      .from('nbl_team_schedules')
      .select('espn_team_id, home_team_display_name, away_team_display_name')
      .limit(10000);
    
    if (nblError) {
      throw nblError;
    }
    
    // Extract unique team IDs and names
    const ncaaTeamMap = new Map<string, string>();
    if (ncaaTeams) {
      for (const game of ncaaTeams) {
        if (game.espn_team_id && !ncaaTeamMap.has(game.espn_team_id)) {
          // Use home or away team name (whichever matches the espn_team_id)
          const teamName = game.home_team_display_name || game.away_team_display_name || 'Unknown';
          ncaaTeamMap.set(game.espn_team_id, teamName);
        }
      }
    }
    
    const nblTeamMap = new Map<string, string>();
    if (nblTeams) {
      for (const game of nblTeams) {
        if (game.espn_team_id && !nblTeamMap.has(game.espn_team_id)) {
          const teamName = game.home_team_display_name || game.away_team_display_name || 'Unknown';
          nblTeamMap.set(game.espn_team_id, teamName);
        }
      }
    }
    
    // Get game counts per team
    const ncaaTeamCounts = new Map<string, number>();
    if (ncaaTeams) {
      for (const game of ncaaTeams) {
        if (game.espn_team_id) {
          ncaaTeamCounts.set(game.espn_team_id, (ncaaTeamCounts.get(game.espn_team_id) || 0) + 1);
        }
      }
    }
    
    const nblTeamCounts = new Map<string, number>();
    if (nblTeams) {
      for (const game of nblTeams) {
        if (game.espn_team_id) {
          nblTeamCounts.set(game.espn_team_id, (nblTeamCounts.get(game.espn_team_id) || 0) + 1);
        }
      }
    }
    
    console.log('=== NCAA TEAMS ===');
    console.log(`Total: ${ncaaTeamMap.size} teams\n`);
    const ncaaSorted = Array.from(ncaaTeamMap.entries())
      .map(([id, name]) => ({ id, name, games: ncaaTeamCounts.get(id) || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    for (const team of ncaaSorted) {
      console.log(`  ${team.name} (ID: ${team.id}) - ${team.games} games`);
    }
    
    console.log('\n=== NBL TEAMS ===');
    console.log(`Total: ${nblTeamMap.size} teams\n`);
    const nblSorted = Array.from(nblTeamMap.entries())
      .map(([id, name]) => ({ id, name, games: nblTeamCounts.get(id) || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    for (const team of nblSorted) {
      console.log(`  ${team.name} (ID: ${team.id}) - ${team.games} games`);
    }
    
    console.log('\n=== SUMMARY ===');
    console.log(`NCAA: ${ncaaTeamMap.size} teams, ${ncaaTeams?.length || 0} total games`);
    console.log(`NBL: ${nblTeamMap.size} teams, ${nblTeams?.length || 0} total games`);
    
  } catch (error) {
    console.error('[List] Fatal error:', error);
    process.exit(1);
  }
}

main();


