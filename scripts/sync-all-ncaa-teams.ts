/**
 * Script to sync ALL NCAA college basketball teams and their schedules
 * This syncs every team in the ESPN directory, not just ones with prospects
 * Run with: npx tsx scripts/sync-all-ncaa-teams.ts
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
import { syncNCAATeamSchedule } from '../lib/syncESPNTeamSchedules';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ESPN team directory URL - fetch all teams (may need multiple requests if >500)
const TEAM_DIRECTORY_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams';

async function getAllNCAATeams(): Promise<Array<{ id: string; name: string; displayName: string }>> {
  console.log('[Sync All] Fetching all NCAA teams from ESPN directory...');
  
  const allTeams: Array<{ id: string; name: string; displayName: string }> = [];
  
  // Try fetching with different limits/groups to get all teams
  // ESPN API may paginate or group teams differently
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
              name: team.name || team.displayName || '',
              displayName: team.displayName || team.name || '',
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
            name: team.name || team.displayName || '',
            displayName: team.displayName || team.name || '',
          });
        }
      }
    }
  } catch (err) {
    // Continue
  }

  console.log(`[Sync All] Found ${allTeams.length} unique NCAA teams\n`);
  return allTeams;
}

async function main() {
  console.log('[Sync All] Starting comprehensive NCAA team schedule sync...\n');
  
  try {
    // Get ALL teams from ESPN directory
    const allTeams = await getAllNCAATeams();
    
    if (allTeams.length === 0) {
      console.log('[Sync All] No teams found');
      return;
    }
    
    console.log(`[Sync All] Will sync schedules for ${allTeams.length} teams\n`);
    console.log('[Sync All] This may take a while...\n');
    
    let totalSynced = 0;
    let totalErrors = 0;
    let teamsProcessed = 0;
    const errors: Array<{ teamId: string; teamName: string; error: string }> = [];
    
    // Process teams in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < allTeams.length; i += batchSize) {
      const batch = allTeams.slice(i, i + batchSize);
      
      console.log(`[Sync All] Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(allTeams.length / batchSize)} (teams ${i + 1}-${Math.min(i + batchSize, allTeams.length)})...`);
      
      await Promise.all(batch.map(async (team) => {
        try {
          const result = await syncNCAATeamSchedule(team.id);
          totalSynced += result.synced;
          totalErrors += result.errors;
          teamsProcessed++;
          
          if (result.synced > 0) {
            console.log(`  ✓ ${team.displayName} (ID: ${team.id}) - ${result.synced} games synced`);
          }
        } catch (err) {
          totalErrors++;
          const errorMsg = err instanceof Error ? err.message : String(err);
          errors.push({ teamId: team.id, teamName: team.displayName, error: errorMsg });
          console.error(`  ✗ ${team.displayName} (ID: ${team.id}) - Error: ${errorMsg}`);
        }
      }));
      
      // Small delay between batches to be respectful to ESPN API
      if (i + batchSize < allTeams.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('\n[Sync All] ✅ Sync complete!');
    console.log(`[Sync All] Summary:`);
    console.log(`  - Teams processed: ${teamsProcessed}/${allTeams.length}`);
    console.log(`  - Total games synced: ${totalSynced}`);
    console.log(`  - Total errors: ${totalErrors}`);
    
    if (errors.length > 0) {
      console.log(`\n[Sync All] Teams with errors (${errors.length}):`);
      errors.slice(0, 20).forEach(e => {
        console.log(`  - ${e.teamName} (${e.teamId}): ${e.error}`);
      });
      if (errors.length > 20) {
        console.log(`  ... and ${errors.length - 20} more`);
      }
    }
    
  } catch (error) {
    console.error('[Sync All] Fatal error:', error);
    process.exit(1);
  }
}

main();

