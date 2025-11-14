import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get('gameId');

    if (!gameId) {
      return NextResponse.json({ error: 'Missing gameId' }, { status: 400 });
    }

    let currentUserId: string | null = null;

    // Get current user's Supabase ID if authenticated
    if (userId) {
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('clerk_user_id', userId)
        .single();

      if (userData) {
        currentUserId = userData.id;
      }
    }

    // Fetch all visible notes for this game
    // RLS policies will filter based on visibility and user's relationships
    const { data: notes, error } = await supabaseAdmin
      .from('notes')
      .select(`
        id,
        content,
        visibility,
        created_at,
        updated_at,
        user:users!notes_user_id_fkey(id, username, email),
        group:groups(id, name)
      `)
      .eq('game_id', gameId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notes:', error);
      return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }

    // Mark which notes belong to the current user
    const notesWithOwnership = notes?.map(note => ({
      ...note,
      isOwn: currentUserId ? note.user.id === currentUserId : false,
    })) || [];

    return NextResponse.json({ notes: notesWithOwnership });
  } catch (error) {
    console.error('Error fetching notes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

