#!/usr/bin/env ts-node

/**
 * Backfill script to fetch and cache team logos for existing games
 * 
 * This script:
 * 1. Queries all unique teams from games in the database
 * 2. Fetches team logos from API-Basketball
 * 3. Caches logos to the team_logos table
 * 
 * Usage:
 *   npx ts-node scripts/backfill-team-logos.ts [--limit=N] [--source=api-basketball|espn]
 * 
 * Options:
 *   --limit=N           Limit processing to N teams (default: all)
 *   --source=SOURCE     Process only teams from specific source (default: all)
 *   --dry-run           Show what would be done without making changes
 */

import { supabaseAdmin } from '../lib/supabase';
import { fetchLogoFromApiBasketball, bulkCacheTeamLogos } from '../lib/teamLogoService';

interface TeamToProcess {
  teamId: number;
  teamName: string;
  source: 'api-basketball' | 'espn';
  gamesCount: number;
}

async function getUniqueTeamsFromGames(): Promise<TeamToProcess[]> {
  console.log('\n📊 Fetching unique teams from games...\n');
  
  try {
    // Query unique teams from player_team_mappings (international teams)
    const { data: intlTeams, error: intlError } = await supabaseAdmin
      .from('player_team_mappings')
      .select('team_id, team_name')
      .not('team_id', 'is', null)
      .order('team_id');

    if (intlError) {
      console.error('❌ Error fetching international teams:', intlError);
      return [];
    }

    // Deduplicate by team_id
    const teamMap = new Map<number, TeamToProcess>();
    
    if (intlTeams) {
      intlTeams.forEach((team: any) => {
        if (team.team_id && !teamMap.has(team.team_id)) {
          teamMap.set(team.team_id, {
            teamId: team.team_id,
            teamName: team.team_name,
            source: 'api-basketball',
            gamesCount: 1, // Will be updated
          });
        } else if (team.team_id && teamMap.has(team.team_id)) {
          const existing = teamMap.get(team.team_id)!;
          existing.gamesCount++;
        }
      });
    }

    const teams = Array.from(teamMap.values());
    console.log(`✓ Found ${teams.length} unique teams`);
    
    return teams;
  } catch (error) {
    console.error('❌ Exception fetching teams:', error);
    return [];
  }
}

async function getTeamsWithoutLogos(teams: TeamToProcess[]): Promise<TeamToProcess[]> {
  console.log('\n🔍 Checking which teams already have cached logos...\n');
  
  try {
    const teamIds = teams.map(t => t.teamId);
    
    const { data: cachedLogos, error } = await supabaseAdmin
      .from('team_logos')
      .select('team_id')
      .in('team_id', teamIds);

    if (error) {
      console.error('❌ Error checking cached logos:', error);
      return teams; // Return all if check fails
    }

    const cachedTeamIds = new Set((cachedLogos || []).map((l: any) => l.team_id));
    const teamsWithoutLogos = teams.filter(t => !cachedTeamIds.has(t.teamId));
    
    console.log(`✓ ${cachedTeamIds.size} teams already have logos`);
    console.log(`✓ ${teamsWithoutLogos.length} teams need logos\n`);
    
    return teamsWithoutLogos;
  } catch (error) {
    console.error('❌ Exception checking cached logos:', error);
    return teams;
  }
}

