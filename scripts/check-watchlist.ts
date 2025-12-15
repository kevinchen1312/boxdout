// Check user's watchlist
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkWatchlist() {
  console.log('📋 Checking your watchlist...\n');
  
  // Get all users
  const { data: users } = await supabase
    .from('users')
    .select('id, clerk_id, email');
  
  if (!users || users.length === 0) {
    console.log('No users found');
    return;
  }
  
  console.log(`Found ${users.length} user(s)\n`);
  
  for (const user of users) {
    console.log(`User: ${user.email || user.clerk_id}`);
    
    const { data: rankings } = await supabase
      .from('user_rankings')
      .select(`
        rank,
        prospects (
          id,
          full_name,
          position,
          team_name,
          league,
          source
        )
      `)
      .eq('user_id', user.id)
      .order('rank');
    
    if (!rankings || rankings.length === 0) {
      console.log('  No players on watchlist\n');
      continue;
    }
    
    console.log(`  ${rankings.length} players on watchlist:\n`);
    
    rankings.forEach((r: any) => {
      const p = r.prospects;
      if (p) {
        console.log(`  ${r.rank}. ${p.full_name}`);
        console.log(`     Team: ${p.team_name || 'N/A'}`);
        console.log(`     League: ${p.league || 'N/A'}`);
        console.log(`     Source: ${p.source || 'N/A'}\n`);
      }
    });
  }
}

checkWatchlist().catch(console.error);





