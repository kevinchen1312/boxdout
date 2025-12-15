/**
 * Script to backfill NCAA and NBL team schedules for existing prospects
 * Run with: npx tsx scripts/backfill-ncaa-nbl-schedules.ts
 */

import { config } from 'dotenv';
import * as path from 'path';

// Load environment variables FIRST before any other imports
config({ path: path.resolve(process.cwd(), '.env.local') });

// Verify env vars are loaded
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables. Make sure .env.local exists.');
  process.exit(1);
}

// Use dynamic imports to avoid loading modules that initialize Supabase at module load
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('[Backfill] Starting NCAA/NBL schedule backfill...\n');
  
  try {
    // Dynamically import modules that might initialize Supabase
    const { syncNCAATeamSchedule, syncNBLTeamSchedule } = await import('../lib/syncESPNTeamSchedules');
    const { getNBLTeamId, isNBLProspect } = await import('../lib/loadNBLFromESPN');
    const { getTeamDirectory, findTeamEntryInDirectory } = await import('../lib/loadSchedules');
    
    // Get all prospects that might be NCAA or NBL
    // These are prospects with source='espn' or prospects without international_team_id
    const { data: prospects, error } = await supabase
      .from('prospects')
      .select('id, full_name, team_name, espn_team_id, source, international_team_id')
      .or('source.eq.espn,and(source.is.null,international_team_id.is.null)');
    
    if (error) {
      throw error;
    }
    
    if (!prospects || prospects.length === 0) {
      console.log('[Backfill] No prospects found to process');
      return;
    }
    
    console.log(`[Backfill] Found ${prospects.length} prospects to process\n`);
    
    // Load team directory for NCAA lookups
    console.log('[Backfill] Loading team directory...');
    const teamDirectory = await getTeamDirectory();
    console.log(`[Backfill] Loaded ${teamDirectory.size} teams from directory\n`);
    
    // Track unique ESPN team IDs
    const ncaaTeamIds = new Set<string>();
    const nblTeamIds = new Set<string>();
    const prospectsToUpdate: Array<{ id: string; espn_team_id: string }> = [];
    
    // Process each prospect
    for (const prospect of prospects) {
      // Skip if already has international_team_id (international player)
      if (prospect.international_team_id) {
        continue;
      }
      
      // Skip if already has espn_team_id
      if (prospect.espn_team_id) {
        // Already has team ID, add to sync list
        const teamName = prospect.team_name || '';
        if (isNBLProspect({ team: teamName, teamDisplay: teamName } as any)) {
          nblTeamIds.add(prospect.espn_team_id);
        } else {
          ncaaTeamIds.add(prospect.espn_team_id);
        }
        continue;
      }
      
      // Need to look up ESPN team ID
      const teamName = prospect.team_name || '';
      if (!teamName) {
        console.log(`[Backfill] Skipping ${prospect.full_name} - no team name`);
        continue;
      }
      
      let espnTeamId: string | undefined;
      
      // Check if it's an NBL team
      if (isNBLProspect({ team: teamName, teamDisplay: teamName } as any)) {
        espnTeamId = getNBLTeamId(teamName);
        if (espnTeamId) {
          nblTeamIds.add(espnTeamId);
          prospectsToUpdate.push({ id: prospect.id, espn_team_id: espnTeamId });
          console.log(`[Backfill] Found NBL team ID for ${prospect.full_name} (${teamName}): ${espnTeamId}`);
        } else {
          console.log(`[Backfill] ⚠️ Could not find NBL team ID for ${prospect.full_name} (${teamName})`);
        }
      } else {
        // Try to find NCAA team in directory
        const matchedTeam = findTeamEntryInDirectory(teamDirectory, teamName);
        if (matchedTeam?.id) {
          espnTeamId = matchedTeam.id;
          ncaaTeamIds.add(espnTeamId);
          prospectsToUpdate.push({ id: prospect.id, espn_team_id: espnTeamId });
          console.log(`[Backfill] Found NCAA team ID for ${prospect.full_name} (${teamName}): ${espnTeamId}`);
        } else {
          console.log(`[Backfill] ⚠️ Could not find NCAA team ID for ${prospect.full_name} (${teamName})`);
        }
      }
    }
    
    // Update prospects with espn_team_id
    if (prospectsToUpdate.length > 0) {
      console.log(`\n[Backfill] Updating ${prospectsToUpdate.length} prospects with espn_team_id...`);
      for (const update of prospectsToUpdate) {
        const { error: updateError } = await supabase
          .from('prospects')
          .update({ espn_team_id: update.espn_team_id })
          .eq('id', update.id);
        
        if (updateError) {
          console.error(`[Backfill] Failed to update prospect ${update.id}:`, updateError);
        }
      }
      console.log(`[Backfill] ✅ Updated ${prospectsToUpdate.length} prospects\n`);
    }
    
    // Sync NCAA schedules
    if (ncaaTeamIds.size > 0) {
      console.log(`[Backfill] Syncing ${ncaaTeamIds.size} NCAA team schedules...`);
      let totalSynced = 0;
      let totalErrors = 0;
      
      for (const teamId of Array.from(ncaaTeamIds)) {
        try {
          console.log(`[Backfill] Syncing NCAA team ${teamId}...`);
          const result = await syncNCAATeamSchedule(teamId);
          totalSynced += result.synced;
          totalErrors += result.errors;
        } catch (err) {
          console.error(`[Backfill] Error syncing NCAA team ${teamId}:`, err);
          totalErrors++;
        }
      }
      
      console.log(`\n[Backfill] NCAA sync complete: ${totalSynced} games synced, ${totalErrors} errors\n`);
    }
    
    // Sync NBL schedules
    if (nblTeamIds.size > 0) {
      console.log(`[Backfill] Syncing ${nblTeamIds.size} NBL team schedules...`);
      let totalSynced = 0;
      let totalErrors = 0;
      
      for (const teamId of Array.from(nblTeamIds)) {
        try {
          console.log(`[Backfill] Syncing NBL team ${teamId}...`);
          const result = await syncNBLTeamSchedule(teamId);
          totalSynced += result.synced;
          totalErrors += result.errors;
        } catch (err) {
          console.error(`[Backfill] Error syncing NBL team ${teamId}:`, err);
          totalErrors++;
        }
      }
      
      console.log(`\n[Backfill] NBL sync complete: ${totalSynced} games synced, ${totalErrors} errors\n`);
    }
    
    console.log('[Backfill] ✅ Backfill complete!');
    console.log(`[Backfill] Summary:`);
    console.log(`  - NCAA teams: ${ncaaTeamIds.size}`);
    console.log(`  - NBL teams: ${nblTeamIds.size}`);
    console.log(`  - Prospects updated: ${prospectsToUpdate.length}`);
    
  } catch (error) {
    console.error('[Backfill] Fatal error:', error);
    process.exit(1);
  }
}

main();

