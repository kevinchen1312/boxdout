import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { gameId, content, visibility, groupId } = await req.json();

    if (!gameId || !content) {
      return NextResponse.json({ error: 'Missing gameId or content' }, { status: 400 });
    }

    // Validate visibility
    const validVisibility = ['self', 'friends', 'group', 'public'];
    if (visibility && !validVisibility.includes(visibility)) {
      return NextResponse.json({ error: 'Invalid visibility value' }, { status: 400 });
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

    // Always create a new note (allow multiple notes per game)
    const { data, error } = await supabaseAdmin
      .from('notes')
      .insert({
        user_id: userData.id,
        game_id: gameId,
        content,
        visibility: visibility || 'self',
        group_id: groupId || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    }

    return NextResponse.json({ note: data });
  } catch (error) {
    console.error('Error creating/updating note:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

