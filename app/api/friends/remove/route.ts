import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const friendId = searchParams.get('friendId');

    if (!friendId) {
      return NextResponse.json({ error: 'Missing friendId' }, { status: 400 });
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

    // Delete friendship (RLS policy ensures user can only delete their own friendships)
    const { error } = await supabase
      .from('friends')
      .delete()
      .or(`and(user1_id.eq.${userData.id},user2_id.eq.${friendId}),and(user1_id.eq.${friendId},user2_id.eq.${userData.id})`);

    if (error) {
      console.error('Error removing friend:', error);
      return NextResponse.json({ error: 'Failed to remove friend' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing friend:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

