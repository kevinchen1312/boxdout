// Resume-capable roster sync for international teams
// Only processes teams without existing roster entries
// Includes better error handling to continue on failures

import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') }); // Load .env.local

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

if (!apiKey) {
  console.error('Missing API_BASKETBALL_KEY - set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BASE_URL = 'https://v1.basketball.api-sports.io';

interface Player {
  id: number;
  name: string;
  firstname: string;
  lastname: string;
  position: string;
  number: string;
}

interface Team {
  id: string;
  api_team_id: number;
  name: string;
  league_name: string;
  season_format: string;
}

// Fetch roster for a specific team
async function fetchTeamRoster(teamId: number, season: string, teamName: string): Promise<Player[]> {
  try {
    const params = new URLSearchParams({
      team: String(teamId),
      season: season,
    });
    
    const url = `${BASE_URL}/players?${params.toString()}`;
    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey! },
    });

    if (!response.ok) {
      console.error(`   API returned status ${response.status} for ${teamName}`);
      return [];
    }

    const data = await response.json();
    
    // Debug: Log API response for first few teams
    if (data.errors && Object.keys(data.errors).length > 0) {
      console.error(`   ⚠️  API errors for ${teamName}:`, JSON.stringify(data.errors));
    }
    
    if (data.response && data.response.length === 0) {
      console.log(`   🔍 API returned 0 players for team ${teamId} (${teamName}), season ${season}`);
    }
    
    return data.response || [];
  } catch (error) {
    console.error(`Error fetching roster for team ${teamId}:`, error);
    return [];
  }
}

// Store players in database
async function storePlayers(players: Player[], teamDbId: string, season: string): Promise<number> {
  let storedCount = 0;
  
  // Delete existing roster for this team/season (if any)
  await supabase
    .from('international_rosters')
    .delete()
    .eq('team_id', teamDbId)
    .eq('season', season);
  
  // Deduplicate players by name (API sometimes returns duplicates)
  const uniquePlayers = new Map<string, Player>();
  for (const player of players) {
    // Prefer firstname + lastname over the 'name' field to avoid reversed names
    let playerName = player.name;
    if (player.firstname || player.lastname) {
      // API provides separate fields - use them directly
      playerName = `${player.firstname || ''} ${player.lastname || ''}`.trim();
    } else if (playerName && !playerName.includes('.')) {
      // Only 'name' field provided (likely "Lastname Firstname" format)
      // Reverse it, but skip abbreviated names like "A. Djulovic"
      const parts = playerName.trim().split(/\s+/);
      if (parts.length === 2) {
        // Simple case: "Abalde Alberto" → "Alberto Abalde"
        playerName = `${parts[1]} ${parts[0]}`;
      } else if (parts.length > 2) {
        // Multiple parts: assume last part is firstname, rest is lastname
        // "De Larrea Sergio" → "Sergio De Larrea"
        const firstname = parts[parts.length - 1];
        const lastname = parts.slice(0, -1).join(' ');
        playerName = `${firstname} ${lastname}`;
      }
      // If only 1 part or has abbreviations, keep as-is
    }
    
    // Keep first occurrence of each player name
    if (!uniquePlayers.has(playerName)) {
      uniquePlayers.set(playerName, { ...player, name: playerName });
    }
  }
  
  // Insert deduplicated players
  for (const [playerName, player] of uniquePlayers) {
    try {
      const { error } = await supabase
        .from('international_rosters')
        .insert({
          team_id: teamDbId,
          player_name: playerName,
          api_player_id: player.id,
          position: player.position,
          number: player.number,
          season: season,
          last_synced: new Date().toISOString(),
        });

      if (!error) {
        storedCount++;
      } else {
        console.error(`Error storing player ${playerName}:`, error);
      }
    } catch (error) {
      console.error(`Exception storing player ${playerName}:`, error);
    }
  }
  
  return storedCount;
}

