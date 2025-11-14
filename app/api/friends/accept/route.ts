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

    // Get friend request
    const { data: request, error: requestError } = await supabase
      .from('friend_requests')
      .select('sender_id, receiver_id, status')
      .eq('id', requestId)
      .eq('receiver_id', userData.id)
      .single();

    if (requestError || !request) {
      return NextResponse.json({ error: 'Friend request not found' }, { status: 404 });
    }

    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'Request already processed' }, { status: 400 });
    }

    // Update request status
    const { error: updateError } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to accept request' }, { status: 500 });
    }

    // Create friendship (ensure user1_id < user2_id for uniqueness)
    const user1_id = request.sender_id < request.receiver_id ? request.sender_id : request.receiver_id;
    const user2_id = request.sender_id < request.receiver_id ? request.receiver_id : request.sender_id;

    const { error: friendError } = await supabase
      .from('friends')
      .insert({
        user1_id,
        user2_id,
      });

    if (friendError) {
      console.error('Error creating friendship:', friendError);
      return NextResponse.json({ error: 'Failed to create friendship' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

