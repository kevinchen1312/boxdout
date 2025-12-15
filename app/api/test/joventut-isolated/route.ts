import { NextResponse } from 'next/server';
import { getProspectsByRank } from '@/lib/loadProspects';
import { fetchProspectScheduleFromApiBasketball, canUseApiBasketball } from '@/lib/loadSchedulesFromApiBasketball';
import { getTeamDirectory } from '@/lib/loadSchedules';

export async function GET() {
  console.log('\n🔵🔵🔵 ISOLATING JOVENTUT BADALONA 🔵🔵🔵\n');
  
  try {
    // Load prospects
    const prospectsByRank = await getProspectsByRank('espn');
    console.log(`🔵 Loaded ${prospectsByRank.size} total prospects`);
    
    // Find Joventut prospects
    const joventutProspects = Array.from(prospectsByRank.values()).filter(p => 
      p.team?.toLowerCase().includes('joventut') ||
      p.name.toLowerCase().includes('joventut')
    );
    
    console.log(`🔵 Found ${joventutProspects.length} Joventut prospects:`);
    joventutProspects.forEach(p => {
      console.log(`🔵   - ${p.name} (team: "${p.team}")`);
    });
    
    if (joventutProspects.length === 0) {
      return NextResponse.json({ 
        error: 'No Joventut prospects found',
        prospects: []
      });
    }
    
    // Get team directory
    const teamDirectory = await getTeamDirectory();
    
    // Test detection
    console.log(`\n🔵 Testing canUseApiBasketball detection:`);
    for (const prospect of joventutProspects) {
      const canUse = canUseApiBasketball(prospect);
      console.log(`🔵   ${prospect.name}: ${canUse ? '✅ YES' : '❌ NO'}`);
      console.log(`🔵     Team: "${prospect.team}"`);
      console.log(`🔵     TeamDisplay: "${prospect.teamDisplay || 'none'}"`);
      console.log(`🔵     ESPNTeamName: "${prospect.espnTeamName || 'none'}"`);
    }
    
    // Fetch schedules for all Joventut prospects
    console.log(`\n🔵 Fetching schedules from API-Basketball:`);
    const results = [];
    
    for (const prospect of joventutProspects) {
      console.log(`\n🔵 Fetching for ${prospect.name}...`);
      const teamDisplay = prospect.teamDisplay || prospect.espnTeamName || prospect.team || '';
      
      try {
        const entries = await fetchProspectScheduleFromApiBasketball(
          prospect,
          teamDisplay,
          teamDirectory
        );
        
        console.log(`🔵   ✅ Got ${entries.length} games for ${prospect.name}`);
        
        // Group games by league
        const gamesByLeague: Record<string, any[]> = {};
        entries.forEach(entry => {
          const league = entry.game.note || 'Unknown League';
          if (!gamesByLeague[league]) {
            gamesByLeague[league] = [];
          }
          gamesByLeague[league].push({
            date: entry.game.dateKey,
            time: entry.game.tipoff,
            home: entry.game.homeTeam.displayName,
            away: entry.game.awayTeam.displayName,
            id: entry.game.id
          });
        });
        
        console.log(`🔵   Games by league:`);
        Object.keys(gamesByLeague).forEach(league => {
          console.log(`🔵     - ${league}: ${gamesByLeague[league].length} games`);
        });
        
        // Show sample games
        console.log(`🔵   Sample games (first 10):`);
        entries.slice(0, 10).forEach((entry, idx) => {
          console.log(`🔵     ${idx + 1}. ${entry.game.dateKey} ${entry.game.tipoff} - ${entry.game.homeTeam.displayName} vs ${entry.game.awayTeam.displayName} (${entry.game.note || 'no league'})`);
        });
        
        results.push({
          prospect: prospect.name,
          team: prospect.team,
          games: entries.length,
          gamesByLeague: Object.keys(gamesByLeague).map(league => ({
            league,
            count: gamesByLeague[league].length
          })),
          sampleGames: entries.slice(0, 20).map(e => ({
            date: e.game.dateKey,
            time: e.game.tipoff,
            home: e.game.homeTeam.displayName,
            away: e.game.awayTeam.displayName,
            league: e.game.note,
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
      prospects: joventutProspects.map(p => ({
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






