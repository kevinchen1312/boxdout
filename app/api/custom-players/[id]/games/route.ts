import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/custom-players/[id]/games - Get games for a specific custom player
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const playerId = params.id;

    // Verify the player belongs to the user
    const { data: existingPlayer, error: checkError } = await supabaseAdmin
      .from('custom_players')
      .select('id, user_id')
      .eq('id', playerId)
      .single();

    if (checkError || !existingPlayer) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    if (existingPlayer.user_id !== supabaseUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get games for this player
    const { data, error } = await supabaseAdmin
      .from('custom_player_games')
      .select('*')
      .eq('custom_player_id', playerId)
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching custom player games:', error);
      return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
    }

    return NextResponse.json({ games: data || [] });
  } catch (error) {
    console.error('Error in GET /api/custom-players/[id]/games:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}





