import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';
import { fetchAndStoreInternationalProspectGames } from '@/lib/fetchInternationalProspectGames';

/**
 * POST /api/admin/refresh-player-games
 * Delete and refetch games for a specific player
 * 
 * Body: { prospectId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { prospectId } = body;

    if (!prospectId) {
      return NextResponse.json({ error: 'Missing prospectId' }, { status: 400 });
    }

    // Get prospect info
    const { data: prospect, error: prospectError } = await supabaseAdmin
      .from('prospects')
      .select('*')
      .eq('id', prospectId)
      .single();

    if (prospectError || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    console.log(`[refresh-player-games] Refreshing games for ${prospect.full_name} (${prospect.team_name})`);

    // Delete existing games
    const { error: deleteError } = await supabaseAdmin
      .from('prospect_games')
      .delete()
      .eq('prospect_id', prospectId);

    if (deleteError) {
      console.error('[refresh-player-games] Error deleting games:', deleteError);
      return NextResponse.json({ error: 'Failed to delete old games' }, { status: 500 });
    }

    console.log('[refresh-player-games] Deleted old games');

    // Refetch games based on source
    let result;
    if (prospect.source === 'external' && prospect.team_name) {
      // International player - refetch from API-Basketball
      console.log('[refresh-player-games] Refetching international games...');
      result = await fetchAndStoreInternationalProspectGames(
        prospectId,
        prospect.team_name,
        prospect.team_id // API Basketball team ID if available
      );
    } else {
      return NextResponse.json({ 
        error: 'Only international/external players support game refresh currently',
        prospect: {
          id: prospect.id,
          name: prospect.full_name,
          source: prospect.source,
        },
      }, { status: 400 });
    }

    return NextResponse.json({
      success: result.success,
      prospect: {
        id: prospect.id,
        name: prospect.full_name,
        team: prospect.team_name,
      },
      gamesCount: result.gamesCount,
      error: result.error,
    });
  } catch (error) {
    console.error('[refresh-player-games] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}




