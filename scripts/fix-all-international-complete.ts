// Automated fix script for all international players
// Fixes team associations, fetches games, caches logos

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
const BASE_URL = 'https://v1.basketball.api-sports.io';

interface TeamSearchResult {
  found: boolean;
  teamId?: number;
  teamName?: string;
  country?: string;
  logo?: string;
}

interface FixResult {
  prospectId: string;
  name: string;
  oldTeam: string;
  oldTeamId: number | null;
  newTeam?: string;
  newTeamId?: number;
  gamesFetched: number;
  logosCached: number;
  status: 'success' | 'warning' | 'error';
  message: string;
}

// Search API-Basketball for a team
async function searchTeam(teamName: string): Promise<TeamSearchResult> {
  try {
    const searchUrl = `${BASE_URL}/teams?search=${encodeURIComponent(teamName)}`;
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
      teamId: bestMatch.id,
      teamName: bestMatch.name,
      country: bestMatch.country?.name,
      logo: bestMatch.logo,
    };
  } catch (error) {
    console.error(`Error searching for ${teamName}:`, error);
    return { found: false };
  }
}

// Fetch games for a team from API-Basketball
async function fetchGames(teamId: number, season: string | number): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      team: String(teamId),
      season: String(season),
    });

    const url = `${BASE_URL}/games?${params.toString()}`;
    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey! },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.response || [];
  } catch (error) {
    console.error(`Error fetching games for team ${teamId}:`, error);
    return [];
  }
}

