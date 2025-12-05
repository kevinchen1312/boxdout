import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ watchedGames: [], notesByGame: {} });
    }

    const { gameIds } = await req.json();
    
    if (!Array.isArray(gameIds) || gameIds.length === 0) {
      return NextResponse.json({ watchedGames: [], notesByGame: {} });
    }

    // Get user's Supabase ID
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ watchedGames: [], notesByGame: {} });
    }

    const currentUserId = userData.id;

    // Fetch watched games in parallel with notes
    const [watchedResult, notesResult] = await Promise.all([
      // Get all watched games for user
      supabaseAdmin
        .from('watched_games')
        .select('game_id, watched_at, game_date')
        .eq('user_id', currentUserId),
      
      // Get all notes for the requested games
      supabaseAdmin
        .from('notes')
        .select(`
          id,
          game_id,
          content,
          visibility,
          created_at,
          updated_at,
          user:users!notes_user_id_fkey(id, username, email),
          group:groups(id, name)
        `)
        .in('game_id', gameIds)
        .order('created_at', { ascending: false })
    ]);

    const watchedGames = watchedResult.data || [];
    const allNotes = notesResult.data || [];

    // Group notes by game_id and mark ownership
    const notesByGame: Record<string, any[]> = {};
    for (const note of allNotes) {
      if (!notesByGame[note.game_id]) {
        notesByGame[note.game_id] = [];
      }
      notesByGame[note.game_id].push({
        ...note,
        isOwn: note.user.id === currentUserId,
      });
    }

    return NextResponse.json({ 
      watchedGames,
      notesByGame 
    });
  } catch (error) {
    console.error('Error fetching game statuses:', error);
    return NextResponse.json({ watchedGames: [], notesByGame: {} });
  }
}





