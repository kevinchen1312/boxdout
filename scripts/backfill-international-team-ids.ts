// Backfill script for international team IDs
// Links legacy international prospects (source: 'external') to international_teams table
// This enables games to load from international_team_schedules database instead of API calls

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Check for dry-run flag
const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  console.log('🔍 DRY-RUN MODE: No changes will be made to the database\n');
}

interface Prospect {
  id: string;
  full_name: string;
  team_name: string | null;
  league: string | null;
  source: string;
  international_team_id: string | null;
}

interface InternationalTeam {
  id: string;
  name: string;
  api_team_id: number;
  league_name: string | null;
}

// Helper function to normalize team name for matching (from import-and-add/route.ts)
function normalizeTeamNameForMatching(name: string): string {
  let normalized = (name || '')
    .toLowerCase()
    .trim();
  
  // Remove parenthetical content like "(France)", "(Spain)", etc.
  normalized = normalized.replace(/\s*\([^)]*\)/g, '');
  
  // Remove common suffixes
  normalized = normalized
    .replace(/\s+(basket|basketball|club|bc)$/i, '')
    .trim();
  
  // Remove all non-alphanumeric characters for comparison
  normalized = normalized.replace(/[^a-z0-9]/g, '');
  
  return normalized;
}

// Helper function to check if two team names match (from import-and-add/route.ts)
function teamNamesMatch(name1: string, name2: string): boolean {
  const normalized1 = normalizeTeamNameForMatching(name1);
  const normalized2 = normalizeTeamNameForMatching(name2);
  
  if (normalized1 === normalized2) return true;
  
  // Check if one contains the other (for variations like "Lyon-Villeurbanne" vs "Lyon")
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return true;
  }
  
  // Handle known variations
  const variations: Record<string, string[]> = {
    'asvel': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket', 'lyon-villeurbanne', 'asvelfrance'],
    'lyonvilleurbanne': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket', 'lyon-villeurbanne', 'asvelfrance'],
    'partizan': ['partizan', 'partizanmozzartbet', 'partizanmozzart', 'mozzartbet', 'kkpartizan', 'partizanbelgrade'],
    'partizanmozzartbet': ['partizan', 'partizanmozzartbet', 'partizanmozzart', 'mozzartbet', 'kkpartizan', 'partizanbelgrade'],
  };
  
  // Check if normalized names match any variation group
  for (const [base, vars] of Object.entries(variations)) {
    const matches1 = vars.some(v => {
      const vNormalized = normalizeTeamNameForMatching(v);
      return normalized1 === vNormalized || normalized1.includes(vNormalized) || vNormalized.includes(normalized1);
    });
    const matches2 = vars.some(v => {
      const vNormalized = normalizeTeamNameForMatching(v);
      return normalized2 === vNormalized || normalized2.includes(vNormalized) || vNormalized.includes(normalized2);
    });
    if (matches1 && matches2) {
      return true;
    }
  }
  
  return false;
}

