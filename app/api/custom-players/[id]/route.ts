import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// PUT /api/custom-players/[id] - Update a custom player
export async function PUT(
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
    const body = await request.json();
    const { name, position, team, rank, height, class: playerClass, jersey, team_id } = body;

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

    // Build update object
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (position !== undefined) updateData.position = position;
    if (team !== undefined) updateData.team = team;
    if (rank !== undefined) updateData.rank = rank;
    if (height !== undefined) updateData.height = height || null;
    if (playerClass !== undefined) updateData.class = playerClass || null;
    if (jersey !== undefined) updateData.jersey = jersey || null;
    if (team_id !== undefined) updateData.team_id = team_id || null;

    const { data, error } = await supabaseAdmin
      .from('custom_players')
      .update(updateData)
      .eq('id', playerId)
      .select()
      .single();

    if (error) {
      console.error('Error updating custom player:', error);
      return NextResponse.json({ error: 'Failed to update custom player' }, { status: 500 });
    }

    return NextResponse.json({ player: data });
  } catch (error) {
    console.error('Error in PUT /api/custom-players/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/custom-players/[id] - Delete a custom player
export async function DELETE(
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

    // Delete the player (games will be cascade deleted)
    const { error } = await supabaseAdmin
      .from('custom_players')
      .delete()
      .eq('id', playerId);

    if (error) {
      console.error('Error deleting custom player:', error);
      return NextResponse.json({ error: 'Failed to delete custom player' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/custom-players/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}





