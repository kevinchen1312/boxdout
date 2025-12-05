// Audit script for international players
// Reports on team associations, game counts, logo status, and identifies issues

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

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

// Load TEAM_ID_MAPPINGS from the actual file
const TEAM_ID_MAPPINGS_PATH = path.join(process.cwd(), 'lib', 'loadSchedulesFromApiBasketball.ts');

interface TeamMapping {
  teamId: number;
  leagueIds?: number[];
  leagueName?: string;
  seasonFormat?: string;
  lnbTeamId?: number;
}

interface AuditResult {
  prospectId: string;
  name: string;
  team: string;
  teamId: number | null;
  league: string;
  source: string;
  issues: string[];
  status: 'ok' | 'warning' | 'error';
  gameCount: number;
  gamesWithLogos: number;
  gamesWithoutLogos: number;
  inMappings: boolean;
  apiSearchResult?: {
    found: boolean;
    suggestedTeamId?: number;
    suggestedTeamName?: string;
    country?: string;
  };
}

// Extract TEAM_ID_MAPPINGS from the TypeScript file
function extractTeamMappings(): Record<string, TeamMapping> {
  const fileContent = fs.readFileSync(TEAM_ID_MAPPINGS_PATH, 'utf-8');
  
  // Find the TEAM_ID_MAPPINGS object (using [\s\S] instead of . with s flag for ES5 compatibility)
  const mappingsRegex = /const TEAM_ID_MAPPINGS[^=]*=\s*{([\s\S]+?)};/;
  const match = fileContent.match(mappingsRegex);
  
  if (!match) {
    console.warn('Could not extract TEAM_ID_MAPPINGS from file');
    return {};
  }
  
  // Parse each mapping entry (this is a simplified parser)
  const mappings: Record<string, TeamMapping> = {};
  const lines = match[1].split('\n');
  
  for (const line of lines) {
    const entryMatch = line.match(/'([^']+)':\s*{([^}]+)}/);
    if (entryMatch) {
      const key = entryMatch[1];
      const value = entryMatch[2];
      
      // Extract teamId
      const teamIdMatch = value.match(/teamId:\s*(\d+)/);
      const leagueIdsMatch = value.match(/leagueIds:\s*\[([^\]]+)\]/);
      const seasonFormatMatch = value.match(/seasonFormat:\s*'([^']+)'/);
      
      if (teamIdMatch) {
        mappings[key] = {
          teamId: parseInt(teamIdMatch[1]),
          leagueIds: leagueIdsMatch 
            ? leagueIdsMatch[1].split(',').map(id => parseInt(id.trim()))
            : undefined,
          seasonFormat: seasonFormatMatch ? seasonFormatMatch[1] : undefined,
        };
      }
    }
  }
  
  return mappings;
}

// Search API-Basketball for a team
async function searchTeamInAPI(teamName: string): Promise<{
  found: boolean;
  suggestedTeamId?: number;
  suggestedTeamName?: string;
  country?: string;
}> {
  try {
    const searchUrl = `https://v1.basketball.api-sports.io/teams?search=${encodeURIComponent(teamName)}`;
    const response = await fetch(searchUrl, {
      headers: { 'x-apisports-key': apiKey! },
    });

    if (!response.ok) {
      return { found: false };
    }

    const data = await response.json();
    const teams = data.response || [];

    if (teams.length === 0) {
      return { found: false };
    }

    // Find best match
    const exactMatch = teams.find((t: any) =>
      t.name.toLowerCase() === teamName.toLowerCase()
    );
    const partialMatch = teams.find((t: any) =>
      t.name.toLowerCase().includes(teamName.toLowerCase()) ||
      teamName.toLowerCase().includes(t.name.toLowerCase())
    );

    const bestMatch = exactMatch || partialMatch || teams[0];

    return {
      found: true,
      suggestedTeamId: bestMatch.id,
      suggestedTeamName: bestMatch.name,
      country: bestMatch.country?.name,
    };
  } catch (error) {
    console.error(`API search error for ${teamName}:`, error);
    return { found: false };
  }
}

