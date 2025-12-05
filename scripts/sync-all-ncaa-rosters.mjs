// Sync ALL NCAA men's basketball teams and rosters to database
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const BATCH_SIZE = 50;
const DELAY_MS = 500; // 500ms between requests to be nice to ESPN

console.log('🏀 Syncing ALL NCAA Men\'s Basketball Rosters\n');
console.log('='.repeat(70));

const stats = {
  totalTeams: 0,
  totalPlayers: 0,
  savedPlayers: 0,
  errors: 0,
  startTime: Date.now(),
};

/**
 * Fetch all NCAA men's basketball teams
 */
async function fetchAllTeams() {
  console.log('📋 Fetching all NCAA teams...\n');
  
  try {
    const url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=400';
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      console.error(`❌ ESPN teams API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.sports || !data.sports[0] || !data.sports[0].leagues || !data.sports[0].leagues[0].teams) {
      console.error('❌ Unexpected ESPN API structure');
      console.log('Response structure:', JSON.stringify(data, null, 2).substring(0, 500));
      return [];
    }
    
    const teams = data.sports[0].leagues[0].teams.map(t => ({
      id: t.team.id,
      name: t.team.displayName || t.team.name,
      abbreviation: t.team.abbreviation,
      conference: t.team.groups?.name || null,
    }));
    
    console.log(`✅ Found ${teams.length} NCAA teams\n`);
    stats.totalTeams = teams.length;
    
    return teams;
  } catch (error) {
    console.error('❌ Error fetching teams:', error.message);
    return [];
  }
}

/**
 * Fetch roster for a specific team
 */
async function fetchTeamRoster(teamId, teamName) {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}/roster`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        // Some teams don't have rosters yet (new teams, etc.)
        return [];
      }
      console.error(`❌ Roster API error for ${teamName}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.athletes || data.athletes.length === 0) {
      return [];
    }
    
    const players = data.athletes.map(athlete => ({
      espn_id: athlete.id?.toString() || null,
      full_name: athlete.displayName || athlete.fullName || athlete.name || 'Unknown',
      position: athlete.position?.abbreviation || athlete.position?.name || null,
      team_name: teamName,
      team_id: teamId, // Save the ESPN team ID!
      league: 'NCAA',
      source: 'espn',
      jersey: athlete.jersey || null,
      height: athlete.displayHeight || null,
      weight: athlete.displayWeight || null,
      class_year: athlete.experience?.displayValue || null,
    }));
    
    return players;
  } catch (error) {
    console.error(`❌ Error fetching roster for ${teamName}:`, error.message);
    stats.errors++;
    return [];
  }
}

/**
 * Save players to database in batches
 */
async function savePlayers(players) {
  if (players.length === 0) return;
  
  // Process in batches
  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE);
    
    try {
      const { error } = await supabase
        .from('prospects')
        .upsert(
          batch.map(p => ({
            espn_id: p.espn_id,
            full_name: p.full_name,
            position: p.position,
            team_name: p.team_name,
            team_id: p.team_id, // Save ESPN team ID
            league: p.league,
            source: p.source,
          })),
          {
            onConflict: 'espn_id',
            ignoreDuplicates: false, // Update existing records
          }
        );
      
      if (error) {
        console.error(`❌ Error saving batch:`, error.message);
        stats.errors++;
      } else {
        stats.savedPlayers += batch.length;
      }
    } catch (error) {
      console.error(`❌ Exception saving batch:`, error.message);
      stats.errors++;
    }
  }
}

/**
 * Main sync process
 */
async function main() {
  // 1. Fetch all teams
  const teams = await fetchAllTeams();
  
  if (teams.length === 0) {
    console.error('❌ No teams found, aborting');
    process.exit(1);
  }
  
  // 2. Fetch roster for each team
  console.log('📥 Fetching rosters for all teams...\n');
  
  const allPlayers = [];
  
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const progress = `[${i + 1}/${teams.length}]`;
    
    process.stdout.write(`${progress} ${team.name}...`);
    
    const roster = await fetchTeamRoster(team.id, team.name);
    
    if (roster.length > 0) {
      console.log(` ✅ ${roster.length} players`);
      allPlayers.push(...roster);
      stats.totalPlayers += roster.length;
    } else {
      console.log(` ⚠️  No roster data`);
    }
    
    // Progress update every 20 teams
    if ((i + 1) % 20 === 0) {
      const pct = ((i + 1) / teams.length * 100).toFixed(1);
      console.log(`\n📊 Progress: ${pct}% (${allPlayers.length} players so far)\n`);
    }
    
    // Delay between requests
    if (i < teams.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
  
  // 3. Save all players
  console.log(`\n💾 Saving ${allPlayers.length} players to database...\n`);
  await savePlayers(allPlayers);
  
  // 4. Print summary
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  
  console.log('\n' + '='.repeat(70));
  console.log('SYNC COMPLETE\n');
  console.log(`⏱️  Time elapsed: ${elapsed}s`);
  console.log(`🏫 Teams processed: ${stats.totalTeams}`);
  console.log(`👤 Players found: ${stats.totalPlayers}`);
  console.log(`💾 Players saved: ${stats.savedPlayers}`);
  console.log(`❌ Errors: ${stats.errors}`);
  
  if (stats.errors === 0 && stats.savedPlayers > 0) {
    console.log('\n✅ All NCAA rosters synced successfully!');
  } else if (stats.savedPlayers > 0) {
    console.log('\n⚠️  Sync completed with some errors');
  } else {
    console.log('\n❌ Sync failed - no players saved');
  }
  
  // 5. Verify database
  console.log('\n📋 Database summary:');
  const { count: espnCount } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'espn');
  
  const { count: intlCount } = await supabase
    .from('player_team_mappings')
    .select('*', { count: 'exact', head: true })
    .eq('season', 2025);
  
  console.log(`   College players: ${espnCount || 0}`);
  console.log(`   International players: ${intlCount || 0}`);
  console.log(`   Total: ${(espnCount || 0) + (intlCount || 0)}`);
  
  console.log('\n' + '='.repeat(70));
  console.log('🚀 Search is now INSTANT for all college players!');
  console.log('💡 Run this script weekly to keep rosters up to date.');
}

// Run the sync
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

