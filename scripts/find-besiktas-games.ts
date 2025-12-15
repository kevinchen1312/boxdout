import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findBesiktasGames() {
  console.log('🔍 Finding all games involving "Besiktas"...\n');

  // Check prospect_games
  const { data: prospectGames, count } = await supabase
    .from('prospect_games')
    .select('*, prospects(full_name)', { count: 'exact' })
    .or('home_team.ilike.%Besiktas%,away_team.ilike.%Besiktas%');

  console.log(`Found ${count || 0} games in prospect_games with Besiktas:\n`);
  
  if (prospectGames && prospectGames.length > 0) {
    prospectGames.forEach((g: any) => {
      console.log(`${g.date}: ${g.home_team} vs ${g.away_team}`);
      console.log(`  Prospect: ${g.prospects?.full_name || 'Unknown'}`);
      console.log(`  Game ID: ${g.id}\n`);
    });

    console.log('\n❌ These fake games need to be deleted!');
    console.log('Delete them? (This will remove all Besiktas games from prospect_games)');
  } else {
    console.log('✅ No Besiktas games in prospect_games');
  }

  // Also check custom_player_games
  const { data: customGames, count: customCount } = await supabase
    .from('custom_player_games')
    .select('*', { count: 'exact' })
    .or('home_team.ilike.%Besiktas%,away_team.ilike.%Besiktas%');

  console.log(`\nFound ${customCount || 0} games in custom_player_games with Besiktas`);
  
  if (customGames && customGames.length > 0) {
    console.log('These should also be deleted!');
  }
}

findBesiktasGames().catch(console.error);





