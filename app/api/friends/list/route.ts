import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
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

    // Get all friendships
    const { data: friendships, error: friendshipsError } = await supabaseAdmin
      .from('friends')
      .select(`
        id,
        user1_id,
        user2_id,
        created_at,
        user1:users!friends_user1_id_fkey(id, username, email),
        user2:users!friends_user2_id_fkey(id, username, email)
      `)
      .or(`user1_id.eq.${userData.id},user2_id.eq.${userData.id}`);

    if (friendshipsError) {
      console.error('Error fetching friendships:', friendshipsError);
      return NextResponse.json({ error: 'Failed to fetch friends' }, { status: 500 });
    }

    // Map to get friend data (the other user in the friendship)
    const friends = friendships?.map(f => {
      const friendData = f.user1_id === userData.id ? f.user2 : f.user1;
      // Handle Supabase's typing (may return as array for joins)
      const friend = Array.isArray(friendData) ? friendData[0] : friendData;
      return {
        id: friend?.id,
        username: friend?.username,
        email: friend?.email,
        friendshipId: f.id,
        since: f.created_at,
      };
    }).filter(f => f.id) || [];

    // Get pending received requests
    const { data: receivedRequests, error: receivedError } = await supabaseAdmin
      .from('friend_requests')
      .select(`
        id,
        created_at,
        sender:users!friend_requests_sender_id_fkey(id, username, email)
      `)
      .eq('receiver_id', userData.id)
      .eq('status', 'pending');

    if (receivedError) {
      console.error('Error fetching received requests:', receivedError);
    }

    // Get pending sent requests
    const { data: sentRequests, error: sentError } = await supabaseAdmin
      .from('friend_requests')
      .select(`
        id,
        created_at,
        receiver:users!friend_requests_receiver_id_fkey(id, username, email)
      `)
      .eq('sender_id', userData.id)
      .eq('status', 'pending');

    if (sentError) {
      console.error('Error fetching sent requests:', sentError);
    }

    return NextResponse.json({
      friends,
      receivedRequests: receivedRequests || [],
      sentRequests: sentRequests || [],
    });
  } catch (error) {
    console.error('Error fetching friends:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


