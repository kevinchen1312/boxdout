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
    
    const prospects = [];
    for (const [rank, prospect] of prospectsByRank.entries()) {
      prospects.push({
        rank,
        name: prospect.name,
        team: prospect.team,
        source: prospect.source || 'MISSING',
      });
    }
    
    return NextResponse.json({
      totalProspects: prospects.length,
      prospects: prospects.slice(0, 20), // First 20
      adiguzel: prospects.find(p => p.name?.toLowerCase().includes('adiguzel')),
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to check prospect sources',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}