// Find international team ID for a prospect's team name
async function findInternationalTeamId(
  teamName: string,
  allTeams: InternationalTeam[],
  debug: boolean = false
): Promise<string | null> {
  const normalizedTeamName = normalizeTeamNameForMatching(teamName);
  
  // National team names to exclude from matching
  const nationalTeamNames = ['france', 'spain', 'serbia', 'germany', 'italy', 'greece', 'turkey', 'croatia', 'slovenia'];
  
  // Known team mappings with specific API team IDs (from loadSchedulesFromApiBasketball.ts)
  // These are the correct team IDs we should look for
  const knownTeamMappings: Record<string, number[]> = {
    'asvel': [26], // ASVEL team ID in API Basketball
    'lyonvilleurbanne': [26],
    'lyon': [26],
    'partizan': [1068], // Partizan team ID
    'partizanmozzartbet': [1068],
    'chalon': [20], // Chalon/Saone
    'chalonsaone': [20],
  };
  
  // Check if we have a known mapping for this team
  const knownTeamId = knownTeamMappings[normalizedTeamName];
  if (knownTeamId) {
    const mappedTeam = allTeams.find(t => knownTeamId.includes(t.api_team_id));
    if (mappedTeam) {
      if (debug) console.log(`   Found via known mapping: ${teamName} → ${mappedTeam.name} (API ID: ${mappedTeam.api_team_id})`);
      return mappedTeam.id;
    }
  }
  
  // Try variations first (most specific)
  // For known teams, ONLY match if API team ID exists in database
  // Don't fall back to loose name matching for known teams
  const variations: string[] = [];
  if (normalizedTeamName.includes('asvel') || normalizedTeamName.includes('lyon') || normalizedTeamName.includes('villeurbanne')) {
    // Only try to find by API team ID 26 - don't use name matching for ASVEL
    const asvelTeam = allTeams.find(t => t.api_team_id === 26);
    if (asvelTeam) {
      if (debug) console.log(`   Found ASVEL via API ID 26: ${asvelTeam.name}`);
      return asvelTeam.id;
    } else {
      if (debug) console.log(`   ASVEL (API ID 26) not found in database - skipping name match`);
      return null; // Don't try to match ASVEL by name if API ID doesn't exist
    }
  }
  if (normalizedTeamName.includes('partizan') || normalizedTeamName.includes('mozzart')) {
    // Only try to find by API team ID 1068 - don't use name matching for Partizan
    const partizanTeam = allTeams.find(t => t.api_team_id === 1068);
    if (partizanTeam) {
      if (debug) console.log(`   Found Partizan via API ID 1068: ${partizanTeam.name}`);
      return partizanTeam.id;
    } else {
      if (debug) console.log(`   Partizan (API ID 1068) not found in database - skipping name match`);
      return null; // Don't try to match Partizan by name if API ID doesn't exist
    }
  }
  if (normalizedTeamName.includes('realmadrid')) {
    variations.push('Real Madrid', 'Real Madrid Basketball', 'Real Madrid CF');
  }
  if (normalizedTeamName.includes('chalon') || normalizedTeamName.includes('saone')) {
    variations.push('Chalon', 'Chalon/Saone', 'Elan Chalon', 'Chalon-sur-Saone');
    // Also try to find by API team ID 20
    const chalonTeam = allTeams.find(t => t.api_team_id === 20);
    if (chalonTeam) {
      if (debug) console.log(`   Found Chalon via API ID 20: ${chalonTeam.name}`);
      return chalonTeam.id;
    }
  }
  
  // Try each variation - be very strict
  // For ASVEL variations, require the team name to actually contain "ASVEL" or "LDLC"
  // Exclude national teams (countries) from variation matching
  for (const variation of variations) {
    const varMatch = allTeams.find(t => {
      const tNameLower = t.name.toLowerCase();
      const variationLower = variation.toLowerCase();
      
      // Skip national teams
      if (nationalTeamNames.includes(tNameLower)) return false;
      
      // For ASVEL variations, require exact keyword match
      if (variationLower.includes('asvel') || variationLower.includes('ldlc')) {
        return tNameLower.includes('asvel') || tNameLower.includes('ldlc');
      }
      
      // For Partizan variations, require exact keyword match
      if (variationLower.includes('partizan')) {
        return tNameLower.includes('partizan');
      }
      
      // For other variations, use teamNamesMatch
      return teamNamesMatch(variation, t.name);
    });
    
    if (varMatch) {
      if (debug) console.log(`   Found via variation "${variation}": ${varMatch.name}`);
      return varMatch.id;
    }
  }
  
  // Filter out national teams (countries) - prioritize club teams
  const clubTeams = allTeams.filter(t => {
    const tNameLower = t.name.toLowerCase();
    return !nationalTeamNames.includes(tNameLower);
  });
  
  // Try matching against club teams using teamNamesMatch
  const exactMatch = clubTeams.filter(t => 
    teamNamesMatch(teamName, t.name)
  );
  
  if (exactMatch.length > 0) {
    if (debug) console.log(`   Found via exact match: ${exactMatch[0].name}`);
    return exactMatch[0].id;
  }
  
  // Last resort: try simple case-insensitive contains match on club teams only
  // But be more strict - require at least 4 characters match
  const teamNameLower = teamName.toLowerCase();
  const simpleMatch = clubTeams.find(t => {
    const tNameLower = t.name.toLowerCase();
    // Require substantial match (at least 4 chars or full word)
    const matchLength = Math.min(teamNameLower.length, tNameLower.length);
    if (matchLength < 4) return false;
    return tNameLower.includes(teamNameLower) || teamNameLower.includes(tNameLower);
  });
  
  if (simpleMatch) {
    if (debug) console.log(`   Found via simple match: ${simpleMatch.name}`);
    return simpleMatch.id;
  }
  
  return null;
}

