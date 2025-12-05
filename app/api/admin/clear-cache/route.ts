import { NextResponse } from 'next/server';
import { clearScheduleCache } from '@/lib/loadSchedules';

export async function POST() {
  try {
    // Clear both ESPN and myboard caches
    clearScheduleCache('espn');
    clearScheduleCache('myboard');
    
    return NextResponse.json({
      success: true,
      message: 'Schedule cache cleared for both ESPN and My Board',
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Send POST request to clear cache',
    endpoints: {
      clearCache: 'POST /api/admin/clear-cache',
    },
  });
}




