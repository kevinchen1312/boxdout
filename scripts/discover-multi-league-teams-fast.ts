// Fast discovery: Query international competitions to find their participants
// Then match participants to teams in our database

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

// Major international competitions (with correct season formats)
const INTERNATIONAL_COMPETITIONS = [
  { id: 120, name: 'EuroLeague', season: '2025' },
  { id: 194, name: 'EuroCup', season: '2025' },
  { id: 119, name: 'BCL', season: '2024' }, // Uses YYYY format
  { id: 133, name: 'FIBA Europe Cup', season: '2025' },
  { id: 198, name: 'ABA League', season: '2025' }, // Uses YYYY format
];

interface TeamInCompetition {
  teamId: number;
  teamName: string;
  leagueId: number;
  leagueName: string;
  gameCount: number;
}

async function getTeamsInCompetition(leagueId: number, season: string): Promise<TeamInCompetition[]> {
  try {
    console.log(`   Fetching teams...`);
    const params = new URLSearchParams({
      league: String(leagueId),
      season: season,
    });

    const response = await fetch(`${BASE_URL}/games?${params.toString()}`, {
      headers: { 'x-apisports-key': apiKey! },
    });

    const data = await response.json();
    
    if (!data.response || data.response.length === 0) {
      console.log(`   No games found`);
      return [];
    }

    console.log(`   Found ${data.results} games`);

    // Extract unique teams from games
    const teamMap = new Map<number, { name: string; count: number }>();
    
    for (const game of data.response) {
      const homeId = game.teams.home.id;
      const awayId = game.teams.away.id;
      const homeName = game.teams.home.name;
      const awayName = game.teams.away.name;

      if (!teamMap.has(homeId)) {
        teamMap.set(homeId, { name: homeName, count: 0 });
      }
      teamMap.get(homeId)!.count++;

      if (!teamMap.has(awayId)) {
        teamMap.set(awayId, { name: awayName, count: 0 });
      }
      teamMap.get(awayId)!.count++;
    }

    console.log(`   ${teamMap.size} unique teams`);

    return Array.from(teamMap.entries()).map(([teamId, info]) => ({
      teamId,
      teamName: info.name,
      leagueId,
      leagueName: INTERNATIONAL_COMPETITIONS.find(c => c.id === leagueId)?.name || String(leagueId),
      gameCount: info.count,
    }));
  } catch (error) {
    console.error(`Error fetching competition ${leagueId}:`, error);
    return [];
  }
}

async function discoverMultiLeagueTeamsFast(): Promise<void> {
  console.log('🔍 Fast Multi-League Team Discovery\n');
  console.log('='.repeat(80));
  console.log('Querying international competitions to find participants\n');

  // Fetch ALL teams from our database (remove default 1000 limit)
  const { data: dbTeams, error } = await supabase
    .from('international_teams')
    .select('api_team_id, name, league_id, league_name')
    .range(0, 10000); // Fetch up to 10,000 teams

  if (error || !dbTeams) {
    console.error('Error fetching teams:', error);
    process.exit(1);
  }

  console.log(`Database has ${dbTeams.length} teams\n`);

  // Create lookup map
  const dbTeamMap = new Map(dbTeams.map(t => [t.api_team_id, t]));

  // Step 1: Find all teams in international competitions
  const teamsInCompetitions = new Map<number, TeamInCompetition[]>();

  for (const competition of INTERNATIONAL_COMPETITIONS) {
    console.log(`\n🏆 ${competition.name} (League ${competition.id}, Season ${competition.season})`);
    
    const teams = await getTeamsInCompetition(competition.id, competition.season);
    
    for (const team of teams) {
      if (!teamsInCompetitions.has(team.teamId)) {
        teamsInCompetitions.set(team.teamId, []);
      }
      teamsInCompetitions.get(team.teamId)!.push(team);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Step 2: Match with our database teams and find multi-league teams
  console.log('\n' + '='.repeat(80));
  console.log('\n🔍 Matching with database teams...\n');

  const multiLeagueTeams: Array<{
    teamId: number;
    teamName: string;
    primaryLeague: number;
    primaryLeagueName: string;
    additionalLeagues: Array<{ id: number; name: string; gameCount: number }>;
  }> = [];

  for (const [teamId, competitions] of teamsInCompetitions.entries()) {
    const dbTeam = dbTeamMap.get(teamId);
    
    if (!dbTeam) {
      console.log(`⚠️  Team ${competitions[0].teamName} (ID: ${teamId}) not in database`);
      continue;
    }

    // Filter out their primary league
    const additionalCompetitions = competitions.filter(c => c.leagueId !== dbTeam.league_id);

    if (additionalCompetitions.length > 0) {
      console.log(`✅ ${dbTeam.name}: ${dbTeam.league_name} + ${additionalCompetitions.map(c => c.leagueName).join(' + ')}`);
      
      multiLeagueTeams.push({
        teamId: dbTeam.api_team_id,
        teamName: dbTeam.name,
        primaryLeague: dbTeam.league_id,
        primaryLeagueName: dbTeam.league_name,
        additionalLeagues: additionalCompetitions.map(c => ({
          id: c.leagueId,
          name: c.leagueName,
          gameCount: c.gameCount,
        })),
      });
    }
  }

  // Step 3: Generate mapping
  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 Found ${multiLeagueTeams.length} multi-league teams\n`);

  if (multiLeagueTeams.length > 0) {
    const mappingCode = generateMappingCode(multiLeagueTeams);
    
    const outputPath = path.join(process.cwd(), 'MULTI_LEAGUE_MAPPING.ts');
    fs.writeFileSync(outputPath, mappingCode);
    console.log(`✅ Saved to: ${outputPath}\n`);

    // Print detailed summary
    console.log('='.repeat(80));
    console.log('\nDETAILED BREAKDOWN:\n');
    for (const team of multiLeagueTeams) {
      console.log(`🏀 ${team.teamName}`);
      console.log(`   Primary: ${team.primaryLeagueName} (${team.primaryLeague})`);
      console.log(`   Additional:`);
      for (const league of team.additionalLeagues) {
        console.log(`     - ${league.name} (${league.id}): ~${league.gameCount} games`);
      }
      console.log();
    }
  }

  console.log('='.repeat(80));
  console.log('\n✅ Discovery complete!\n');
  console.log('Next steps:');
  console.log('1. Review MULTI_LEAGUE_MAPPING.ts');
  console.log('2. Copy the mapping to scripts/sync-international-schedules.ts');
  console.log('3. Run: npm run sync-international (to fetch all games)\n');
}

function generateMappingCode(teams: any[]): string {
  let code = `// Auto-generated Multi-League Team Mapping
// Generated: ${new Date().toISOString()}
//
// Copy this into scripts/sync-international-schedules.ts

export const MULTI_LEAGUE_TEAMS: Record<number, number[]> = {
`;

  for (const team of teams) {
    const leagueIds = team.additionalLeagues.map((l: any) => l.id).join(', ');
    const leagueNames = team.additionalLeagues.map((l: any) => l.name).join(' + ');
    code += `  ${team.teamId}: [${leagueIds}], // ${team.teamName}: ${team.primaryLeagueName} + ${leagueNames}\n`;
  }

  code += `};\n\n`;
  code += `// Total: ${teams.length} teams in multiple leagues\n`;

  return code;
}

discoverMultiLeagueTeamsFast().catch(error => {
  console.error('Discovery failed:', error);
  process.exit(1);
});

