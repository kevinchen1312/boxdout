/**
 * Script to sync ALL NBL teams and their schedules
 * Run with: npx tsx scripts/sync-all-nbl-teams.ts
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

import { syncNBLTeamSchedule } from '../lib/syncESPNTeamSchedules';

// All NBL team IDs (10 teams total)
const NBL_TEAM_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

async function main() {
  console.log('[Sync All NBL] Starting comprehensive NBL team schedule sync...\n');
  
  try {
    // Get all NBL team IDs
    const nblTeamIds = Array.from(new Set(NBL_TEAM_IDS.values()));
    
    console.log(`[Sync All NBL] Will sync schedules for ${nblTeamIds.length} NBL teams\n`);
    
    let totalSynced = 0;
    let totalErrors = 0;
    const errors: Array<{ teamId: string; error: string }> = [];
    
    for (const teamId of nblTeamIds) {
      try {
        console.log(`[Sync All NBL] Syncing team ${teamId}...`);
        const result = await syncNBLTeamSchedule(teamId);
        totalSynced += result.synced;
        totalErrors += result.errors;
        
        if (result.synced > 0) {
          console.log(`  ✓ Team ${teamId} - ${result.synced} games synced`);
        }
      } catch (err) {
        totalErrors++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push({ teamId, error: errorMsg });
        console.error(`  ✗ Team ${teamId} - Error: ${errorMsg}`);
      }
    }
    
    console.log('\n[Sync All NBL] ✅ Sync complete!');
    console.log(`[Sync All NBL] Summary:`);
    console.log(`  - Teams processed: ${nblTeamIds.length}`);
    console.log(`  - Total games synced: ${totalSynced}`);
    console.log(`  - Total errors: ${totalErrors}`);
    
    if (errors.length > 0) {
      console.log(`\n[Sync All NBL] Teams with errors:`);
      errors.forEach(e => {
        console.log(`  - Team ${e.teamId}: ${e.error}`);
      });
    }
    
  } catch (error) {
    console.error('[Sync All NBL] Fatal error:', error);
    process.exit(1);
  }
}

main();

