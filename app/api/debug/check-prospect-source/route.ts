import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getProspectsByRank } from '@/lib/loadProspects';

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const prospects = await getProspectsByRank('myboard', clerkUserId);
    
    // Find Adiguzel
    const adiguzelProspects = Array.from(prospects.values()).filter(p => 
      p.name?.toLowerCase().includes('adiguzel')
    );

    return NextResponse.json({
      totalProspects: prospects.size,
      adiguzelFound: adiguzelProspects.length,
      adiguzelData: adiguzelProspects.map(p => ({
        name: p.name,
        team: p.team,
        rank: p.rank,
        source: (p as any).source,
        hasSource: 'source' in p,
        allKeys: Object.keys(p),
      })),
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}




