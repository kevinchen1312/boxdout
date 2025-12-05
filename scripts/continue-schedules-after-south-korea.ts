// Continue schedule sync from after South Korea onward (finish S teams, then T-Z)
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;

if (!supabaseUrl || !supabaseKey || !apiKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BASE_URL = 'https://v1.basketball.api-sports.io';

interface Game {
  id: number;
  date: string;
  time: string;
  timestamp: number;
  status: { long: string; short: string };
  league: { id: number; name: string; season: string };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  scores: {
    home: { total: number };
    away: { total: number };
  };
}

async function fetchTeamSchedule(teamId: number, season: string, leagueId?: number): Promise<Game[]> {
  const params = new URLSearchParams({
    team: String(teamId),
    season: season,
  });
  
  if (leagueId) {
    params.append('league', String(leagueId));
  }
  
  const url = `${BASE_URL}/games?${params.toString()}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey! },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.response || [];
  } catch (error) {
    console.error(`Error fetching schedule for team ${teamId}:`, error);
    return [];
  }
}

async function storeGames(games: Game[], teamDbId: string): Promise<number> {
  let storedCount = 0;
  
  for (const game of games) {
    try {
      const gameDate = new Date(game.timestamp * 1000);
      const dateKey = gameDate.toISOString().split('T')[0];
      
      // Determine location type
      const { data: team } = await supabase
        .from('international_teams')
        .select('api_team_id')
        .eq('id', teamDbId)
        .single();
      
      const locationType = 
        game.teams.home.id === team?.api_team_id ? 'home' :
        game.teams.away.id === team?.api_team_id ? 'away' : 'neutral';
      
      const { error } = await supabase
        .from('international_team_schedules')
        .upsert({
          team_id: teamDbId,
          game_id: String(game.id),
          date: gameDate.toISOString(),
          date_key: dateKey,
          home_team_id: game.teams.home.id,
          away_team_id: game.teams.away.id,
          home_team_name: game.teams.home.name,
          away_team_name: game.teams.away.name,
          home_team_logo: game.teams.home.logo,
          away_team_logo: game.teams.away.logo,
          location_type: locationType,
          league_id: game.league.id,
          season: game.league.season,
          status: game.status.long,
          home_score: game.scores.home.total,
          away_score: game.scores.away.total,
        }, {
          onConflict: 'team_id,game_id',
        });
      
      if (!error) {
        storedCount++;
      }
    } catch (e) {
      // Skip on error
    }
  }
  
  return storedCount;
}

async function continueScheduleSync() {
  console.log('🔄 Continuing schedule sync from after South Korea...\n');
  console.log('   (Will finish remaining S teams, then T-Z)\n');
  console.log('='.repeat(80) + '\n');
  
  // Fetch teams that come AFTER "South Korea" alphabetically
  const { data: teams, error } = await supabase
    .from('international_teams')
    .select('id, api_team_id, name, league_id, league_name, season_format')
    .gt('name', 'South Korea')
    .order('name');
  
  if (error || !teams) {
    console.error('Error fetching teams:', error);
    process.exit(1);
  }
  
  console.log(`Found ${teams.length} teams to sync (after South Korea)\n`);
  
  let totalGamesStored = 0;
  let teamsProcessed = 0;
  let teamsSkipped = 0;
  
  const currentYear = new Date().getFullYear();
  
  for (const team of teams) {
    console.log(`\n🏀 ${team.name} (League: ${team.league_name})`);
    
    // Check if this team already has a schedule
    const { data: existingGames } = await supabase
      .from('international_team_schedules')
      .select('id')
      .eq('team_id', team.id)
      .limit(1);
    
    if (existingGames && existingGames.length > 0) {
      console.log('   ⏭️  Already has schedule, skipping');
      teamsSkipped++;
      continue;
    }
    
    // Determine seasons to fetch
    const seasons: string[] = [];
    if (team.season_format === 'YYYY-YYYY') {
      seasons.push(`${currentYear}-${currentYear + 1}`); // Current season
      seasons.push(`${currentYear - 1}-${currentYear}`); // Previous season
    } else {
      seasons.push(String(currentYear));
      seasons.push(String(currentYear - 1));
    }
    
    let teamGamesStored = 0;
    
    for (const season of seasons) {
      console.log(`   Fetching games for season: ${season}`);
      const games = await fetchTeamSchedule(team.api_team_id, season, team.league_id);
      
      if (games.length > 0) {
        console.log(`   Found ${games.length} games`);
        const stored = await storeGames(games, team.id);
        console.log(`   ✅ Stored ${stored} games`);
        teamGamesStored += stored;
      }
      
      // Rate limit between seasons
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (teamGamesStored > 0) {
      console.log(`   📊 Total for ${team.name}: ${teamGamesStored} games`);
      totalGamesStored += teamGamesStored;
      teamsProcessed++;
    } else {
      console.log(`   ⚠️  No games found`);
      teamsSkipped++;
    }
    
    // Rate limit: wait 1 second between teams
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📈 SCHEDULE CONTINUATION SUMMARY\n');
  console.log(`Teams processed: ${teamsProcessed}`);
  console.log(`Teams skipped: ${teamsSkipped}`);
  console.log(`Total games stored: ${totalGamesStored}`);
  console.log('\n✅ Schedule continuation complete!');
}

continueScheduleSync().catch(error => {
  console.error('Schedule continuation failed:', error);
  process.exit(1);
});