async function fetchAndCacheLogos(
  teams: TeamToProcess[],
  dryRun: boolean = false
): Promise<{ success: number; failed: number }> {
  console.log(`\n🚀 ${dryRun ? '[DRY RUN] ' : ''}Fetching and caching logos for ${teams.length} teams...\n`);
  
  let successCount = 0;
  let failedCount = 0;
  const logosToCache: Array<{
    teamId: number;
    teamName: string;
    logoUrl: string;
    source: 'api-basketball' | 'espn';
  }> = [];

  // Process teams in batches to avoid rate limiting
  const batchSize = 10;
  const delayBetweenBatches = 2000; // 2 seconds

  for (let i = 0; i < teams.length; i += batchSize) {
    const batch = teams.slice(i, Math.min(i + batchSize, teams.length));
    
    console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(teams.length / batchSize)} (teams ${i + 1}-${Math.min(i + batchSize, teams.length)})...\n`);

    const batchPromises = batch.map(async (team) => {
      try {
        console.log(`  Fetching logo for ${team.teamName} (ID: ${team.teamId})...`);
        
        if (team.source === 'api-basketball') {
          const logoUrl = await fetchLogoFromApiBasketball(team.teamId);
          
          if (logoUrl) {
            console.log(`  ✓ Found logo for ${team.teamName}`);
            logosToCache.push({
              teamId: team.teamId,
              teamName: team.teamName,
              logoUrl,
              source: 'api-basketball',
            });
            return true;
          } else {
            console.log(`  ⚠ No logo found for ${team.teamName}`);
            return false;
          }
        } else {
          // ESPN teams - skip for now (would need different API)
          console.log(`  ⊘ Skipping ESPN team ${team.teamName}`);
          return false;
        }
      } catch (error) {
        console.error(`  ❌ Error fetching logo for ${team.teamName}:`, error instanceof Error ? error.message : error);
        return false;
      }
    });

    const results = await Promise.all(batchPromises);
    successCount += results.filter(r => r).length;
    failedCount += results.filter(r => !r).length;

    // Delay between batches to avoid rate limiting
    if (i + batchSize < teams.length) {
      console.log(`\n  ⏳ Waiting ${delayBetweenBatches / 1000}s before next batch...`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  // Cache all logos in bulk
  if (logosToCache.length > 0 && !dryRun) {
    console.log(`\n💾 Caching ${logosToCache.length} logos to database...\n`);
    const cached = await bulkCacheTeamLogos(logosToCache);
    console.log(`✓ Successfully cached ${cached} logos\n`);
  } else if (dryRun) {
    console.log(`\n[DRY RUN] Would cache ${logosToCache.length} logos\n`);
  }

  return { success: successCount, failed: failedCount };
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const sourceArg = args.find(arg => arg.startsWith('--source='));
  const dryRun = args.includes('--dry-run');
  
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
  const source = sourceArg ? sourceArg.split('=')[1] as 'api-basketball' | 'espn' : null;

  console.log('\n========================================');
  console.log('   Team Logo Backfill Script');
  console.log('========================================\n');
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  if (limit) {
    console.log(`📌 Limit: ${limit} teams\n`);
  }
  
  if (source) {
    console.log(`📌 Source: ${source}\n`);
  }

  // Step 1: Get all unique teams from games
  let teams = await getUniqueTeamsFromGames();
  
  if (teams.length === 0) {
    console.log('❌ No teams found. Exiting.\n');
    process.exit(1);
  }

  // Step 2: Filter by source if specified
  if (source) {
    teams = teams.filter(t => t.source === source);
    console.log(`✓ Filtered to ${teams.length} ${source} teams\n`);
  }

  // Step 3: Check which teams already have logos
  teams = await getTeamsWithoutLogos(teams);
  
  if (teams.length === 0) {
    console.log('✓ All teams already have logos! Nothing to do.\n');
    process.exit(0);
  }

  // Step 4: Apply limit if specified
  if (limit && teams.length > limit) {
    console.log(`📌 Limiting to first ${limit} teams\n`);
    teams = teams.slice(0, limit);
  }

  // Step 5: Fetch and cache logos
  const startTime = Date.now();
  const results = await fetchAndCacheLogos(teams, dryRun);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary
  console.log('\n========================================');
  console.log('   Summary');
  console.log('========================================\n');
  console.log(`✓ Successfully processed: ${results.success} teams`);
  console.log(`⚠ Failed/Skipped: ${results.failed} teams`);
  console.log(`⏱ Duration: ${duration}s\n`);

  if (dryRun) {
    console.log('🔍 This was a dry run. Run without --dry-run to apply changes.\n');
  }
}

// Run the script
main()
  .then(() => {
    console.log('✓ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed with error:', error);
    process.exit(1);
  });