async function main() {
  console.log('🚀 Starting backfill of international_team_id for legacy prospects...\n');
  
  // Fetch all international prospects missing international_team_id
  // Include all sources (external, international-roster, etc.) as long as they're international players
  console.log('📋 Fetching unmatched international prospects...');
  const { data: prospects, error: prospectsError } = await supabase
    .from('prospects')
    .select('id, full_name, team_name, league, source, international_team_id')
    .is('international_team_id', null)
    .not('team_name', 'is', null)
    .neq('league', 'NCAA') // Exclude college players
    .order('full_name');
  
  if (prospectsError) {
    console.error('❌ Error fetching prospects:', prospectsError);
    process.exit(1);
  }
  
  if (!prospects || prospects.length === 0) {
    console.log('✅ No unmatched international prospects found. All done!');
    process.exit(0);
  }
  
  console.log(`   Found ${prospects.length} unmatched international prospect(s)\n`);
  
  // Fetch all international teams for matching (with pagination to get all 2406 teams)
  // IMPORTANT: Supabase has a default limit of 1000 rows, so we MUST paginate to get all teams
  // Without pagination, only the first 1000 teams would be fetched, missing teams like ASVEL and Partizan
  console.log('📋 Fetching international teams (with pagination to get all teams)...');
  
  // First, get total count to verify we fetch everything
  const { count: totalCount } = await supabase
    .from('international_teams')
    .select('*', { count: 'exact', head: true });
  
  let allTeams: InternationalTeam[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;
  let pageCount = 0;
  
  while (hasMore) {
    pageCount++;
    const { data: teams, error: teamsError } = await supabase
      .from('international_teams')
      .select('id, name, api_team_id, league_name')
      .order('name')
      .range(from, from + pageSize - 1);
    
    if (teamsError) {
      console.error('❌ Error fetching international teams:', teamsError);
      process.exit(1);
    }
    
    if (teams && teams.length > 0) {
      allTeams.push(...teams);
      from += pageSize;
      hasMore = teams.length === pageSize;
    } else {
      hasMore = false;
    }
  }
  
  const teams = allTeams;
  
  if (teams.length === 0) {
    console.error('❌ No international teams found in database');
    process.exit(1);
  }
  
  // Verify we got all teams
  if (totalCount && teams.length !== totalCount) {
    console.warn(`⚠️  WARNING: Expected ${totalCount} teams but fetched ${teams.length}. Some teams may be missing!`);
  } else {
    console.log(`   ✅ Successfully fetched ALL ${teams.length} international team(s) from database (verified against total count: ${totalCount})\n`);
  }
  
  // Process each prospect
  const results = {
    processed: 0,
    matched: 0,
    updated: 0,
    unmatched: [] as Array<{ id: string; name: string; team: string }>,
    errors: [] as Array<{ id: string; name: string; team: string; error: string }>,
  };
  
  console.log('🔄 Processing prospects...\n');
  
  for (const prospect of prospects as Prospect[]) {
    results.processed++;
    
    if (!prospect.team_name) {
      console.log(`⏭️  Skipping ${prospect.full_name} - no team name`);
      continue;
    }
    
    const teamId = await findInternationalTeamId(prospect.team_name, teams as InternationalTeam[], false);
    
    if (!teamId) {
      results.unmatched.push({
        id: prospect.id,
        name: prospect.full_name,
        team: prospect.team_name,
      });
      console.log(`❌ No match: ${prospect.full_name} (${prospect.team_name})`);
      continue;
    }
    
    const matchedTeam = teams.find(t => t.id === teamId);
    results.matched++;
    
    if (isDryRun) {
      console.log(`✅ [DRY-RUN] Would update: ${prospect.full_name} (${prospect.team_name}) → ${matchedTeam?.name} (ID: ${teamId})`);
    } else {
      // Update prospect with international_team_id
      const { error: updateError } = await supabase
        .from('prospects')
        .update({ international_team_id: teamId })
        .eq('id', prospect.id);
      
      if (updateError) {
        results.errors.push({
          id: prospect.id,
          name: prospect.full_name,
          team: prospect.team_name,
          error: updateError.message,
        });
        console.log(`❌ Error updating ${prospect.full_name}: ${updateError.message}`);
      } else {
        results.updated++;
        console.log(`✅ Updated: ${prospect.full_name} (${prospect.team_name}) → ${matchedTeam?.name} (ID: ${teamId})`);
      }
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total prospects processed: ${results.processed}`);
  console.log(`Successfully matched: ${results.matched}`);
  if (!isDryRun) {
    console.log(`Successfully updated: ${results.updated}`);
    if (results.errors.length > 0) {
      console.log(`Errors: ${results.errors.length}`);
    }
  }
  console.log(`Unmatched: ${results.unmatched.length}`);
  
  if (results.unmatched.length > 0) {
    console.log('\n⚠️  Unmatched prospects (need manual review):');
    results.unmatched.forEach(p => {
      console.log(`   - ${p.name} (${p.team})`);
    });
  }
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(e => {
      console.log(`   - ${e.name} (${e.team}): ${e.error}`);
    });
  }
  
  if (isDryRun) {
    console.log('\n💡 Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ Backfill complete!');
  }
  
  console.log('='.repeat(80));
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

