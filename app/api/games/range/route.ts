import { NextRequest, NextResponse } from 'next/server';
import { parseISO, format } from 'date-fns';
import { getGamesBetween } from '@/lib/loadSchedules';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    
    if (!startDateParam || !endDateParam) {
      return NextResponse.json(
        { error: 'startDate and endDate parameters are required' },
        { status: 400 }
      );
    }

    const startDate = parseISO(startDateParam);
    const endDate = parseISO(endDateParam);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date range provided', games: {} },
        { status: 400 }
      );
    }
    
    const games = await getGamesBetween(format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'));

    return NextResponse.json({ games });
  } catch (error) {
    console.error('Error fetching schedule range:', error);
    return NextResponse.json(
      { error: 'Failed to load prospect schedules', games: {} },
      { status: 500 }
    );
  }
}
