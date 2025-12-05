import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { loadAllSchedules } from '@/lib/loadSchedules';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Load schedules for myboard
    const { gamesByDate } = await loadAllSchedules('myboard', false, userId);
    
    // Get Nov 27 games
    const nov27Games = gamesByDate['2025-11-27'] || [];
    
    // Filter for games with Duke, Besiktas, or Arkansas
    const relevantGames = nov27Games.filter((game: any) => {
      const homeTeam = game.homeTeam?.name || game.homeTeam?.displayName || '';
      const awayTeam = game.awayTeam?.name || game.awayTeam?.displayName || '';
      return homeTeam.toLowerCase().includes('duke') || 
             awayTeam.toLowerCase().includes('duke') ||
             homeTeam.toLowerCase().includes('besiktas') || 
             awayTeam.toLowerCase().includes('besiktas') ||
             homeTeam.toLowerCase().includes('arkansas') || 
             awayTeam.toLowerCase().includes('arkansas');
    });
    
    return NextResponse.json({
      date: '2025-11-27',
      totalGames: nov27Games.length,
      relevantGames: relevantGames.map((game: any) => ({
        id: game.id,
        homeTeam: game.homeTeam?.name || game.homeTeam?.displayName || '',
        awayTeam: game.awayTeam?.name || game.awayTeam?.displayName || '',
        prospects: game.prospects?.map((p: any) => ({
          name: p.name,
          team: p.team,
          rank: p.rank,
          source: p.source,
        })) || [],
      })),
    });
  } catch (error) {
    console.error('[check-nov27-games] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to check Nov 27 games',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