// Store games in database
async function storeGames(prospectId: string, games: any[]): Promise<number> {
  const gamesToInsert = games.map(game => {
    const gameData = {
      prospect_id: prospectId,
      game_id: `apibball-${game.id}`,
      date: game.date,
      date_key: game.date?.substring(0, 10) || '',
      home_team: game.teams?.home?.name || 'TBD',
      away_team: game.teams?.away?.name || 'TBD',
      home_team_id: game.teams?.home?.id,
      away_team_id: game.teams?.away?.id,
      home_team_logo: game.teams?.home?.logo,
      away_team_logo: game.teams?.away?.logo,
      tipoff: null,
      tv: null,
      venue: game.venue || null,
      location_type: null,
      source: 'api-basketball',
    };
    return gameData;
  });

  if (gamesToInsert.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from('prospect_games')
    .insert(gamesToInsert);

  if (error) {
    console.error('Error inserting games:', error);
    return 0;
  }

  return gamesToInsert.length;
}

// Cache team logos
async function cacheLogos(games: any[]): Promise<number> {
  const uniqueTeams = new Map<number, any>();

  games.forEach(game => {
    const homeTeam = game.teams?.home;
    const awayTeam = game.teams?.away;

    if (homeTeam && homeTeam.id && homeTeam.logo) {
      uniqueTeams.set(homeTeam.id, homeTeam);
    }
    if (awayTeam && awayTeam.id && awayTeam.logo) {
      uniqueTeams.set(awayTeam.id, awayTeam);
    }
  });

  let cachedCount = 0;

  for (const [teamId, team] of uniqueTeams) {
    try {
      const { error } = await supabase
        .from('team_logos')
        .upsert({
          team_id: teamId,
          team_name: team.name,
          logo_url: team.logo,
          source: 'api-basketball',
          last_updated: new Date().toISOString(),
        }, {
          onConflict: 'team_id,source',
        });

      if (!error) {
        cachedCount++;
      }
    } catch (error) {
      console.error(`Error caching logo for team ${teamId}:`, error);
    }
  }

  return cachedCount;
}

async function fixInternationalPlayers(): Promise<void> {
  console.log('🔧 Starting Automated International Players Fix\n');
  console.log('='.repeat(80));

  // Query all international prospects
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

  const results: FixResult[] = [];
  const newTeamMappings: Map<string, any> = new Map();
  const currentYear = new Date().getFullYear();

  for (let i = 0; i < prospects.length; i++) {
    const prospect = prospects[i];
    console.log(`\n[${i + 1}/${prospects.length}] Processing: ${prospect.full_name} (${prospect.team_name})`);

    const result: FixResult = {
      prospectId: prospect.id,
      name: prospect.full_name,
      oldTeam: prospect.team_name || 'Unknown',
      oldTeamId: prospect.team_id,
      gamesFetched: 0,
      logosCached: 0,
      status: 'success',
      message: '',
    };

    // Search for team in API
    console.log(`  🔎 Searching API for team: ${prospect.team_name}`);
    const teamSearch = await searchTeam(prospect.team_name);

    if (!teamSearch.found) {
      result.status = 'error';
      result.message = 'Team not found in API-Basketball';
      console.log(`  ❌ ${result.message}`);
      results.push(result);
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    result.newTeam = teamSearch.teamName!;
    result.newTeamId = teamSearch.teamId!;

    console.log(`  ✅ Found: ${teamSearch.teamName} (ID: ${teamSearch.teamId}, ${teamSearch.country})`);

    // Update prospect with correct team info
    const { error: updateError } = await supabase
      .from('prospects')
      .update({
        team_id: teamSearch.teamId,
        team_name: teamSearch.teamName,
      })
      .eq('id', prospect.id);

    if (updateError) {
      result.status = 'error';
      result.message = `Database update failed: ${updateError.message}`;
      console.log(`  ❌ ${result.message}`);
      results.push(result);
      continue;
    }

    console.log(`  💾 Updated database with team ID ${teamSearch.teamId}`);

    // Delete old games
    await supabase
      .from('prospect_games')
      .delete()
      .eq('prospect_id', prospect.id);

    console.log(`  🗑️  Deleted old games`);

    // Fetch new games - try both season formats
    console.log(`  📥 Fetching games...`);
    
    let allGames: any[] = [];
    
    // Try YYYY-YYYY format
    const seasonRange = `${currentYear}-${currentYear + 1}`;
    let games = await fetchGames(teamSearch.teamId!, seasonRange);
    console.log(`     Season ${seasonRange}: ${games.length} games`);
    allGames.push(...games);
    
    // Try previous season
    const prevSeasonRange = `${currentYear - 1}-${currentYear}`;
    games = await fetchGames(teamSearch.teamId!, prevSeasonRange);
    console.log(`     Season ${prevSeasonRange}: ${games.length} games`);
    allGames.push(...games);
    
    // Try single year format
    games = await fetchGames(teamSearch.teamId!, currentYear);
    console.log(`     Season ${currentYear}: ${games.length} games`);
    allGames.push(...games);

    // Remove duplicates
    const uniqueGames = Array.from(
      new Map(allGames.map(g => [g.id, g])).values()
    );

    console.log(`  📊 Total unique games: ${uniqueGames.length}`);

    if (uniqueGames.length === 0) {
      result.status = 'warning';
      result.message = 'No games fetched';
      console.log(`  ⚠️  ${result.message}`);
    } else if (uniqueGames.length < 10) {
      result.status = 'warning';
      result.message = `Only ${uniqueGames.length} games fetched (expected 15-50)`;
      console.log(`  ⚠️  ${result.message}`);
    } else {
      result.message = `Successfully fetched ${uniqueGames.length} games`;
      console.log(`  ✅ ${result.message}`);
    }

    // Store games
    if (uniqueGames.length > 0) {
      const stored = await storeGames(prospect.id, uniqueGames);
      result.gamesFetched = stored;
      console.log(`  💾 Stored ${stored} games in database`);

      // Cache logos
      const cached = await cacheLogos(uniqueGames);
      result.logosCached = cached;
      console.log(`  🖼️  Cached ${cached} team logos`);
    }

    results.push(result);

    // Track new team mappings
    const normalizedName = (prospect.team_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedName && !newTeamMappings.has(normalizedName)) {
      newTeamMappings.set(normalizedName, {
        normalizedName,
        teamName: teamSearch.teamName,
        teamId: teamSearch.teamId,
        country: teamSearch.country,
      });
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Generate summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 FIX SUMMARY\n');

  const successCount = results.filter(r => r.status === 'success').length;
  const warningCount = results.filter(r => r.status === 'warning').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  console.log(`Total Prospects: ${results.length}`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`⚠️  Warnings: ${warningCount}`);
  console.log(`❌ Errors: ${errorCount}`);

  const totalGames = results.reduce((sum, r) => sum + r.gamesFetched, 0);
  const totalLogos = results.reduce((sum, r) => sum + r.logosCached, 0);

  console.log(`\n📈 Statistics:`);
  console.log(`  Total games fetched: ${totalGames}`);
  console.log(`  Total logos cached: ${totalLogos}`);
  console.log(`  Average games per player: ${(totalGames / results.length).toFixed(1)}`);

  // Save detailed report
  const reportPath = path.join(process.cwd(), 'international-players-fix-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Detailed report saved to: ${reportPath}`);

  // Save new team mappings
  if (newTeamMappings.size > 0) {
    console.log('\n📝 NEW TEAM MAPPINGS TO ADD:\n');
    console.log('Add these to TEAM_ID_MAPPINGS in lib/loadSchedulesFromApiBasketball.ts:\n');
    
    for (const [key, mapping] of newTeamMappings) {
      console.log(`  '${key}': { teamId: ${mapping.teamId}, leagueIds: [], leagueName: '${mapping.country}', seasonFormat: 'YYYY-YYYY' }, // ${mapping.teamName}`);
    }

    const mappingsPath = path.join(process.cwd(), 'new-team-mappings.txt');
    const mappingsContent = Array.from(newTeamMappings.values())
      .map(m => `  '${m.normalizedName}': { teamId: ${m.teamId}, leagueIds: [], leagueName: '${m.country}', seasonFormat: 'YYYY-YYYY' }, // ${m.teamName}`)
      .join('\n');
    
    fs.writeFileSync(mappingsPath, mappingsContent);
    console.log(`\n💾 Mappings saved to: ${mappingsPath}`);
  }

  // Show errors and warnings
  if (errorCount > 0) {
    console.log('\n❌ ERRORS:');
    results
      .filter(r => r.status === 'error')
      .forEach(r => {
        console.log(`  - ${r.name} (${r.oldTeam}): ${r.message}`);
      });
  }

  if (warningCount > 0) {
    console.log('\n⚠️  WARNINGS:');
    results
      .filter(r => r.status === 'warning')
      .forEach(r => {
        console.log(`  - ${r.name} (${r.newTeam || r.oldTeam}): ${r.message}`);
      });
  }

  console.log('\n✅ Fix complete!');
}

// Run fix
fixInternationalPlayers().catch(error => {
  console.error('Fix failed:', error);
  process.exit(1);
});




