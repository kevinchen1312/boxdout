// Sync schedules for all international teams from API-Basketball
// Fetches current and previous season games for each team

import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') }); // Load .env.local

import { createClient } from '@supabase/supabase-js';

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

// NOTE: Multi-league mapping is NO LONGER NEEDED!
// Calling the API without league_id parameter automatically returns ALL leagues for a team.
// We fetch both season formats (YYYY and YYYY-YYYY) to capture all games.

interface Game {
  id: number;
  date: string;
  time: string;
  timestamp: number;
  timezone: string;
  stage: string;
  week: string;
  status: {
    long: string;
    short: string;
  };
  league: {
    id: number;
    name: string;
    type: string;
    season: string;
    logo: string;
  };
  country: {
    id: number;
    name: string;
    code: string;
    flag: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo: string;
    };
    away: {
      id: number;
      name: string;
      logo: string;
    };
  };
  scores: {
    home: {
      total: number;
    };
    away: {
      total: number;
    };
  };
  venue: string;
}

// Fetch games for a specific team
async function fetchTeamGames(teamId: number, season: string, leagueId?: number): Promise<Game[]> {
  try {
    const params = new URLSearchParams({
      team: String(teamId),
      season: season,
    });
    
    if (leagueId) {
      params.append('league', String(leagueId));
    }
    
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

// Determine if team is home or away
function getLocationType(teamApiId: number, homeTeamId: number, awayTeamId: number): 'home' | 'away' | 'neutral' {
  if (teamApiId === homeTeamId) return 'home';
  if (teamApiId === awayTeamId) return 'away';
  return 'neutral';
}

// Store games in database
async function storeGames(games: Game[], teamDbId: string, teamApiId: number): Promise<number> {
  let storedCount = 0;
  
  for (const game of games) {
    try {
      const gameDate = new Date(game.date);
      const dateKey = game.date.substring(0, 10);
      const locationType = getLocationType(teamApiId, game.teams.home.id, game.teams.away.id);
      
      const { error } = await supabase
        .from('international_team_schedules')
        .upsert({
          team_id: teamDbId,
          game_id: `apibball-${game.id}`,
          date: gameDate.toISOString(),
          date_key: dateKey,
          home_team_id: game.teams.home.id,
          away_team_id: game.teams.away.id,
          home_team_name: game.teams.home.name,
          away_team_name: game.teams.away.name,
          home_team_logo: game.teams.home.logo,
          away_team_logo: game.teams.away.logo,
          location_type: locationType,
          venue: game.venue,
          league_id: game.league.id,
          season: game.league.season,
          status: game.status.long,
          home_score: game.scores?.home?.total || null,
          away_score: game.scores?.away?.total || null,
        }, {
          onConflict: 'team_id,game_id',
        });

      if (!error) {
        storedCount++;
      } else {
        console.error(`Error storing game ${game.id}:`, error);
      }
    } catch (error) {
      console.error(`Exception storing game ${game.id}:`, error);
    }
  }
  
  return storedCount;
}

async function syncSchedules(): Promise<void> {
  console.log('📅 Starting International Schedules Sync\n');
  console.log('='.repeat(80));
  
  // Fetch teams from database starting from "Alkar"
  const { data: teams, error } = await supabase
    .from('international_teams')
    .select('*')
    .order('name');
  
  if (error) {
    console.error('Error fetching teams:', error);
    process.exit(1);
  }
  
  if (!teams || teams.length === 0) {
    console.log('\n❌ No teams found. Run sync-international-leagues first.');
    return;
  }
  
  console.log(`Found ${teams.length} teams to sync\n`);
  
  let totalGamesStored = 0;
  let teamsProcessed = 0;
  const gamesByLeague = new Map<number, { name: string; count: number }>();
  
  // Get current year for season
  const currentYear = new Date().getFullYear();
  
  for (const team of teams) {
    console.log(`\n📊 ${team.name}`);
    
    // Delete existing games for this team to avoid duplicates
    await supabase
      .from('international_team_schedules')
      .delete()
      .eq('team_id', team.id);
    
    // Fetch 2025-2026 season using BOTH formats (YYYY and YYYY-YYYY)
    // Each call returns ALL leagues automatically (no league_id needed!)
    const seasonsToFetch = [
      String(currentYear),              // "2025" - for leagues using YYYY format (EuroLeague, EuroCup, etc.)
      `${currentYear}-${currentYear + 1}`,  // "2025-2026" - for leagues using YYYY-YYYY format (BSL, LNB, etc.)
    ];
    
    let allGames: Game[] = [];
    
    for (const season of seasonsToFetch) {
      console.log(`   Fetching ALL leagues for season: ${season}`);
      
      // Fetch games WITHOUT league_id - this returns ALL leagues for this team!
      const games = await fetchTeamGames(team.api_team_id, season);
      console.log(`   Found ${games.length} games`);
      
      if (games.length > 0) {
        // Count games per league for this season
        const leagueCounts = new Map<number, { name: string; count: number }>();
        for (const game of games) {
          const leagueId = game.league.id;
          if (!leagueCounts.has(leagueId)) {
            leagueCounts.set(leagueId, { name: game.league.name, count: 0 });
          }
          leagueCounts.get(leagueId)!.count++;
        }
        
        // Show league breakdown
        console.log(`   League breakdown:`);
        for (const [leagueId, info] of leagueCounts) {
          console.log(`     - ${info.name} (${leagueId}): ${info.count} games`);
        }
      }
      
      allGames.push(...games);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Remove duplicates by game ID
    const uniqueGames = Array.from(
      new Map(allGames.map(g => [g.id, g])).values()
    );
    
    console.log(`\n   📊 TOTAL for ${team.name}: ${uniqueGames.length} unique games`);
    
    if (uniqueGames.length > 0) {
      // Show final league breakdown after deduplication
      const finalLeagueCounts = new Map<number, { name: string; count: number }>();
      for (const game of uniqueGames) {
        const leagueId = game.league.id;
        if (!finalLeagueCounts.has(leagueId)) {
          finalLeagueCounts.set(leagueId, { name: game.league.name, count: 0 });
        }
        finalLeagueCounts.get(leagueId)!.count++;
      }
      
      console.log(`   Final league breakdown:`);
      for (const [leagueId, info] of finalLeagueCounts) {
        console.log(`     ✅ ${info.name} (${leagueId}): ${info.count} games`);
      }
    }
    
    if (uniqueGames.length > 0) {
      // Track games by league
      for (const game of uniqueGames) {
        const leagueId = game.league.id;
        if (!gamesByLeague.has(leagueId)) {
          gamesByLeague.set(leagueId, { name: game.league.name, count: 0 });
        }
        gamesByLeague.get(leagueId)!.count++;
      }
      
      // Store games
      const stored = await storeGames(uniqueGames, team.id, team.api_team_id);
      console.log(`   ✅ Stored ${stored} games`);
      
      totalGamesStored += stored;
      teamsProcessed++;
      
      // Update team's last_synced timestamp
      await supabase
        .from('international_teams')
        .update({ last_synced: new Date().toISOString() })
        .eq('id', team.id);
    } else {
      console.log(`   ⚠️  No games found`);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📈 SYNC SUMMARY\n');
  console.log(`Teams processed: ${teamsProcessed}`);
  console.log(`Total games stored: ${totalGamesStored}`);
  console.log(`Average games per team: ${teamsProcessed > 0 ? (totalGamesStored / teamsProcessed).toFixed(1) : 0}`);
  
  console.log('\n🏀 GAMES BY LEAGUE:\n');
  const sortedLeagues = Array.from(gamesByLeague.entries())
    .sort((a, b) => b[1].count - a[1].count);
  
  for (const [leagueId, info] of sortedLeagues) {
    console.log(`   ${info.name} (${leagueId}): ${info.count} games`);
  }
  
  console.log('\n✅ Schedule sync complete!');
}

// Run sync
syncSchedules().catch(error => {
  console.error('Schedule sync failed:', error);
  process.exit(1);
});

