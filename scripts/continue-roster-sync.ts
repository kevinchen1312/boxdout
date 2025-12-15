// Continue roster sync from Ironi Kiryat Ata onward
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;

if (!supabaseUrl || !supabaseKey || !apiKey) {
  console.error('Missing required environment variables');
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

async function fetchTeamRoster(teamId: number, season: string): Promise<Player[]> {
  const params = new URLSearchParams({
    team: String(teamId),
    season: season,
  });
  
  const url = `${BASE_URL}/players?${params.toString()}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey! },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.response || [];
  } catch (error) {
    console.error(`Error fetching roster for team ${teamId}:`, error);
    return [];
  }
}

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
        });
      
      if (!error) {
        storedCount++;
      }
    } catch (e) {
      // Skip on error
    }
  }
  
  return storedCount;
}

async function continueSync() {
  console.log('🔄 Continuing roster sync from Ironi Kiryat Ata onward...\n');
  console.log('='.repeat(80) + '\n');
  
  // Fetch teams that come AFTER "Ironi Kiryat Ata" alphabetically
  const { data: teams, error } = await supabase
    .from('international_teams')
    .select('id, api_team_id, name, league_name, season_format')
    .gt('name', 'Ironi Kiryat Ata')
    .order('name');
  
  if (error || !teams) {
    console.error('Error fetching teams:', error);
    process.exit(1);
  }
  
  console.log(`Found ${teams.length} teams to sync (after Ironi Kiryat Ata)\n`);
  
  let totalPlayersStored = 0;
  let teamsProcessed = 0;
  let teamsSkipped = 0;
  
  const currentYear = new Date().getFullYear();
  
  for (const team of teams) {
    console.log(`\n🏀 ${team.name} (League: ${team.league_name})`);
    
    // Check if this team already has a roster
    const { data: existingRoster } = await supabase
      .from('international_rosters')
      .select('id')
      .eq('team_id', team.id)
      .limit(1);
    
    if (existingRoster && existingRoster.length > 0) {
      console.log('   ⏭️  Already has roster, skipping');
      teamsSkipped++;
      continue;
    }
    
    // Determine season based on team's season format
    let seasonToFetch: string;
    if (team.season_format === 'YYYY-YYYY') {
      seasonToFetch = `${currentYear}-${currentYear + 1}`;
    } else {
      seasonToFetch = String(currentYear);
    }
    
    console.log(`   Fetching roster for season: ${seasonToFetch}`);
    
    const players = await fetchTeamRoster(team.api_team_id, seasonToFetch);
    
    if (players.length === 0) {
      console.log(`   ⚠️  No players found, skipping`);
      teamsSkipped++;
    } else {
      console.log(`   Found ${players.length} players`);
      const stored = await storePlayers(players, team.id, seasonToFetch);
      console.log(`   ✅ Stored ${stored} unique players`);
      totalPlayersStored += stored;
      teamsProcessed++;
    }
    
    // Rate limit: wait 1 second between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📈 CONTINUATION SUMMARY\n');
  console.log(`Teams processed: ${teamsProcessed}`);
  console.log(`Teams skipped: ${teamsSkipped}`);
  console.log(`Total new players stored: ${totalPlayersStored}`);
  console.log('\n✅ Roster continuation complete!');
}

continueSync().catch(error => {
  console.error('Continuation sync failed:', error);
  process.exit(1);
});





