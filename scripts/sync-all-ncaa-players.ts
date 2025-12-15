/**
 * Script to fetch and store ALL NCAA players from all teams
 * Links players to their teams via espn_team_id for instant game loading
 * Run with: npx tsx scripts/sync-all-ncaa-players.ts
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

interface ESPNPlayer {
  id: string;
  fullName: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  jersey?: string | number;
  position?: {
    abbreviation?: string;
    name?: string;
  };
  height?: string;
  weight?: number;
  age?: number;
  injury?: any;
  injuries?: any[];
  status?: any;
  availability?: any;
}

interface ESPNTeamRoster {
  team: {
    id: string;
    displayName: string;
    name?: string;
  };
  athletes?: ESPNPlayer[];
}

/**
 * Fetch roster for a team from ESPN API
 */
async function fetchTeamRoster(espnTeamId: string): Promise<ESPNTeamRoster | null> {
  // Try current season first (2025), then 2026
  const seasons = ['2025', '2026'];
  
  for (const season of seasons) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${espnTeamId}?lang=en&region=us&season=${season}&enable=roster`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        if (response.status === 404 && season === '2026') {
          // Try next season
          continue;
        }
        return null;
      }

      const data = await response.json();
      
      // Check if we have athletes data
      if (data?.team?.athletes && Array.isArray(data.team.athletes) && data.team.athletes.length > 0) {
        return data as ESPNTeamRoster;
      }
      
      // If no athletes but response was OK, try next season
      if (season === '2025') {
        continue;
      }
      
      return data as ESPNTeamRoster;
    } catch (err) {
      console.error(`[Sync Players] Error fetching roster for team ${espnTeamId} (season ${season}):`, err);
      if (season === '2025') {
        continue; // Try next season
      }
      return null;
    }
  }
  
  return null;
}

/**
 * Extract injury status from player data
 */
function extractInjuryStatus(player: ESPNPlayer): 'OUT' | 'QUESTIONABLE' | 'DOUBTFUL' | 'PROBABLE' | null {
  const injuries = player.injuries;
  if (injuries && Array.isArray(injuries) && injuries.length > 0) {
    for (const inj of injuries) {
      const injuryText = (inj.status || inj.type || inj.name || inj.displayName || '').toUpperCase();
      if (injuryText.includes('OUT') || injuryText === 'OUT') {
        return 'OUT';
      } else if (injuryText.includes('QUESTIONABLE')) {
        return 'QUESTIONABLE';
      } else if (injuryText.includes('DOUBTFUL')) {
        return 'DOUBTFUL';
      } else if (injuryText.includes('PROBABLE')) {
        return 'PROBABLE';
      }
    }
  }
  
  if (player.injury) {
    const injuryStatusText = (player.injury.status || player.injury.type || player.injury.name || '').toUpperCase();
    if (injuryStatusText.includes('OUT')) return 'OUT';
    if (injuryStatusText.includes('QUESTIONABLE')) return 'QUESTIONABLE';
    if (injuryStatusText.includes('DOUBTFUL')) return 'DOUBTFUL';
    if (injuryStatusText.includes('PROBABLE')) return 'PROBABLE';
  }
  
  if (player.status) {
    const statusText = (player.status.type || player.status.name || player.status.displayName || '').toUpperCase();
    if (statusText.includes('OUT') || statusText === 'OUT') return 'OUT';
    if (statusText.includes('QUESTIONABLE')) return 'QUESTIONABLE';
    if (statusText.includes('DOUBTFUL')) return 'DOUBTFUL';
    if (statusText.includes('PROBABLE')) return 'PROBABLE';
  }
  
  return null;
}

/**
 * Get all NCAA teams from ESPN directory (same approach as sync-all-ncaa-teams.ts)
 */
async function getAllNCAATeams(): Promise<Array<{ id: string; name: string }>> {
  console.log('[Sync Players] Fetching all NCAA teams from ESPN directory...');
  
  const allTeams: Array<{ id: string; name: string }> = [];
  const TEAM_DIRECTORY_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams';
  
  // Try fetching with different limits/groups to get all teams
  const limits = [1000, 500, 300];
  const groups = [50, 80, 90]; // Different group IDs
  
  for (const limit of limits) {
    for (const group of groups) {
      try {
        const url = `${TEAM_DIRECTORY_BASE_URL}?groups=${group}&limit=${limit}`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
          },
          cache: 'no-store',
        });

        if (!response.ok) {
          continue; // Try next combination
        }

        const data = await response.json();
        const teams: Array<{ team?: any }> = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];

        for (const item of teams) {
          const team = item?.team ?? item;
          if (!team?.id) continue;

          // Check if we already have this team
          if (!allTeams.find(t => t.id === String(team.id))) {
            allTeams.push({
              id: String(team.id),
              name: team.displayName || team.name || '',
            });
          }
        }
      } catch (err) {
        // Continue to next combination
        continue;
      }
    }
  }
  
  // Also try without groups parameter to get all teams
  try {
    const url = `${TEAM_DIRECTORY_BASE_URL}?limit=1000`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    });

    if (response.ok) {
      const data = await response.json();
      const teams: Array<{ team?: any }> = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];

      for (const item of teams) {
        const team = item?.team ?? item;
        if (!team?.id) continue;

        // Check if we already have this team
        if (!allTeams.find(t => t.id === String(team.id))) {
          allTeams.push({
            id: String(team.id),
            name: team.displayName || team.name || '',
          });
        }
      }
    }
  } catch (err) {
    // Continue
  }

  console.log(`[Sync Players] Found ${allTeams.length} unique NCAA teams\n`);
  return allTeams;
}

async function main() {
  console.log('[Sync Players] Starting comprehensive NCAA player sync...\n');
  
  try {
    // Get all teams from ESPN directory (all 362 teams)
    const teams = await getAllNCAATeams();
    
    let totalPlayers = 0;
    let totalUpdated = 0;
    let totalCreated = 0;
    let totalErrors = 0;
    let teamsProcessed = 0;
    
    // Process teams in batches
    const batchSize = 5;
    for (let i = 0; i < teams.length; i += batchSize) {
      const batch = teams.slice(i, i + batchSize);
      
      console.log(`[Sync Players] Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(teams.length / batchSize)} (teams ${i + 1}-${Math.min(i + batchSize, teams.length)})...`);
      
      await Promise.all(batch.map(async (team) => {
        try {
          const rosterData = await fetchTeamRoster(team.id);
          
          if (!rosterData) {
            console.log(`  ⚠️ ${team.name} (${team.id}) - Failed to fetch roster`);
            return;
          }
          
          // Access athletes from the correct path: data.team.athletes
          const athletes = (rosterData as any)?.team?.athletes || [];
          
          if (!athletes || athletes.length === 0) {
            console.log(`  ⚠️ ${team.name} (${team.id}) - No athletes in roster`);
            return;
          }
          let teamPlayersProcessed = 0;
          
          for (const athlete of athletes) {
            const fullName = athlete.fullName || athlete.displayName;
            if (!fullName) continue;
            
            const jersey = athlete.jersey ? String(athlete.jersey) : null;
            const position = athlete.position?.abbreviation || athlete.position?.name || null;
            const height = athlete.height || null;
            const injuryStatus = extractInjuryStatus(athlete);
            
            // Use ESPN player ID directly (or generate one if missing)
            // Always include team ID in generated ID to ensure uniqueness across teams
            const espnPlayerId = athlete.id ? String(athlete.id) : `team-${team.id}-player-${fullName.toLowerCase().replace(/\s+/g, '-')}`;
            
            // Parse first/last name
            const nameParts = fullName.split(' ');
            const firstName = nameParts[0] || null;
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
            
            // Extract class/year if available
            const classYear = athlete.class || null;
            
            // Check if player already exists in espn_players table
            const { data: existing } = await supabase
              .from('espn_players')
              .select('id')
              .eq('espn_player_id', espnPlayerId)
              .eq('espn_team_id', team.id)
              .maybeSingle();
            
            if (existing) {
              // Update existing player
              const { error: updateError } = await supabase
                .from('espn_players')
                .update({ 
                  full_name: fullName,
                  first_name: firstName,
                  last_name: lastName,
                  position: position,
                  jersey_number: jersey,
                  height: height,
                  class: classYear,
                })
                .eq('id', existing.id);
              
              if (!updateError) {
                totalUpdated++;
                teamPlayersProcessed++;
              } else {
                totalErrors++;
                if (totalErrors <= 10) { // Log first 10 errors for debugging
                  console.error(`    [Error] Failed to update player ${fullName} (ID: ${espnPlayerId}, Team: ${team.id}):`, updateError.message || updateError);
                }
              }
            } else {
              // Insert new player
              const { error: insertError } = await supabase
                .from('espn_players')
                .insert({
                  espn_player_id: espnPlayerId,
                  espn_team_id: team.id,
                  full_name: fullName,
                  first_name: firstName,
                  last_name: lastName,
                  position: position,
                  jersey_number: jersey,
                  height: height,
                  class: classYear,
                  league: 'ncaa',
                });
              
              if (!insertError) {
                totalCreated++;
                teamPlayersProcessed++;
              } else {
                totalErrors++;
                if (totalErrors <= 10) { // Log first 10 errors for debugging
                  console.error(`    [Error] Failed to insert player ${fullName} (ID: ${espnPlayerId}, Team: ${team.id}):`, insertError.message || insertError);
                }
              }
            }
            
            totalPlayers++; // Count all players processed, regardless of success
          }
          
          if (teamPlayersProcessed > 0) {
            console.log(`  ✓ ${team.name} (${team.id}) - ${teamPlayersProcessed} players processed`);
          }
          teamsProcessed++;
          
        } catch (err) {
          totalErrors++;
          console.error(`  ✗ ${team.name} (${team.id}) - Error:`, err);
        }
      }));
      
      // Small delay between batches
      if (i + batchSize < teams.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log('\n[Sync Players] ✅ Sync complete!');
    console.log(`[Sync Players] Summary:`);
    console.log(`  - Teams processed: ${teamsProcessed}/${teams.length}`);
    console.log(`  - Total players processed: ${totalPlayers}`);
    console.log(`  - Players created: ${totalCreated}`);
    console.log(`  - Players updated: ${totalUpdated}`);
    console.log(`  - Errors: ${totalErrors}`);
    
  } catch (error) {
    console.error('[Sync Players] Fatal error:', error);
    process.exit(1);
  }
}

main();

