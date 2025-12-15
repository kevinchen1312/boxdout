/**
 * Script to sync NCAA and NBL team schedules from ESPN API to database
 * Run with: npx tsx scripts/sync-ncaa-nbl-schedules.ts
 */

import { config } from 'dotenv';
import * as path from 'path';
import { syncNCAATeamSchedule, syncNBLTeamSchedule } from '../lib/syncESPNTeamSchedules';
import { getNBLTeamId } from '../lib/loadNBLFromESPN';

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env.local') });

/**
 * Get all unique ESPN team IDs from prospects table
 * For NCAA: source='espn' and not NBL teams
 * For NBL: match by team name patterns
 */
async function getTeamIdsToSync() {
  const { createClient } = await import('@supabase/supabase-js');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Get all prospects with source='espn' (NCAA)
  const { data: ncaaProspects } = await supabase
    .from('prospects')
    .select('team_name, source')
    .eq('source', 'espn');
  
  // Get unique team names (we'll need to look up ESPN team IDs from team directory)
  const ncaaTeamNames = new Set<string>();
  if (ncaaProspects) {
    ncaaProspects.forEach((p: any) => {
      if (p.team_name) {
        ncaaTeamNames.add(p.team_name);
      }
    });
  }
  
  // Get NBL prospects
  const nblTeamIds = new Set<string>();
  if (ncaaProspects) {
    ncaaProspects.forEach((p: any) => {
      const teamName = p.team_name || '';
      const nblId = getNBLTeamId(teamName);
      if (nblId) {
        nblTeamIds.add(nblId);
      }
    });
  }
  
  return {
    ncaaTeamNames: Array.from(ncaaTeamNames),
    nblTeamIds: Array.from(nblTeamIds),
  };
}

async function main() {
  console.log('[Sync] Starting NCAA/NBL schedule sync...\n');
  
  try {
    const { ncaaTeamNames, nblTeamIds } = await getTeamIdsToSync();
    
    console.log(`[Sync] Found ${ncaaTeamNames.length} unique NCAA team names`);
    console.log(`[Sync] Found ${nblTeamIds.length} unique NBL team IDs\n`);
    
    // TODO: For NCAA, we need to look up ESPN team IDs from team directory
    // For now, this script requires manual team ID input or we need to add espn_team_id to prospects table
    console.log('[Sync] ⚠️  NCAA sync requires ESPN team IDs. Please add espn_team_id column to prospects table or provide team IDs manually.');
    console.log('[Sync] NCAA team names found:', ncaaTeamNames.slice(0, 10).join(', '), '...\n');
    
    // Sync NBL schedules
    if (nblTeamIds.length > 0) {
      console.log('[Sync] Syncing NBL schedules...');
      let totalSynced = 0;
      let totalErrors = 0;
      
      for (const teamId of nblTeamIds) {
        try {
          const result = await syncNBLTeamSchedule(teamId);
          totalSynced += result.synced;
          totalErrors += result.errors;
        } catch (err) {
          console.error(`[Sync] Error syncing NBL team ${teamId}:`, err);
          totalErrors++;
        }
      }
      
      console.log(`\n[Sync] NBL sync complete: ${totalSynced} games synced, ${totalErrors} errors\n`);
    }
    
    console.log('[Sync] Schedule sync complete!');
  } catch (error) {
    console.error('[Sync] Fatal error:', error);
    process.exit(1);
  }
}

main();


