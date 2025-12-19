import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { GameWithProspects } from '@/app/utils/gameMatching';

/**
 * GET /api/games/team/[teamId]
 * Fetches all games for a specific team from the database (ncaa_team_schedules or nbl_team_schedules)
 * This is used to load games for watchlist players whose teams may not be in the ESPN top prospects feed
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    
    if (!teamId) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 });
    }

    console.log(`[API/games/team] Fetching games for team ${teamId}`);

    // Fetch from ncaa_team_schedules
    const { data: ncaaGames, error: ncaaError } = await supabaseAdmin
      .from('ncaa_team_schedules')
      .select('*')
      .eq('espn_team_id', teamId)
      .order('date', { ascending: true });

    if (ncaaError) {
      console.error(`[API/games/team] Error fetching NCAA games for team ${teamId}:`, ncaaError);
    }

    // Also fetch from nbl_team_schedules (for NBL teams)
    const { data: nblGames, error: nblError } = await supabaseAdmin
      .from('nbl_team_schedules')
      .select('*')
      .eq('espn_team_id', teamId)
      .order('date', { ascending: true });

    if (nblError) {
      console.error(`[API/games/team] Error fetching NBL games for team ${teamId}:`, nblError);
    }

    // Combine and transform to Game format
    const allDbGames = [...(ncaaGames || []), ...(nblGames || [])];
    
    if (allDbGames.length === 0) {
      console.log(`[API/games/team] No games found for team ${teamId}`);
      return NextResponse.json({ games: [], teamId });
    }

    // Transform database format to GameWithProspects format
    const games: GameWithProspects[] = allDbGames.map((dbGame) => ({
      id: dbGame.game_id,
      date: dbGame.date,
      dateKey: dbGame.date_key,
      tipoff: dbGame.status_detail?.includes(':') 
        ? dbGame.status_detail.split(' ')[0] 
        : undefined,
      status: dbGame.status || 'scheduled',
      statusDetail: dbGame.status_detail || undefined,
      homeTeam: {
        id: dbGame.home_team_id,
        name: dbGame.home_team_name,
        displayName: dbGame.home_team_display_name,
        logo: dbGame.home_team_logo,
        score: dbGame.home_score?.toString(),
      },
      awayTeam: {
        id: dbGame.away_team_id,
        name: dbGame.away_team_name,
        displayName: dbGame.away_team_display_name,
        logo: dbGame.away_team_logo,
        score: dbGame.away_score?.toString(),
      },
      broadcasts: dbGame.broadcasts || [],
      venue: dbGame.venue || undefined,
      venueCity: dbGame.venue_city || undefined,
      venueState: dbGame.venue_state || undefined,
      // These will be populated by the client-side decoration
      homeTrackedPlayers: [],
      awayTrackedPlayers: [],
      homeProspects: [],
      awayProspects: [],
      prospects: [],
    }));

    console.log(`[API/games/team] Found ${games.length} games for team ${teamId}`);

    return NextResponse.json({ 
      games, 
      teamId,
      source: ncaaGames?.length ? 'ncaa' : 'nbl',
    });
  } catch (error) {
    console.error('[API/games/team] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team games' },
      { status: 500 }
    );
  }
}

