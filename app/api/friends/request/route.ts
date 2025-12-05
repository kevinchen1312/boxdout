import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { receiverUsername } = await req.json();

    if (!receiverUsername) {
      return NextResponse.json({ error: 'Missing receiverUsername' }, { status: 400 });
    }

    // Get sender's Supabase ID
    const { data: senderData, error: senderError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single();

    if (senderError || !senderData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get receiver's Supabase ID by username
    const { data: receiverData, error: receiverError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', receiverUsername)
      .single();

    if (receiverError || !receiverData) {
      return NextResponse.json({ error: 'Receiver not found' }, { status: 404 });
    }

    // Can't send request to yourself
    if (senderData.id === receiverData.id) {
      return NextResponse.json({ error: 'Cannot send friend request to yourself' }, { status: 400 });
    }

    // Check if already friends
    const { data: existingFriendship } = await supabaseAdmin
      .from('friends')
      .select('id')
      .or(`and(user1_id.eq.${senderData.id},user2_id.eq.${receiverData.id}),and(user1_id.eq.${receiverData.id},user2_id.eq.${senderData.id})`)
      .single();

    if (existingFriendship) {
      return NextResponse.json({ error: 'Already friends' }, { status: 400 });
    }

    // Check if request already exists
    const { data: existingRequest } = await supabaseAdmin
      .from('friend_requests')
      .select('id, status')
      .or(`and(sender_id.eq.${senderData.id},receiver_id.eq.${receiverData.id}),and(sender_id.eq.${receiverData.id},receiver_id.eq.${senderData.id})`)
      .single();

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return NextResponse.json({ error: 'Friend request already pending' }, { status: 400 });
      }
    }

    // Create friend request
    const { data, error } = await supabaseAdmin
      .from('friend_requests')
      .insert({
        sender_id: senderData.id,
        receiver_id: receiverData.id,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating friend request:', error);
      return NextResponse.json({ error: 'Failed to create friend request' }, { status: 500 });
    }

    return NextResponse.json({ request: data });
  } catch (error) {
    console.error('Error creating friend request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


