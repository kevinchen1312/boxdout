import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { loadAllSchedules, clearScheduleCache } from '@/lib/loadSchedules';
import { clearProspectCache } from '@/lib/loadProspects';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Clear ALL caches
    clearScheduleCache();
    clearProspectCache();
    
    console.log('[force-reload] Cleared all caches');

    // Force reload schedules
    const { gamesByDate } = await loadAllSchedules('myboard', true, userId);
    
    // Get Nov 27, Dec 3, Dec 6 games
    const nov27 = gamesByDate['2025-11-27'] || [];
    const dec3 = gamesByDate['2025-12-03'] || [];
    const dec6 = gamesByDate['2025-12-06'] || [];
    
    const formatGames = (games: any[]) => games.map((g: any) => ({
      homeTeam: g.homeTeam?.name || g.homeTeam?.displayName || '',
      awayTeam: g.awayTeam?.name || g.awayTeam?.displayName || '',
      prospects: g.prospects?.map((p: any) => `${p.name} (${p.team}, source: ${p.source || 'undefined'})`),
    }));
    
    return NextResponse.json({
      message: 'Force reloaded with all caches cleared',
      nov27: formatGames(nov27),
      dec3: formatGames(dec3),
      dec6: formatGames(dec6),
    });
  } catch (error) {
    console.error('[force-reload] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to force reload',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}





