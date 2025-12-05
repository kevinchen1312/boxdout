import { NextResponse } from 'next/server';
import { loadProspects } from '@/lib/loadProspects';
import { fetchProspectScheduleFromApiBasketball, canUseApiBasketball } from '@/lib/loadSchedulesFromApiBasketball';
import { getTeamDirectory } from '@/lib/loadSchedules';

export async function GET() {
  console.log('\n🔵🔵🔵 TESTING MEGA SUPERBET ONLY 🔵🔵🔵\n');
  
  try {
    // Load prospects
    const prospects = await loadProspects('espn');
    console.log(`🔵 Loaded ${prospects.length} total prospects`);
    
    // Filter to only Mega Superbet prospects
    const megaProspects = prospects.filter(p => 
      p.name.includes('Srzentic') || 
      p.name.includes('Suigo') || 
      p.team?.toLowerCase().includes('mega')
    );
    
    console.log(`🔵 Found ${megaProspects.length} Mega Superbet prospects:`);
    megaProspects.forEach(p => {
      console.log(`🔵   - ${p.name} (team: "${p.team}")`);
    });
    
    if (megaProspects.length === 0) {
      return NextResponse.json({ 
        error: 'No Mega Superbet prospects found',
        prospects: []
      });
    }
    
    // Get team directory
    const teamDirectory = await getTeamDirectory();
    
    // Test detection
    console.log(`\n🔵 Testing canUseApiBasketball detection:`);
    for (const prospect of megaProspects) {
      const canUse = canUseApiBasketball(prospect);
      console.log(`🔵   ${prospect.name}: ${canUse ? '✅ YES' : '❌ NO'}`);
      console.log(`🔵     Team: "${prospect.team}"`);
      console.log(`🔵     TeamDisplay: "${prospect.teamDisplay || 'none'}"`);
      console.log(`🔵     ESPNTeamName: "${prospect.espnTeamName || 'none'}"`);
    }
    
    // Fetch schedules for Mega Superbet prospects
    console.log(`\n🔵 Fetching schedules from API-Basketball:`);
    const results = [];
    
    for (const prospect of megaProspects) {
      console.log(`\n🔵 Fetching for ${prospect.name}...`);
      const teamDisplay = prospect.teamDisplay || prospect.espnTeamName || prospect.team || '';
      
      try {
        const entries = await fetchProspectScheduleFromApiBasketball(
          prospect,
          teamDisplay,
          teamDirectory
        );
        
        console.log(`🔵   ✅ Got ${entries.length} games for ${prospect.name}`);
        results.push({
          prospect: prospect.name,
          games: entries.length,
          entries: entries.map(e => ({
            date: e.game.dateKey,
            time: e.game.tipoff,
            home: e.game.homeTeam.displayName,
            away: e.game.awayTeam.displayName,
            id: e.game.id
          }))
        });
      } catch (error) {
        console.error(`🔵   ❌ Error fetching for ${prospect.name}:`, error);
        results.push({
          prospect: prospect.name,
          error: error instanceof Error ? error.message : String(error),
          games: 0
        });
      }
    }
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      prospects: megaProspects.map(p => ({
        name: p.name,
        team: p.team,
        canUseApiBasketball: canUseApiBasketball(p)
      })),
      results
    });
    
  } catch (error) {
    console.error('🔵❌ Test error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

