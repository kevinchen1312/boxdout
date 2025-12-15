console.log('Script starting...');

import { config } from 'dotenv';
import * as path from 'path';

console.log('Loading dotenv...');
config({ path: path.resolve(process.cwd(), '.env.local') });

console.log('Importing Supabase...');
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`Supabase URL exists: ${!!supabaseUrl}`);
console.log(`Supabase Key exists: ${!!supabaseKey}`);

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing credentials!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Querying database...');

supabase
  .from('international_rosters')
  .select('*', { count: 'exact', head: true })
  .then(({ count, error }) => {
    if (error) {
      console.error('Query error:', error);
      process.exit(1);
    }
    console.log(`\n✅ Total players: ${count || 0}`);
    process.exit(0);
  })
  .catch(e => {
    console.error('Caught error:', e);
    process.exit(1);
  });





