// Check user_rankings directly
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkRankings() {
  console.log('📋 Checking all user rankings...\n');
  
  // Get count
  const { count } = await supabase
    .from('user_rankings')
    .select('*', { count: 'exact', head: true });
  
  console.log(`Total rankings in database: ${count || 0}\n`);
  
  if (count === 0) {
    console.log('✅ Your watchlist is currently empty.');
    console.log('\nYou can add players by:');
    console.log('  1. Going to http://localhost:3000');
    console.log('  2. Click "Edit Rankings"');
    console.log('  3. Click "Add Player" → "Search & Import"');
    console.log('  4. Search for international players (e.g., "Baldwin", "Wilbekin", "Birsen")');
    return;
  }
  
  // Get all rankings with prospect details
  const { data: rankings } = await supabase
    .from('user_rankings')
    .select(`
      rank,
      user_id,
      prospects (
        full_name,
        team_name,
        league,
        source
      )
    `)
    .order('rank')
    .limit(50);
  
  if (rankings && rankings.length > 0) {
    console.log('Players on watchlist:\n');
    rankings.forEach((r: any) => {
      const p = r.prospects;
      if (p) {
        console.log(`  ${r.rank}. ${p.full_name} - ${p.team_name} (${p.league})`);
      }
    });
  }
}

checkRankings().catch(console.error);




