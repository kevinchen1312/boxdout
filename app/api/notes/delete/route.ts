import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const noteId = searchParams.get('noteId');

    if (!noteId) {
      return NextResponse.json({ error: 'Missing noteId' }, { status: 400 });
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

    // Delete note (RLS policy ensures user can only delete their own notes)
    const { error } = await supabaseAdmin
      .from('notes')
      .delete()
      .eq('id', noteId)
      .eq('user_id', userData.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting note:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

