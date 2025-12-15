import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getProspectsByRank } from '@/lib/loadProspects';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const prospectsByRank = await getProspectsByRank('myboard', userId);
    
    // Check for Duke, Louisville, Fresno State players
    const collegePlayers = [];
    for (const [rank, prospect] of prospectsByRank.entries()) {
      const team = prospect.team?.toLowerCase() || '';
      if (team.includes('duke') || team.includes('louisville') || team.includes('fresno')) {
        collegePlayers.push({
          rank,
          name: prospect.name,
          team: prospect.team,
          source: prospect.source || 'MISSING',
        });
      }
    }
    
    return NextResponse.json({
      totalProspects: prospectsByRank.size,
      collegePlayers,
      message: collegePlayers.length > 0 
        ? `Found ${collegePlayers.length} Duke/Louisville/Fresno players`
        : `No Duke/Louisville/Fresno players found`,
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to check',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}





