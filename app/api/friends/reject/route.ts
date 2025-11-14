import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { requestId } = await req.json();

    if (!requestId) {
      return NextResponse.json({ error: 'Missing requestId' }, { status: 400 });
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

    // Update request status
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId)
      .eq('receiver_id', userData.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to reject request' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error rejecting friend request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