// Find teams AFTER South Korea that DON'T have rosters yet
async function getTeamsAfterIserlohn(): Promise<Team[]> {
  // Get all teams that come alphabetically AFTER South Korea
  const { data: allTeamsAfterIserlohn, error: teamsError } = await supabase
    .from('international_teams')
    .select('id, api_team_id, name, league_name, season_format')
    .gt('name', 'South Korea')  // Greater than 'South Korea' alphabetically
    .order('name');
  
  if (teamsError || !allTeamsAfterIserlohn) {
    console.error('Error fetching teams:', teamsError);
    return [];
  }
  
  // Get team IDs that already have rosters
  const { data: teamsWithRosters, error: rostersError } = await supabase
    .from('international_rosters')
    .select('team_id')
    .not('team_id', 'is', null);
  
  if (rostersError) {
    console.error('Error fetching existing rosters:', rostersError);
    return allTeamsAfterIserlohn; // Continue with all teams if error
  }
  
  const teamIdsWithRosters = new Set(
    teamsWithRosters?.map(r => r.team_id) || []
  );
  
  // Filter to only teams without rosters
  const teamsWithoutRosters = allTeamsAfterIserlohn.filter(
    team => !teamIdsWithRosters.has(team.id)
  );
  
  console.log(`Found ${allTeamsAfterIserlohn.length} teams after South Korea`);
  console.log(`${allTeamsAfterIserlohn.length - teamsWithoutRosters.length} already have rosters`);
  console.log(`${teamsWithoutRosters.length} teams need to be synced\n`);
  
  return teamsWithoutRosters;
}

async function syncRostersResume(): Promise<void> {
  console.log('👥 Starting International Rosters Sync (RESUME MODE)\n');
  console.log('='.repeat(80));
  console.log('📋 Fetching teams alphabetically AFTER South Korea...\n');
  
  // Fetch teams that come after Iserlohn alphabetically
  const teamsWithoutRosters = await getTeamsAfterIserlohn();
  
  if (teamsWithoutRosters.length === 0) {
    console.log('\n✅ All remaining teams already synced! Nothing to do.');
    return;
  }
  
  console.log(`Found ${teamsWithoutRosters.length} teams to process (starting after South Korea)\n`);
  console.log('='.repeat(80));
  
  let totalPlayersStored = 0;
  let teamsProcessed = 0;
  let teamsSkipped = 0;
  let teamsFailed = 0;
  
  // Get current year for season
  const currentYear = new Date().getFullYear();
  
  for (let i = 0; i < teamsWithoutRosters.length; i++) {
    const team = teamsWithoutRosters[i];
    const progress = `[${i + 1}/${teamsWithoutRosters.length}]`;
    
    try {
      console.log(`\n${progress} 🏀 ${team.name} (League: ${team.league_name})`);
      
      // Determine season based on team's season format
      let seasonToFetch: string;
      if (team.season_format === 'YYYY-YYYY') {
        seasonToFetch = `${currentYear}-${currentYear + 1}`;
      } else {
        seasonToFetch = String(currentYear);
      }
      
      console.log(`   Fetching roster for season: ${seasonToFetch}`);
      
      // Fetch roster
      const players = await fetchTeamRoster(team.api_team_id, seasonToFetch, team.name);
      
      if (players.length === 0) {
        console.log(`   ⚠️  No players found, skipping`);
        teamsSkipped++;
      } else {
        console.log(`   Found ${players.length} players`);
        
        // Store players
        const stored = await storePlayers(players, team.id, seasonToFetch);
        console.log(`   ✅ Stored ${stored} players`);
        
        totalPlayersStored += stored;
        teamsProcessed++;
        
        // Update team's last_synced timestamp
        await supabase
          .from('international_teams')
          .update({ last_synced: new Date().toISOString() })
          .eq('id', team.id);
      }
      
      // Rate limiting - wait 1.5 seconds between API calls
      await new Promise(resolve => setTimeout(resolve, 1500));
      
    } catch (error) {
      console.error(`   ❌ Failed to process ${team.name}:`, error);
      teamsFailed++;
      // Continue to next team instead of stopping
      continue;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📈 RESUME SYNC SUMMARY\n');
  console.log(`Teams processed: ${teamsProcessed}`);
  console.log(`Teams skipped (no players): ${teamsSkipped}`);
  console.log(`Teams failed: ${teamsFailed}`);
  console.log(`Total players stored: ${totalPlayersStored}`);
  console.log(`Average players per team: ${teamsProcessed > 0 ? (totalPlayersStored / teamsProcessed).toFixed(1) : 0}`);
  console.log('\n✅ Roster sync complete!');
}

// Run sync
syncRostersResume().catch(error => {
  console.error('Roster sync failed:', error);
  process.exit(1);
});

