import { NextRequest, NextResponse } from 'next/server';
import { searchPlayerByName, getPlayerById } from '@/lib/playerTeamMappings';

/**
 * Search for international players and return their current team info
 * 
 * Query params:
 * - name: Player name to search for (required if not using id)
 * - id: Player ID to look up (required if not using name)
 * - season: Season year (optional, defaults to 2025)
 * 
 * Example:
 * - GET /api/players/search?name=riethauser
 * - GET /api/players/search?id=16311
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get('name');
    const idParam = searchParams.get('id');
    const seasonParam = searchParams.get('season');
    
    const season = seasonParam ? parseInt(seasonParam) : 2025;
    
    // Search by ID
    if (idParam) {
      const playerId = parseInt(idParam);
      
      if (isNaN(playerId)) {
        return NextResponse.json(
          { error: 'Invalid player ID' },
          { status: 400 }
        );
      }
      
      const player = await getPlayerById(playerId, season);
      
      if (!player) {
        return NextResponse.json(
          { error: 'Player not found', playerId, season },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        success: true,
        player,
        source: 'database',
      });
    }
    
    // Search by name
    if (name) {
      if (name.trim().length < 2) {
        return NextResponse.json(
          { error: 'Search query must be at least 2 characters' },
          { status: 400 }
        );
      }
      
      const players = await searchPlayerByName(name, season);
      
      return NextResponse.json({
        success: true,
        players,
        count: players.length,
        query: name,
        season,
        source: 'database',
      });
    }
    
    // No search params provided
    return NextResponse.json(
      { error: 'Please provide either "name" or "id" query parameter' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('[API] Player search error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}