// Normalize team name for mapping lookup
function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function auditInternationalPlayers(): Promise<void> {
  console.log('🔍 Starting International Players Audit\n');
  console.log('Loading team mappings from source file...');
  
  const teamMappings = extractTeamMappings();
  console.log(`Found ${Object.keys(teamMappings).length} team mappings\n`);

  // Query all international prospects
  console.log('Querying international prospects from database...');
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('*')
    .or('source.eq.external,league.ilike.%Europe%,league.ilike.%French%,league.ilike.%Super League%,league.ilike.%Adriatic%,league.ilike.%ACB%,league.ilike.%ABA%');

  if (error) {
    console.error('Database error:', error);
    process.exit(1);
  }

  if (!prospects || prospects.length === 0) {
    console.log('No international prospects found');
    return;
  }

  console.log(`Found ${prospects.length} international prospects\n`);
  console.log('='.repeat(80));

  const results: AuditResult[] = [];

  for (const prospect of prospects) {
    console.log(`\n📊 Auditing: ${prospect.full_name} (${prospect.team_name})`);
    
    const issues: string[] = [];
    let status: 'ok' | 'warning' | 'error' = 'ok';

    // Check if team_id exists
    if (!prospect.team_id) {
      issues.push('Missing team_id in database');
      status = 'error';
    }

    // Check if team is in mappings
    const normalizedTeam = normalizeTeamName(prospect.team_name || '');
    const inMappings = normalizedTeam in teamMappings;
    
    if (!inMappings) {
      issues.push('Team not in TEAM_ID_MAPPINGS');
      if (status === 'ok') status = 'warning';
    } else {
      const mapping = teamMappings[normalizedTeam];
      
      // Check if mapping has season format
      if (!mapping.seasonFormat) {
        issues.push('Mapping missing seasonFormat field');
        if (status === 'ok') status = 'warning';
      }
      
      // Check if database team_id matches mapping
      if (prospect.team_id && prospect.team_id !== mapping.teamId) {
        issues.push(`team_id mismatch: DB has ${prospect.team_id}, mapping has ${mapping.teamId}`);
        status = 'error';
      }
    }

    // Query games for this prospect
    const { data: games } = await supabase
      .from('prospect_games')
      .select('*')
      .eq('prospect_id', prospect.id);

    const gameCount = games?.length || 0;
    const gamesWithLogos = games?.filter(g => g.home_team_logo && g.away_team_logo).length || 0;
    const gamesWithoutLogos = gameCount - gamesWithLogos;

    if (gameCount === 0) {
      issues.push('No games fetched');
      status = 'error';
    } else if (gameCount < 10) {
      issues.push(`Only ${gameCount} games (expected 15-50)`);
      if (status === 'ok') status = 'warning';
    }

    if (gamesWithoutLogos > 0) {
      issues.push(`${gamesWithoutLogos} games missing logos`);
      if (status === 'ok') status = 'warning';
    }

    // Search API for team (with rate limiting)
    let apiSearchResult;
    if (prospect.team_name) {
      console.log(`  🔎 Searching API for: ${prospect.team_name}`);
      apiSearchResult = await searchTeamInAPI(prospect.team_name);
      
      if (!apiSearchResult.found) {
        issues.push('Team not found in API-Basketball');
        status = 'error';
      } else if (prospect.team_id && apiSearchResult.suggestedTeamId !== prospect.team_id) {
        issues.push(`API suggests different team_id: ${apiSearchResult.suggestedTeamId} (${apiSearchResult.suggestedTeamName})`);
        if (status === 'ok') status = 'warning';
      }
      
      // Rate limiting - wait 1 second between API calls
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Log summary
    console.log(`  Status: ${status === 'ok' ? '✅' : status === 'warning' ? '⚠️' : '❌'}`);
    console.log(`  Games: ${gameCount} (${gamesWithLogos} with logos, ${gamesWithoutLogos} without)`);
    console.log(`  In Mappings: ${inMappings ? 'Yes' : 'No'}`);
    if (issues.length > 0) {
      console.log(`  Issues: ${issues.join(', ')}`);
    }

    results.push({
      prospectId: prospect.id,
      name: prospect.full_name,
      team: prospect.team_name || 'Unknown',
      teamId: prospect.team_id,
      league: prospect.league || 'Unknown',
      source: prospect.source || 'Unknown',
      issues,
      status,
      gameCount,
      gamesWithLogos,
      gamesWithoutLogos,
      inMappings,
      apiSearchResult,
    });
  }

  // Generate summary report
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 AUDIT SUMMARY\n');

  const errorCount = results.filter(r => r.status === 'error').length;
  const warningCount = results.filter(r => r.status === 'warning').length;
  const okCount = results.filter(r => r.status === 'ok').length;

  console.log(`Total Prospects: ${results.length}`);
  console.log(`✅ OK: ${okCount}`);
  console.log(`⚠️  Warnings: ${warningCount}`);
  console.log(`❌ Errors: ${errorCount}`);

  console.log('\n📊 Common Issues:');
  const issueFrequency = new Map<string, number>();
  results.forEach(r => {
    r.issues.forEach(issue => {
      issueFrequency.set(issue, (issueFrequency.get(issue) || 0) + 1);
    });
  });

  Array.from(issueFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([issue, count]) => {
      console.log(`  - ${issue}: ${count} prospects`);
    });

  // Save detailed report to file
  const reportPath = path.join(process.cwd(), 'international-players-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Detailed report saved to: ${reportPath}`);

  // Save summary by status
  console.log('\n🔴 PROSPECTS WITH ERRORS:');
  results
    .filter(r => r.status === 'error')
    .forEach(r => {
      console.log(`  - ${r.name} (${r.team}): ${r.issues.join('; ')}`);
    });

  console.log('\n⚠️  PROSPECTS WITH WARNINGS:');
  results
    .filter(r => r.status === 'warning')
    .forEach(r => {
      console.log(`  - ${r.name} (${r.team}): ${r.issues.join('; ')}`);
    });

  console.log('\n✅ Audit complete!');
}

// Run audit
auditInternationalPlayers().catch(error => {
  console.error('Audit failed:', error);
  process.exit(1);
});

