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

    // Get friends' watched games
    // Using admin client to bypass RLS since we're doing server-side auth with Clerk
    const { data, error } = await supabaseAdmin
      .from('watched_games')
      .select(`
        game_id,
        watched_at,
        game_date,
        user:users!watched_games_user_id_fkey(id, username, email)
      `)
      .neq('user_id', userData.id)
      .order('watched_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching friends watched games:', error);
      return NextResponse.json({ error: 'Failed to fetch friends watched games' }, { status: 500 });
    }

    return NextResponse.json({ friendsWatched: data });
  } catch (error) {
    console.error('Error fetching friends watched games:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


