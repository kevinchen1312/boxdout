import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's Supabase ID
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get all watched games for user
    const { data, error } = await supabaseAdmin
      .from('watched_games')
      .select('game_id, watched_at, game_date')
      .eq('user_id', userData.id)
      .order('watched_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch watched games' }, { status: 500 });
    }

    return NextResponse.json({ watchedGames: data });
  } catch (error) {
    console.error('Error fetching watched games:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


