// Get full details about I. Almansa Perez

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Get the exact player
  const { data: player } = await supabase
    .from('international_rosters')
    .select(`
      id,
      player_name,
      position,
      jersey_number,
      international_teams (
        id,
        name,
        api_team_id,
        league_name,
        country
      )
    `)
    .ilike('player_name', '%almansa%')
    .limit(5);
  
  console.log('Player details:');
  console.log(JSON.stringify(player, null, 2));
  
  // Test the search query that search-all uses
  console.log('\n\nTesting search query "izan almansa":');
  const { data: searchTest } = await supabase
    .from('international_rosters')
    .select('id, player_name')
    .ilike('player_name', '%izan almansa%')
    .limit(5);
  
  console.log(`Results: ${searchTest?.length || 0}`);
  searchTest?.forEach(r => console.log(`  - ${r.player_name}`));
  
  // Test individual words
  console.log('\n\nTesting individual words:');
  const { data: wordTest } = await supabase
    .from('international_rosters')
    .select('id, player_name')
    .or('player_name.ilike.%izan%,player_name.ilike.%almansa%')
    .limit(10);
  
  console.log(`Results: ${wordTest?.length || 0}`);
  wordTest?.forEach(r => console.log(`  - ${r.player_name}`));
}

main().catch(console.error);


