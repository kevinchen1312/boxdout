// Discover which teams play in multiple leagues by querying API-Basketball
// This identifies teams in domestic leagues + international competitions (EuroLeague, EuroCup, BCL, etc.)

import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;

if (!supabaseUrl || !supabaseKey || !apiKey) {
  console.error('Missing credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BASE_URL = 'https://v1.basketball.api-sports.io';

// Major international competitions to check
const INTERNATIONAL_COMPETITIONS = [
  { id: 120, name: 'EuroLeague' },
  { id: 194, name: 'EuroCup' },
  { id: 119, name: 'Basketball Champions League (BCL)' },
  { id: 133, name: 'FIBA Europe Cup' },
  { id: 198, name: 'ABA League' },
  { id: 2, name: 'LNB Pro A' }, // French league (teams might also play BCL/EuroCup)
  { id: 117, name: 'Liga ACB' }, // Spanish league
];

interface TeamLeagues {
  teamId: number;
  teamName: string;
  primaryLeague: number;
  primaryLeagueName: string;
  additionalLeagues: Array<{ id: number; name: string; gameCount: number }>;
}

async function checkTeamInLeague(teamId: number, leagueId: number, season: string): Promise<number> {
  try {
    const params = new URLSearchParams({
      team: String(teamId),
      league: String(leagueId),
      season: season,
    });

    const response = await fetch(`${BASE_URL}/games?${params.toString()}`, {
      headers: { 'x-apisports-key': apiKey! },
    });

    const data = await response.json();
    return data.results || 0;
  } catch (error) {
    console.error(`Error checking team ${teamId} in league ${leagueId}:`, error);
    return 0;
  }
}

async function discoverMultiLeagueTeams(): Promise<void> {
  console.log('🔍 Discovering Multi-League Teams\n');
  console.log('='.repeat(80));
  console.log('This will check all teams against major international competitions');
  console.log('Expected time: 30-60 minutes due to API rate limits\n');

  // Fetch all teams from database
  const { data: teams, error } = await supabase
    .from('international_teams')
    .select('api_team_id, name, league_id, league_name')
    .order('name');

  if (error || !teams || teams.length === 0) {
    console.error('Error fetching teams:', error);
    process.exit(1);
  }

  console.log(`Found ${teams.length} teams to check\n`);

  const currentYear = new Date().getFullYear();
  const season = String(currentYear); // Try current season

  const multiLeagueTeams: TeamLeagues[] = [];
  let teamsChecked = 0;

  for (const team of teams) {
    teamsChecked++;
    console.log(`\n[${teamsChecked}/${teams.length}] 🏀 ${team.name} (Primary: ${team.league_name})`);

    const additionalLeagues: Array<{ id: number; name: string; gameCount: number }> = [];

    // Check each international competition
    for (const competition of INTERNATIONAL_COMPETITIONS) {
      // Skip if this is their primary league
      if (competition.id === team.league_id) {
        continue;
      }

      process.stdout.write(`   Checking ${competition.name}...`);
      
      const gameCount = await checkTeamInLeague(team.api_team_id, competition.id, season);
      
      if (gameCount > 0) {
        console.log(` ✅ ${gameCount} games`);
        additionalLeagues.push({
          id: competition.id,
          name: competition.name,
          gameCount,
        });
      } else {
        console.log(` -`);
      }

      // Rate limiting: 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (additionalLeagues.length > 0) {
      console.log(`   🎯 MULTI-LEAGUE TEAM: ${additionalLeagues.length} additional leagues`);
      multiLeagueTeams.push({
        teamId: team.api_team_id,
        teamName: team.name,
        primaryLeague: team.league_id,
        primaryLeagueName: team.league_name,
        additionalLeagues,
      });
    }
  }

  // Save results
  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 SUMMARY: Found ${multiLeagueTeams.length} multi-league teams\n`);

  if (multiLeagueTeams.length > 0) {
    // Generate TypeScript mapping
    const mappingCode = generateMappingCode(multiLeagueTeams);
    
    // Save to file
    const outputPath = path.join(process.cwd(), 'MULTI_LEAGUE_MAPPING.ts');
    fs.writeFileSync(outputPath, mappingCode);
    console.log(`✅ Saved mapping to: ${outputPath}\n`);

    // Print summary
    console.log('Multi-League Teams:');
    for (const team of multiLeagueTeams) {
      console.log(`\n🏀 ${team.teamName}`);
      console.log(`   Primary: ${team.primaryLeagueName} (${team.primaryLeague})`);
      console.log(`   Additional:`);
      for (const league of team.additionalLeagues) {
        console.log(`     - ${league.name} (${league.id}): ${league.gameCount} games`);
      }
    }
  } else {
    console.log('No multi-league teams found. This might indicate API issues or all teams only play in one league.');
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Discovery complete!\n');
}

function generateMappingCode(teams: TeamLeagues[]): string {
  let code = `// Auto-generated mapping of teams playing in multiple leagues
// Generated: ${new Date().toISOString()}
//
// This file can be imported into sync-international-schedules.ts

export const MULTI_LEAGUE_TEAMS: Record<number, number[]> = {
`;

  for (const team of teams) {
    const leagueIds = team.additionalLeagues.map(l => l.id).join(', ');
    const leagueNames = team.additionalLeagues.map(l => l.name).join(' + ');
    code += `  ${team.teamId}: [${leagueIds}], // ${team.teamName}: ${team.primaryLeagueName} + ${leagueNames}\n`;
  }

  code += `};\n\n`;
  code += `// Total: ${teams.length} teams playing in multiple leagues\n`;

  return code;
}

discoverMultiLeagueTeams().catch(error => {
  console.error('Discovery failed:', error);
  process.exit(1);
});





