import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkProspectName() {
  const { data } = await supabase
    .from('prospects')
    .select('id, full_name, name, team_name, team')
    .ilike('full_name', '%hoshikawa%');
  
  console.log('Hoshikawa prospect fields:');
  console.log(JSON.stringify(data, null, 2));
}

checkProspectName();




