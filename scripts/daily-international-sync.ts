// Master daily sync script for international basketball data
// Orchestrates league, roster, and schedule syncs

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SyncResult {
  step: string;
  success: boolean;
  duration: number;
  output?: string;
  error?: string;
}

async function runScript(scriptPath: string, description: string): Promise<SyncResult> {
  const startTime = Date.now();
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔄 Running: ${description}`);
  console.log(`${'='.repeat(80)}\n`);
  
  try {
    const { stdout, stderr } = await execAsync(`npx ts-node ${scriptPath}`, {
      env: process.env,
      timeout: 3600000, // 1 hour timeout
    });
    
    const duration = Date.now() - startTime;
    
    console.log(stdout);
    if (stderr) {
      console.error(stderr);
    }
    
    return {
      step: description,
      success: true,
      duration,
      output: stdout,
      error: stderr || undefined,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    console.error(`\n❌ Error in ${description}:`);
    console.error(error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    
    return {
      step: description,
      success: false,
      duration,
      output: error.stdout,
      error: error.message + '\n' + (error.stderr || ''),
    };
  }
}

async function dailySync(): Promise<void> {
  console.log('\n🌍 DAILY INTERNATIONAL BASKETBALL SYNC');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('='.repeat(80));
  
  const results: SyncResult[] = [];
  const overallStartTime = Date.now();
  
  // Step 1: Sync leagues and teams (run weekly or if new season detected)
  // For now, run every time - can optimize later
  const leaguesResult = await runScript(
    'scripts/sync-international-leagues.ts',
    'Sync Leagues and Teams'
  );
  results.push(leaguesResult);
  
  if (!leaguesResult.success) {
    console.log('\n⚠️  Leagues sync failed, skipping rosters and schedules');
  } else {
    // Step 2: Sync rosters for all teams
    const rostersResult = await runScript(
      'scripts/sync-international-rosters.ts',
      'Sync Team Rosters'
    );
    results.push(rostersResult);
    
    // Step 3: Sync schedules for all teams
    const schedulesResult = await runScript(
      'scripts/sync-international-schedules.ts',
      'Sync Team Schedules'
    );
    results.push(schedulesResult);
  }
  
  // Summary
  const overallDuration = Date.now() - overallStartTime;
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 DAILY SYNC SUMMARY');
  console.log('='.repeat(80));
  console.log(`\nCompleted: ${new Date().toISOString()}`);
  console.log(`Total duration: ${(overallDuration / 1000 / 60).toFixed(1)} minutes`);
  console.log(`\nSteps completed: ${successCount}/${results.length}`);
  console.log(`Steps failed: ${failureCount}`);
  
  console.log('\n📋 Step Details:\n');
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const duration = (result.duration / 1000).toFixed(1);
    console.log(`${status} ${result.step} (${duration}s)`);
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error.split('\n')[0]}`);
    }
  });
  
  if (failureCount > 0) {
    console.log('\n⚠️  Some steps failed. Check logs above for details.');
    process.exit(1);
  } else {
    console.log('\n✅ All steps completed successfully!');
  }
}

// Run daily sync
dailySync().catch(error => {
  console.error('\n❌ Daily sync crashed:', error);
  process.exit(1);
});




