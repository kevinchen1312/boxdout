import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { gameId, gameDate } = await req.json();

    if (!gameId || !gameDate) {
      return NextResponse.json({ error: 'Missing gameId or gameDate' }, { status: 400 });
    }

    // Get user's Supabase ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if already watched
    const { data: existing } = await supabase
      .from('watched_games')
      .select('id')
      .eq('user_id', userData.id)
      .eq('game_id', gameId)
      .single();

    if (existing) {
      // Remove watch
      const { error: deleteError } = await supabase
        .from('watched_games')
        .delete()
        .eq('user_id', userData.id)
        .eq('game_id', gameId);

      if (deleteError) {
        return NextResponse.json({ error: 'Failed to remove watch' }, { status: 500 });
      }

      return NextResponse.json({ watched: false });
    } else {
      // Add watch
      const { error: insertError } = await supabase
        .from('watched_games')
        .insert({
          user_id: userData.id,
          game_id: gameId,
          game_date: gameDate,
        });

      if (insertError) {
        return NextResponse.json({ error: 'Failed to add watch' }, { status: 500 });
      }

      return NextResponse.json({ watched: true });
    }
  } catch (error) {
    console.error('Error toggling watched status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

