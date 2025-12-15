import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function simpleCount() {
  try {
    const { count, error } = await supabase
      .from('international_rosters')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    console.log(`Total players in database: ${count || 0}`);
  } catch (e) {
    console.error('Caught error:', e);
  }
}

simpleCount();





