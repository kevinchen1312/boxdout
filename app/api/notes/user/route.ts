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

    // Fetch all notes for this user
    const { data: notes, error } = await supabaseAdmin
      .from('notes')
      .select(`
        id,
        content,
        visibility,
        created_at,
        updated_at,
        game_id,
        group:groups(id, name)
      `)
      .eq('user_id', userData.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user notes:', error);
      return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }

    return NextResponse.json(
      { notes: notes || [] },
      {
        headers: {
          // Cache notes for 30 seconds to reduce load
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching user notes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


