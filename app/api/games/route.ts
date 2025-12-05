import { NextRequest, NextResponse } from 'next/server';
import { format, parseISO } from 'date-fns';
import { getGamesForDate } from '@/lib/loadSchedules';
import type { RankingSource } from '@/lib/loadProspects';
import { auth } from '@clerk/nextjs/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateParam = searchParams.get('date');
    const sourceParam = searchParams.get('source') || 'espn';
    
    // Validate source parameter
    if (sourceParam !== 'espn' && sourceParam !== 'myboard') {
      return NextResponse.json(
        { error: 'Invalid source. Must be "espn" or "myboard"', games: [] },
        { status: 400 }
      );
    }
    
    const source = sourceParam as RankingSource;
    
    // If no date provided, use today
    const isoDate = dateParam || format(new Date(), 'yyyy-MM-dd');
    const parsedDate = parseISO(isoDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date provided', games: [] },
        { status: 400 }
      );
    }
    const dateKey = format(parsedDate, 'yyyy-MM-dd');
    
    // Get userId if available (needed for custom players in 'myboard' and watchlist players in both)
    const { userId } = await auth();
    const clerkUserId = userId || undefined;
    
    const games = await getGamesForDate(dateKey, source, clerkUserId);

    return NextResponse.json({ games, date: dateKey, source });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json(
      { error: 'Failed to load prospect schedules', games: [] },
      { status: 500 }
    );
  }
}
