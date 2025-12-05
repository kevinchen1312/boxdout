import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';
import { backfillWatchlistPlayerGames } from '@/lib/fetchProspectGames';

/**
 * GET /api/test/coen-carr
 * Test endpoint to check Coen Carr's data and games
 */
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'You must be signed in' },
        { status: 401 }
      );
    }

    const supabaseUserId = await getSupabaseUserId(clerkUserId);
    if (!supabaseUserId) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Find Coen Carr in prospects
    const { data: coenCarr, error: prospectError } = await supabaseAdmin
      .from('prospects')
      .select('*')
      .ilike('full_name', '%coen%carr%')
      .maybeSingle();

    if (prospectError) {
      return NextResponse.json({
        error: 'Error finding prospect',
        details: prospectError,
      }, { status: 500 });
    }

    if (!coenCarr) {
      return NextResponse.json({
        error: 'Coen Carr not found in prospects table',
        suggestion: 'He may need to be imported first',
      });
    }

    // Check if he's in user's watchlist
    const { data: ranking, error: rankingError } = await supabaseAdmin
      .from('user_rankings')
      .select('*')
      .eq('user_id', supabaseUserId)
      .eq('prospect_id', coenCarr.id)
      .maybeSingle();

    // Check if he has games
    const { data: games, error: gamesError } = await supabaseAdmin
      .from('prospect_games')
      .select('*')
      .eq('prospect_id', coenCarr.id)
      .order('date_key', { ascending: true });

    return NextResponse.json({
      prospect: {
        id: coenCarr.id,
        full_name: coenCarr.full_name,
        team_name: coenCarr.team_name,
        team_id: coenCarr.team_id,
        source: coenCarr.source,
      },
      inWatchlist: !!ranking,
      ranking: ranking ? {
        rank: ranking.rank,
        source: ranking.source,
      } : null,
      gamesCount: games?.length || 0,
      games: games?.slice(0, 5) || [], // First 5 games
      allGames: games || [],
      needsBackfill: !games || games.length === 0,
    });
  } catch (error) {
    console.error('[test/coen-carr] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/test/coen-carr
 * Delete and re-fetch Coen Carr's games with correct timezone
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'You must be signed in' },
        { status: 401 }
      );
    }

    const supabaseUserId = await getSupabaseUserId(clerkUserId);
    if (!supabaseUserId) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Find Coen Carr
    const { data: coenCarr, error: prospectError } = await supabaseAdmin
      .from('prospects')
      .select('*')
      .ilike('full_name', '%coen%carr%')
      .maybeSingle();

    if (prospectError || !coenCarr) {
      return NextResponse.json({
        error: 'Coen Carr not found',
        details: prospectError,
      }, { status: 404 });
    }

    // Delete all existing games for Coen Carr
    const { error: deleteError } = await supabaseAdmin
      .from('prospect_games')
      .delete()
      .eq('prospect_id', coenCarr.id);

    if (deleteError) {
      return NextResponse.json({
        error: 'Failed to delete old games',
        details: deleteError,
      }, { status: 500 });
    }

    // Re-fetch games if team_id exists
    if (coenCarr.team_id) {
      const { fetchAndStoreProspectGames } = await import('@/lib/fetchProspectGames');
      const result = await fetchAndStoreProspectGames(coenCarr.id, coenCarr.team_id);
      
      return NextResponse.json({
        success: true,
        message: 'Deleted old games and re-fetched with correct timezone',
        deletedOldGames: true,
        fetchedGames: result.gamesCount,
        result,
      });
    } else {
      return NextResponse.json({
        success: true,
        message: 'Deleted old games, but no team_id to re-fetch',
        deletedOldGames: true,
        teamId: null,
      });
    }
  } catch (error) {
    console.error('[test/coen-carr] Error:', error);
    return NextResponse.json(
      {
        error: 'Operation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

