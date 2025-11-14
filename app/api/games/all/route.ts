import { NextRequest, NextResponse } from 'next/server';
import { loadAllSchedules } from '@/lib/loadSchedules';
import type { RankingSource } from '@/lib/loadProspects';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sourceParam = searchParams.get('source') || 'espn';
    
    // Validate source parameter
    if (sourceParam !== 'espn' && sourceParam !== 'myboard') {
      return NextResponse.json(
        { error: 'Invalid source. Must be "espn" or "myboard"', games: {} },
        { status: 400 }
      );
    }
    
    const source = sourceParam as RankingSource;
    
    console.time(`[API] loadAllSchedules-${source}`);
    const { gamesByDate } = await loadAllSchedules(source);
    console.timeEnd(`[API] loadAllSchedules-${source}`);

    return NextResponse.json(
      { games: gamesByDate, source },
      {
        headers: {
          // Cache for 5 minutes in browser and CDN, allow stale content for 10 minutes while revalidating
          'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
          // Add timestamp for debugging
          'X-Generated-At': new Date().toISOString(),
        },
      }
    );
  } catch (error) {
    console.error('Error fetching all schedules:', error);
    return NextResponse.json(
      { error: 'Failed to load prospect schedules', games: {} },
      { status: 500 }
    );
  }
}
