import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
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

    // Get accepted friend IDs (bidirectional friendships)
    const { data: friendships, error: friendshipsError } = await supabaseAdmin
      .from('friends')
      .select('user1_id, user2_id')
      .or(`user1_id.eq.${userData.id},user2_id.eq.${userData.id}`);

    if (friendshipsError) {
      console.error('Error fetching friendships:', friendshipsError);
      return NextResponse.json({ error: 'Failed to fetch friends' }, { status: 500 });
    }

    // Extract friend IDs
    const friendIds = friendships?.map(f => 
      f.user1_id === userData.id ? f.user2_id : f.user1_id
    ) || [];

    const hasFriends = friendIds.length > 0;

    if (friendIds.length === 0) {
      return NextResponse.json({ items: [], hasFriends: false });
    }

    // Fetch friends' watched games
    const { data: watched, error: watchedError } = await supabaseAdmin
      .from('watched_games')
      .select(`
        id,
        user_id,
        watched_at,
        game_id,
        game_date,
        user:users!watched_games_user_id_fkey(id, username, email)
      `)
      .in('user_id', friendIds)
      .order('watched_at', { ascending: false })
      .limit(20);

    if (watchedError) {
      console.error('Error fetching watched games:', watchedError);
    }

    // Fetch friends' notes (visibility: friends or public)
    const { data: notes, error: notesError } = await supabaseAdmin
      .from('notes')
      .select(`
        id,
        user_id,
        content,
        visibility,
        updated_at,
        game_id,
        user:users!notes_user_id_fkey(id, username, email)
      `)
      .in('user_id', friendIds)
      .in('visibility', ['friends', 'public'])
      .order('updated_at', { ascending: false })
      .limit(20);

    if (notesError) {
      console.error('Error fetching notes:', notesError);
    }

    // Combine and normalize into activity items
    const items = [
      ...(watched || []).map((w: any) => {
        // Handle Supabase's typing (may return as array for joins)
        const wUser = Array.isArray(w.user) ? w.user[0] : w.user;
        return {
          type: 'watched' as const,
          id: w.id,
          user: {
            id: wUser?.id,
            username: wUser?.username,
            email: wUser?.email,
          },
          gameId: w.game_id,
          gameDate: w.game_date,
          timestamp: w.watched_at,
        };
      }),
      ...(notes || []).map((n: any) => {
        // Handle Supabase's typing (may return as array for joins)
        const nUser = Array.isArray(n.user) ? n.user[0] : n.user;
        return {
          type: 'note' as const,
          id: n.id,
          user: {
            id: nUser?.id,
            username: nUser?.username,
            email: nUser?.email,
          },
          gameId: n.game_id,
          content: n.content,
          timestamp: n.updated_at,
        };
      }),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
     .slice(0, 30); // Limit to 30 most recent

    return NextResponse.json({ items, hasFriends: true });
  } catch (error) {
    console.error('Error fetching friend activity:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

