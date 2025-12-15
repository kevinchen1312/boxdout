import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixAdiguzel() {
  console.log('🔧 Fixing E. Adiguzel games...\n');

  // Find Adiguzel prospect
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, full_name, team_name')
    .ilike('full_name', '%adiguzel%')
    .single();

  if (!prospects) {
    console.log('❌ Adiguzel not found');
    return;
  }

  console.log(`Found: ${prospects.full_name} (${prospects.team_name})`);
  console.log(`Prospect ID: ${prospects.id}\n`);

  // Check for games in prospect_games
  const { data: oldGames, count } = await supabase
    .from('prospect_games')
    .select('*', { count: 'exact' })
    .eq('prospect_id', prospects.id);

  console.log(`Old games in prospect_games: ${count || 0}`);
  
  if (oldGames && oldGames.length > 0) {
    console.log('Sample old games:');
    oldGames.slice(0, 5).forEach(g => {
      console.log(`  ${g.date}: ${g.home_team} vs ${g.away_team}`);
    });

    console.log('\n❌ Deleting old games from prospect_games...');
    const { error } = await supabase
      .from('prospect_games')
      .delete()
      .eq('prospect_id', prospects.id);

    if (error) {
      console.error('Error deleting:', error);
    } else {
      console.log('✅ Old games deleted!');
    }
  }

  console.log('\n✅ E. Adiguzel should now show correct Besiktas games from international_team_schedules!');
  console.log('   Refresh your calendar to see the fix.');
}

fixAdiguzel().catch(console.error);





