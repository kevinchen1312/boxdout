import { NextRequest, NextResponse } from 'next/server';
import { searchApiBasketball } from '@/lib/apiBasketballSearch';
import { searchProspects } from '@/lib/espnSearch';

export async function GET(request: NextRequest) {
  try {
    const query = 'riethauser';
    
    // Search both APIs
    const [espnResults, apiBasketballResults] = await Promise.all([
      searchProspects(query).catch(err => {
        console.error('ESPN search error:', err);
        return [];
      }),
      searchApiBasketball(query).catch(err => {
        console.error('API-Basketball search error:', err);
        return [];
      }),
    ]);
    
    return NextResponse.json({
      query,
      espnResults: espnResults.map(r => ({
        externalId: r.externalId,
        fullName: r.fullName,
        position: r.position,
        team: r.team,
        league: r.league,
        provider: r.provider,
      })),
      apiBasketballResults: apiBasketballResults.map(r => ({
        externalId: r.externalId,
        fullName: r.fullName,
        position: r.position,
        team: r.team,
        league: r.league,
        provider: r.provider,
      })),
    });
  } catch (error) {
    console.error('[Test] Error:', error);
    return NextResponse.json(
      { error: 'Failed to search', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}




