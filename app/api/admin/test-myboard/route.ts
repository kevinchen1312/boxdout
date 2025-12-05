import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getProspectsByRank } from '@/lib/loadProspects';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Load prospects for myboard
    const prospectsByRank = await getProspectsByRank('myboard', userId);
    
    // Check for Arkansas players
    const arkansasPlayers = [];
    for (const [rank, prospect] of prospectsByRank.entries()) {
      if (prospect.team?.toLowerCase().includes('arkansas')) {
        arkansasPlayers.push({
          rank,
          name: prospect.name,
          team: prospect.team,
          source: prospect.source || 'MISSING',
        });
      }
    }
    
    return NextResponse.json({
      totalProspects: prospectsByRank.size,
      arkansasPlayers: arkansasPlayers,
      message: arkansasPlayers.length > 0 
        ? `❌ BUG: ${arkansasPlayers.length} Arkansas players found (should be 0!)`
        : `✅ GOOD: No Arkansas players (fix is working!)`,
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to test myboard',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}




