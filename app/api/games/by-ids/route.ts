import { NextRequest, NextResponse } from 'next/server';
import { loadAllSchedules } from '@/lib/loadSchedules';
import type { RankingSource } from '@/lib/loadProspects';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const gameIdsParam = searchParams.get('gameIds');
    const sourceParam = searchParams.get('source') || 'espn';
    
    if (!gameIdsParam) {
      return NextResponse.json(
        { error: 'gameIds parameter is required', games: {} },
        { status: 400 }
      );
    }

    // Validate source parameter
    if (sourceParam !== 'espn' && sourceParam !== 'myboard') {
      return NextResponse.json(
        { error: 'Invalid source. Must be "espn" or "myboard"', games: {} },
        { status: 400 }
      );
    }
    
    const source = sourceParam as RankingSource;
    const gameIds = gameIdsParam.split(',').filter(Boolean);
    
    if (gameIds.length === 0) {
      return NextResponse.json({ games: {} });
    }

    // Load all schedules (cached after first load, but still expensive on first call)
    // TODO: Optimize this to fetch only needed games without loading entire season
    const { gamesByDate } = await loadAllSchedules(source);
    
    // Filter to only the games we need
    const filteredGames: Record<string, any[]> = {};
    const gameIdsSet = new Set(gameIds);
    let foundCount = 0;
    
    // Early exit if we've found all games
    for (const [date, games] of Object.entries(gamesByDate)) {
      if (foundCount >= gameIds.length) break;
      
      const matchingGames = (games as any[]).filter((game: any) => 
        gameIdsSet.has(game.id)
      );
      if (matchingGames.length > 0) {
        filteredGames[date] = matchingGames;
        foundCount += matchingGames.length;
      }
    }

    return NextResponse.json(
      { games: filteredGames, source },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching games by IDs:', error);
    return NextResponse.json(
      { error: 'Failed to load games', games: {} },
      { status: 500 }
    );
  }
}

