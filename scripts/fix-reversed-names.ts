// Fix reversed player names by clearing rosters and re-syncing
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixReversedNames() {
  console.log('🔧 Fixing reversed player names...\n');
  console.log('This will delete all existing roster entries and re-sync them with correct names.');
  console.log('The roster sync scripts have been updated to use firstname + lastname format.\n');
  
  // Count existing rosters
  const { count: existingCount } = await supabase
    .from('international_rosters')
    .select('*', { count: 'exact', head: true });
  
  console.log(`Found ${existingCount || 0} existing roster entries\n`);
  
  console.log('❌ Deleting all roster entries...');
  const { error: deleteError } = await supabase
    .from('international_rosters')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
  
  if (deleteError) {
    console.error('Error deleting rosters:', deleteError);
    process.exit(1);
  }
  
  console.log('✅ All roster entries deleted\n');
  console.log('📝 Next steps:');
  console.log('   1. Run: npx ts-node scripts/sync-international-rosters.ts');
  console.log('   2. This will re-sync all ~3,292 teams with correct name formatting');
  console.log('   3. Expected time: ~90-120 minutes (with API rate limits)\n');
}

fixReversedNames().catch(console.error);





