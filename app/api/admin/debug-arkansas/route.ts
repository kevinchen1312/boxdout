import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getProspectsByRank } from '@/lib/loadProspects';
import { loadAllSchedules } from '@/lib/loadSchedules';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[debug-arkansas] Loading schedules for myboard...');
    
    // Load prospects for myboard (user's watchlist)
    const prospectsByRank = await getProspectsByRank('myboard', userId);
    
    console.log('[debug-arkansas] Prospects loaded:', prospectsByRank.size);
    
    // Check Adiguzel in the prospects map
    let adiguzelProspect = null;
    for (const [id, prospect] of prospectsByRank.entries()) {
      if (prospect.name?.toLowerCase().includes('adiguzel')) {
        adiguzelProspect = { id, prospect };
        break;
      }
    }
    
    // Load all schedules
    const { gamesByDate } = await loadAllSchedules('myboard', false, userId);
    
    // Filter for Arkansas games
    const arkansasGames = [];
    for (const [dateKey, games] of Object.entries(gamesByDate)) {
      for (const game of games) {
        const homeTeam = game.homeTeam?.name || game.homeTeam?.displayName || '';
        const awayTeam = game.awayTeam?.name || game.awayTeam?.displayName || '';
        
        if (homeTeam.toLowerCase().includes('arkansas') || awayTeam.toLowerCase().includes('arkansas')) {
          arkansasGames.push({
            dateKey,
            homeTeam,
            awayTeam,
            prospects: game.prospects?.map((p: any) => ({
              name: p.name,
              team: p.team,
              rank: p.rank,
              source: p.source,
            })) || [],
          });
        }
      }
    }
    
    // Filter for Duke/Louisville/Fresno games
    const suspiciousGames = [];
    for (const [dateKey, games] of Object.entries(gamesByDate)) {
      for (const game of games) {
        const homeTeam = game.homeTeam?.name || game.homeTeam?.displayName || '';
        const awayTeam = game.awayTeam?.name || game.awayTeam?.displayName || '';
        
        if (homeTeam.toLowerCase().includes('duke') || awayTeam.toLowerCase().includes('duke') ||
            homeTeam.toLowerCase().includes('louisville') || awayTeam.toLowerCase().includes('louisville') ||
            homeTeam.toLowerCase().includes('fresno') || awayTeam.toLowerCase().includes('fresno')) {
          
          // Check if Adiguzel is in this game
          const hasAdiguzel = game.prospects?.some((p: any) => p.name?.toLowerCase().includes('adiguzel'));
          
          if (hasAdiguzel) {
            suspiciousGames.push({
              dateKey,
              homeTeam,
              awayTeam,
              prospects: game.prospects?.map((p: any) => ({
                name: p.name,
                team: p.team,
                rank: p.rank,
                source: p.source,
              })) || [],
            });
          }
        }
      }
    }
    
    return NextResponse.json({
      adiguzelInProspectsMap: adiguzelProspect ? {
        id: adiguzelProspect.id,
        name: adiguzelProspect.prospect.name,
        team: adiguzelProspect.prospect.team,
        source: adiguzelProspect.prospect.source,
        rank: adiguzelProspect.prospect.rank,
      } : null,
      totalProspects: prospectsByRank.size,
      arkansasGames: arkansasGames,
      suspiciousGamesWithAdiguzel: suspiciousGames,
    });
  } catch (error) {
    console.error('[debug-arkansas] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to debug Arkansas games',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

