import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';
import { fetchCustomPlayerGames } from '@/lib/fetchCustomPlayerGames';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/custom-players/[id]/fetch-games - Trigger game fetching for a player
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUserId = await getSupabaseUserId(userId);
    if (!supabaseUserId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { id: playerId } = await params;

    // Verify the player belongs to the user
    const { data: player, error: checkError } = await supabaseAdmin
      .from('custom_players')
      .select('id, name, team, team_id, user_id')
      .eq('id', playerId)
      .single();

    if (checkError || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    if (player.user_id !== supabaseUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Fetch games (this is async and may take time)
    const result = await fetchCustomPlayerGames(playerId, {
      id: player.id,
      name: player.name,
      team: player.team,
      team_id: player.team_id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to fetch games', gamesCount: 0 },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      gamesCount: result.gamesCount,
      message: `Successfully fetched ${result.gamesCount} games`,
    });
  } catch (error) {
    console.error('Error in POST /api/custom-players/[id]/fetch-games:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}





