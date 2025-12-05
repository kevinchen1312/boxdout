import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getProspectsByRank } from '@/lib/loadProspects';

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Load prospects as they would be in the schedule loading
    const prospects = await getProspectsByRank('myboard', clerkUserId);
    
    // Convert to array for easier inspection
    const prospectsArray = Array.from(prospects.entries()).map(([rank, p]) => ({
      rank,
      name: p.name,
      team: p.team,
      hasId: !!p.id,
    }));

    // Find Hoshikawa-like entries
    const hoshikawaMatches = prospectsArray.filter(p => 
      p.name?.toLowerCase().includes('hoshi') || 
      p.team?.toLowerCase().includes('naga')
    );

    return NextResponse.json({
      totalProspects: prospects.size,
      hoshikawaMatches,
      rank15: prospectsArray.find(p => p.rank === 15),
      allProspects: prospectsArray,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}




