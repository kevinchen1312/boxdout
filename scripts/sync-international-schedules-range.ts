// Sync schedules for a range of teams (for parallel processing)
// Usage: npx ts-node scripts/sync-international-schedules-range.ts <startLetter> <endLetter>

import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;

if (!supabaseUrl || !supabaseKey || !apiKey) {
  console.error('Missing credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BASE_URL = 'https://v1.basketball.api-sports.io';

// Get range from command line args
const startLetter = process.argv[2] || 'A';
const endLetter = process.argv[3] || 'Z';

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

async function storeGames(games: Game[], teamId: string, apiTeamId: number): Promise<number> {
  let storedCount = 0;
  
  for (const game of games) {
    try {
      const isHome = game.teams.home.id === apiTeamId;
      const locationType = isHome ? 'home' : 'away';
      
      const { error } = await supabase
        .from('international_team_schedules')
        .upsert({
          team_id: teamId,
          game_id: `apibball-${game.id}`,
          date: new Date(game.date).toISOString(),
          date_key: game.date.substring(0, 10),
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
      }
    } catch (error) {
      // Ignore errors, continue
    }
  }
  
  return storedCount;
}

async function syncSchedules(): Promise<void> {
  console.log(`\n📅 Syncing teams ${startLetter}-${endLetter}\n`);
  console.log('='.repeat(60));
  
  // Fetch teams in range
  const { data: teams, error } = await supabase
    .from('international_teams')
    .select('*')
    .gte('name', startLetter)
    .lt('name', endLetter + '~') // Include all teams starting with endLetter
    .order('name');
  
  if (error || !teams || teams.length === 0) {
    console.log(`No teams found in range ${startLetter}-${endLetter}`);
    return;
  }
  
  console.log(`Found ${teams.length} teams\n`);
  
  let totalGamesStored = 0;
  const currentYear = new Date().getFullYear();
  
  for (const team of teams) {
    console.log(`📊 ${team.name}`);
    
    // Delete existing games
    await supabase
      .from('international_team_schedules')
      .delete()
      .eq('team_id', team.id);
    
    const seasonsToFetch = [
      String(currentYear),
      `${currentYear}-${currentYear + 1}`,
    ];
    
    let allGames: Game[] = [];
    
    for (const season of seasonsToFetch) {
      const games = await fetchTeamGames(team.api_team_id, season);
      
      if (games.length > 0) {
        const leagueCounts = new Map<number, { name: string; count: number }>();
        for (const game of games) {
          const leagueId = game.league.id;
          if (!leagueCounts.has(leagueId)) {
            leagueCounts.set(leagueId, { name: game.league.name, count: 0 });
          }
          leagueCounts.get(leagueId)!.count++;
        }
        
        console.log(`   ${season}: ${games.length} games`);
        for (const [leagueId, info] of leagueCounts) {
          console.log(`     - ${info.name} (${leagueId}): ${info.count}`);
        }
      }
      
      allGames.push(...games);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const uniqueGames = Array.from(
      new Map(allGames.map(g => [g.id, g])).values()
    );
    
    if (uniqueGames.length > 0) {
      const stored = await storeGames(uniqueGames, team.id, team.api_team_id);
      console.log(`   ✅ Stored ${stored} games\n`);
      totalGamesStored += stored;
    } else {
      console.log(`   ⚠️  No games\n`);
    }
  }
  
  console.log('='.repeat(60));
  console.log(`\n✅ ${startLetter}-${endLetter}: ${totalGamesStored} games stored\n`);
}

syncSchedules().catch(error => {
  console.error(`Sync ${startLetter}-${endLetter} failed:`, error);
  process.exit(1);
});





