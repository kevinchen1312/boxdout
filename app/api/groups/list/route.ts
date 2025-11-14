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
      console.error('User not found:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get groups where user is owner
    const { data: ownedGroups, error: ownedError } = await supabaseAdmin
      .from('groups')
      .select(`
        id,
        name,
        owner_id,
        created_at,
        owner:users!groups_owner_id_fkey(username, email)
      `)
      .eq('owner_id', userData.id);

    if (ownedError) {
      console.error('Error fetching owned groups:', ownedError);
      return NextResponse.json({ error: 'Failed to fetch groups', details: ownedError.message }, { status: 500 });
    }

    // Get groups where user is a member
    const { data: memberships, error: memberError } = await supabaseAdmin
      .from('group_members')
      .select('group_id')
      .eq('user_id', userData.id);

    if (memberError) {
      console.error('Error fetching group memberships:', memberError);
      return NextResponse.json({ error: 'Failed to fetch group memberships', details: memberError.message }, { status: 500 });
    }

    // Get the group details for groups where user is a member
    let memberGroups = [];
    if (memberships && memberships.length > 0) {
      const memberGroupIds = memberships.map(m => m.group_id);
      const { data: memberGroupData, error: memberGroupError } = await supabaseAdmin
        .from('groups')
        .select(`
          id,
          name,
          owner_id,
          created_at,
          owner:users!groups_owner_id_fkey(username, email)
        `)
        .in('id', memberGroupIds);

      if (memberGroupError) {
        console.error('Error fetching member groups:', memberGroupError);
      } else {
        memberGroups = memberGroupData || [];
      }
    }

    // Combine owned and member groups, removing duplicates
    const allGroupsMap = new Map();
    (ownedGroups || []).forEach(g => allGroupsMap.set(g.id, g));
    memberGroups.forEach(g => allGroupsMap.set(g.id, g));
    const groups = Array.from(allGroupsMap.values());

    // Get member counts for each group
    const groupsWithCounts = await Promise.all(
      (groups || []).map(async (group) => {
        const { count } = await supabaseAdmin
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', group.id);

        return {
          ...group,
          memberCount: count || 0,
          isOwner: group.owner_id === userData.id,
        };
      })
    );

    return NextResponse.json({ groups: groupsWithCounts });
  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

