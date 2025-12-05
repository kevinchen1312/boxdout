// Sync Nagasaki schedule immediately
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

async function syncNagasaki() {
  console.log('🏀 Syncing Nagasaki Velca schedule...\n');

  // 1. Find Nagasaki in international_teams
  const { data: teams, error: teamsError } = await supabase
    .from('international_teams')
    .select('*')
    .ilike('name', '%nagasaki%');

  if (teamsError || !teams || teams.length === 0) {
    console.error('❌ Nagasaki not found in international_teams');
    process.exit(1);
  }

  console.log(`✅ Found ${teams.length} Nagasaki team(s):`);
  teams.forEach(t => console.log(`   ${t.name} (${t.league_name}) [API ID: ${t.api_team_id}]`));

  const currentYear = new Date().getFullYear();

  for (const team of teams) {
    console.log(`\n📅 Fetching schedule for ${team.name}...`);

    // Determine seasons to fetch
    const seasons: string[] = [];
    if (team.season_format === 'YYYY-YYYY') {
      seasons.push(`${currentYear}-${currentYear + 1}`);
      seasons.push(`${currentYear - 1}-${currentYear}`);
    } else {
      seasons.push(String(currentYear));
      seasons.push(String(currentYear - 1));
    }

    let totalGames = 0;

    for (const season of seasons) {
      console.log(`\n   Season: ${season}`);
      
      const params = new URLSearchParams({
        team: String(team.api_team_id),
        season: season,
      });

      if (team.league_id) {
        params.append('league', String(team.league_id));
      }

      const url = `${BASE_URL}/games?${params.toString()}`;
      console.log(`   Fetching: ${url}`);

      try {
        const response = await fetch(url, {
          headers: { 'x-apisports-key': apiKey! },
        });

        const data = await response.json();
        const games = data.response || [];

        console.log(`   Found ${games.length} games from API`);

        // Store each game
        for (const game of games) {
          const gameDate = new Date(game.timestamp * 1000);
          const dateKey = gameDate.toISOString().split('T')[0];

          const locationType =
            game.teams.home.id === team.api_team_id ? 'home' :
            game.teams.away.id === team.api_team_id ? 'away' : 'neutral';

          const { error: insertError } = await supabase
            .from('international_team_schedules')
            .upsert({
              team_id: team.id,
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

          if (!insertError) {
            totalGames++;
          }
        }

        console.log(`   ✅ Stored ${games.length} games`);
      } catch (error) {
        console.error(`   ❌ Error fetching games:`, error);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n✅ Total games stored for ${team.name}: ${totalGames}`);
  }

  console.log('\n🎉 Nagasaki sync complete!');
  console.log('\nNow check if Hoshikawa is linked to Nagasaki...');

  // Check Hoshikawa linkage
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, full_name, team_name, international_team_id')
    .ilike('full_name', '%hoshikawa%');

  if (prospects && prospects.length > 0) {
    console.log(`\nFound ${prospects.length} Hoshikawa prospect(s):`);
    for (const p of prospects) {
      console.log(`  ${p.full_name} (${p.team_name})`);
      console.log(`  International Team ID: ${p.international_team_id || '❌ NULL - NOT LINKED!'}`);
      
      if (!p.international_team_id) {
        console.log(`\n⚠️  Need to link ${p.full_name} to Nagasaki team!`);
        const nagasakiTeam = teams[0]; // Use first Nagasaki team found
        
        console.log(`   Linking to ${nagasakiTeam.name}...`);
        const { error: updateError } = await supabase
          .from('prospects')
          .update({
            international_team_id: nagasakiTeam.id,
            source: 'international-roster',
          })
          .eq('id', p.id);

        if (updateError) {
          console.error(`   ❌ Error linking:`, updateError);
        } else {
          console.log(`   ✅ Successfully linked!`);
        }
      }
    }
  }
}

syncNagasaki().catch(error => {
  console.error('Sync failed:', error);
  process.exit(1);
});




