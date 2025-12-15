import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { buildGameKey } from '@/lib/loadSchedules';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Build game keys for the suspicious games
    const nov27Date = '2025-11-27';
    const time = '20:00:00';
    const venue = 'United Center-Chicago IL';
    
    // Key for Duke @ Arkansas
    const arkansasDukeKey = buildGameKey(nov27Date, time, 'arkansas', 'duke', venue, 'ncaa');
    
    // Key for Duke @ Besiktas (if this existed)
    const besiktasDukeKey = buildGameKey(nov27Date, time, 'besiktas', 'duke', venue, 'ncaa');
    
    // Key for Besiktas game (no venue, different league)
    const besiktasKey = buildGameKey(nov27Date, time, 'besiktas', 'someTeam', undefined, '104');
    
    return NextResponse.json({
      arkansasDukeKey,
      besiktasDukeKey,
      besiktasKey,
      keysMatch: arkansasDukeKey === besiktasDukeKey,
      explanation: arkansasDukeKey === besiktasDukeKey 
        ? "❌ KEYS COLLIDE! Arkansas and Besiktas games have same key!"
        : "✅ Keys are different (collision not the issue)",
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to check game keys',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}





