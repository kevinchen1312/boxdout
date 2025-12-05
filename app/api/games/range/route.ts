import { NextRequest, NextResponse } from 'next/server';
import { parseISO, format } from 'date-fns';
import { getGamesBetween } from '@/lib/loadSchedules';
import type { RankingSource } from '@/lib/loadProspects';
import { auth } from '@clerk/nextjs/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const sourceParam = searchParams.get('source') || 'espn';
    
    if (!startDateParam || !endDateParam) {
      return NextResponse.json(
        { error: 'startDate and endDate parameters are required' },
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

    const startDate = parseISO(startDateParam);
    const endDate = parseISO(endDateParam);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date range provided', games: {} },
        { status: 400 }
      );
    }
    
    // Get userId if source is 'myboard' (needed for custom players)
    let clerkUserId: string | undefined;
    if (source === 'myboard') {
      const { userId } = await auth();
      clerkUserId = userId || undefined;
    }
    
    const games = await getGamesBetween(format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'), source, clerkUserId);

    return NextResponse.json({ games, source });
  } catch (error) {
    console.error('Error fetching schedule range:', error);
    return NextResponse.json(
      { error: 'Failed to load prospect schedules', games: {} },
      { status: 500 }
    );
  }
}
