import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAndStoreInternationalProspectGames } from '@/lib/fetchInternationalProspectGames';

/**
 * POST /api/admin/set-team-id
 * Set team_id for a prospect and refetch games
 * 
 * Body: { prospectId: string, teamId: number, teamName?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prospectId, teamId, teamName, leagueId } = body;

    if (!prospectId || !teamId) {
      return NextResponse.json({ error: 'Missing prospectId or teamId' }, { status: 400 });
    }

    // Update prospect with team_id
    const { error: updateError } = await supabaseAdmin
      .from('prospects')
      .update({ 
        team_id: teamId,
        ...(teamName && { team_name: teamName }),
      })
      .eq('id', prospectId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update prospect', details: updateError.message }, { status: 500 });
    }

    // Get prospect info
    const { data: prospect } = await supabaseAdmin
      .from('prospects')
      .select('*')
      .eq('id', prospectId)
      .single();

    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Delete old games
    await supabaseAdmin
      .from('prospect_games')
      .delete()
      .eq('prospect_id', prospectId);

    // Fetch new games
    const fetchResult = await fetchAndStoreInternationalProspectGames(
      prospectId,
      prospect.team_name,
      teamId
    );

    return NextResponse.json({
      success: true,
      prospect: {
        id: prospect.id,
        name: prospect.full_name,
        team: prospect.team_name,
        teamId: teamId,
      },
      gamesFetched: fetchResult.gamesCount,
      fetchSuccess: fetchResult.success,
      fetchError: fetchResult.error,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

