import { NextRequest, NextResponse } from 'next/server';
import { searchApiBasketball } from '@/lib/apiBasketballSearch';

/**
 * GET /api/test/search-mbaye
 * Test endpoint to verify API-Basketball search for Mbaye Ndiaye
 */
export async function GET(request: NextRequest) {
  try {
    const query = 'Mbaye Ndiaye';
    
    console.log(`[Test] Searching API-Basketball for "${query}"...`);
    const results = await searchApiBasketball(query);
    
    console.log(`[Test] Found ${results.length} results`);
    results.forEach((r, i) => {
      console.log(`[Test] Result ${i + 1}: ${r.fullName} - ${r.team} (${r.league})`);
    });
    
    return NextResponse.json({
      query,
      totalResults: results.length,
      results: results.map(r => ({
        externalId: r.externalId,
        fullName: r.fullName,
        position: r.position,
        team: r.team,
        league: r.league,
        provider: r.provider,
        teamId: r.teamId,
        allTeams: r.allTeams,
      })),
    }, { status: 200 });
  } catch (error) {
    console.error('[Test] Error:', error);
    return NextResponse.json(
      { error: 'Test failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}





