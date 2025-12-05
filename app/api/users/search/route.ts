import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Get current user's Supabase ID
    const { data: currentUser, error: currentUserError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single();

    if (currentUserError || !currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Search for users by username (case-insensitive)
    const { data: users, error: searchError } = await supabaseAdmin
      .from('users')
      .select('id, username, email')
      .ilike('username', `%${query}%`)
      .neq('id', currentUser.id)
      .limit(20);

    if (searchError) {
      console.error('Error searching users:', searchError);
      return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
    }

    // For each user, check friendship status
    const usersWithStatus = await Promise.all(
      (users || []).map(async (user) => {
        // Check if already friends
        const { data: friendship } = await supabaseAdmin
          .from('friends')
          .select('id')
          .or(`and(user1_id.eq.${currentUser.id},user2_id.eq.${user.id}),and(user1_id.eq.${user.id},user2_id.eq.${currentUser.id})`)
          .single();

        if (friendship) {
          return { ...user, status: 'friends' };
        }

        // Check for pending friend request
        const { data: pendingRequest } = await supabaseAdmin
          .from('friend_requests')
          .select('id, sender_id, receiver_id, status')
          .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${currentUser.id})`)
          .eq('status', 'pending')
          .single();

        if (pendingRequest) {
          // Check who sent the request
          if (pendingRequest.sender_id === currentUser.id) {
            return { ...user, status: 'request_sent' };
          } else {
            return { ...user, status: 'request_received' };
          }
        }

        return { ...user, status: 'none' };
      })
    );

    return NextResponse.json({ users: usersWithStatus });
  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}






