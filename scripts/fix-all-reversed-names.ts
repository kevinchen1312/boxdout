// Delete all rosters and re-sync with improved name parsing
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteAllRosters() {
  console.log('🗑️  Deleting all international roster entries...\n');
  
  const { count, error: countError } = await supabase
    .from('international_rosters')
    .select('id', { count: 'exact', head: true });
  
  if (countError) {
    console.error('Error counting roster entries:', countError);
    process.exit(1);
  }
  
  console.log(`Found ${count || 0} existing roster entries\n`);
  
  if (count && count > 0) {
    const { error: deleteError } = await supabase
      .from('international_rosters')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (deleteError) {
      console.error('Error deleting roster entries:', deleteError);
      process.exit(1);
    }
    console.log('✅ All roster entries deleted\n');
  }
  
  console.log('📝 Next steps:');
  console.log('   The sync scripts have been updated with improved name parsing:');
  console.log('   1. "James Birsen" (has firstname/lastname) → "James Birsen" ✅');
  console.log('   2. "Abalde Alberto" (only name field) → "Alberto Abalde" ✅');
  console.log('   3. "A. Djulovic" (abbreviated) → "A. Djulovic" (kept as-is)\n');
  console.log('   Now run: npx ts-node scripts/sync-international-rosters.ts');
}

deleteAllRosters().catch(error => {
  console.error('Delete script failed:', error);
  process.exit(1);
});




