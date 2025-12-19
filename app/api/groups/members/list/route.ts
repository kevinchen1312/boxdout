import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get('groupId');

    if (!groupId) {
      return NextResponse.json({ error: 'Missing groupId' }, { status: 400 });
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

    // Get group members
    const { data: members, error: membersError } = await supabaseAdmin
      .from('group_members')
      .select(`
        joined_at,
        user:users!group_members_user_id_fkey(id, username, email)
      `)
      .eq('group_id', groupId);

    if (membersError) {
      console.error('Error fetching group members:', membersError);
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }

    const formattedMembers = members?.map(m => {
      // Handle Supabase's typing (may return as array for joins)
      const mUser = Array.isArray(m.user) ? m.user[0] : m.user;
      return {
        id: mUser?.id,
        username: mUser?.username,
        email: mUser?.email,
        joinedAt: m.joined_at,
      };
    }).filter(m => m.id) || [];

    return NextResponse.json({ members: formattedMembers });
  } catch (error) {
    console.error('Error fetching group members:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

