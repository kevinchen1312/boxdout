import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkNagasakiDates() {
  console.log('📅 Checking Nagasaki game dates...\n');

  // Find Nagasaki team
  const { data: team } = await supabase
    .from('international_teams')
    .select('id, name')
    .ilike('name', '%nagasaki%')
    .single();

  if (!team) {
    console.log('❌ Nagasaki not found');
    return;
  }

  console.log(`✅ Found: ${team.name}\n`);

  // Get all games and group by date
  const { data: games } = await supabase
    .from('international_team_schedules')
    .select('date, date_key, home_team_name, away_team_name, status')
    .eq('team_id', team.id)
    .order('date', { ascending: true });

  if (!games || games.length === 0) {
    console.log('❌ No games found');
    return;
  }

  console.log(`Total games: ${games.length}\n`);

  // Group by month
  const gamesByMonth: Record<string, any[]> = {};
  games.forEach(g => {
    const month = g.date_key.substring(0, 7); // YYYY-MM
    if (!gamesByMonth[month]) gamesByMonth[month] = [];
    gamesByMonth[month].push(g);
  });

  console.log('Games by month:');
  Object.keys(gamesByMonth).sort().forEach(month => {
    console.log(`\n${month}: ${gamesByMonth[month].length} games`);
    // Show first 3 games of each month
    gamesByMonth[month].slice(0, 3).forEach(g => {
      console.log(`  ${g.date_key}: ${g.home_team_name} vs ${g.away_team_name}`);
    });
  });

  // Check specifically for December 2025
  console.log('\n\n🔍 December 2025 games:');
  const decGames = games.filter(g => g.date_key.startsWith('2025-12'));
  if (decGames.length === 0) {
    console.log('❌ No games in December 2025!');
    console.log('\nThis is why Hoshikawa doesn\'t show on Dec 5!');
  } else {
    decGames.forEach(g => {
      console.log(`  ${g.date_key}: ${g.home_team_name} vs ${g.away_team_name} (${g.status})`);
    });
  }

  // Show next upcoming game
  const now = new Date().toISOString().split('T')[0];
  const upcomingGames = games.filter(g => g.date_key >= now);
  console.log('\n\n📍 Next upcoming games:');
  upcomingGames.slice(0, 5).forEach(g => {
    console.log(`  ${g.date_key}: ${g.home_team_name} vs ${g.away_team_name}`);
  });
}

checkNagasakiDates().catch(console.error);




