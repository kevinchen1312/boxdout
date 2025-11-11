import { NextRequest, NextResponse } from 'next/server';
import { format, parseISO } from 'date-fns';
import { getGamesForDate } from '@/lib/loadSchedules';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateParam = searchParams.get('date');
    
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
    
    const games = await getGamesForDate(dateKey);

    return NextResponse.json({ games, date: dateKey });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json(
      { error: 'Failed to load prospect schedules', games: [] },
      { status: 500 }
    );
  }
}
