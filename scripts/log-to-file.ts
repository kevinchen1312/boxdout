import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function logToFile() {
  const output: string[] = [];
  output.push('=== Sync Progress Check ===');
  output.push(`Time: ${new Date().toISOString()}\n`);
  
  try {
    const { count, error } = await supabase
      .from('international_rosters')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      output.push(`Error: ${JSON.stringify(error)}`);
    } else {
      output.push(`Total players: ${count || 0}`);
    }
    
    // Get sample names
    const { data: samples } = await supabase
      .from('international_rosters')
      .select('player_name, international_teams!inner(name)')
      .limit(20);
    
    if (samples && samples.length > 0) {
      output.push('\nSample players:');
      samples.forEach((s: any) => {
        output.push(`  ${s.player_name} (${s.international_teams.name})`);
      });
    }
    
  } catch (e: any) {
    output.push(`Exception: ${e.message}`);
  }
  
  const logContent = output.join('\n');
  fs.writeFileSync('sync-progress.log', logContent);
  console.log('Log written to sync-progress.log');
}

logToFile().catch(e => {
  fs.writeFileSync('sync-progress.log', `Error: ${e.message}`);
});





