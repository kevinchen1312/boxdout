import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId, memberUsername } = await req.json();

    if (!groupId || !memberUsername) {
      return NextResponse.json({ error: 'Missing groupId or memberUsername' }, { status: 400 });
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

    // Verify user owns the group
    const { data: group, error: groupError } = await supabaseAdmin
      .from('groups')
      .select('owner_id')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    if (group.owner_id !== userData.id) {
      return NextResponse.json({ error: 'Only group owner can add members' }, { status: 403 });
    }

    // Get member's Supabase ID by username
    const { data: memberData, error: memberError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', memberUsername)
      .single();

    if (memberError || !memberData) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Check if already a member
    const { data: existing } = await supabaseAdmin
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', memberData.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'User is already a member' }, { status: 400 });
    }

    // Add member
    const { error: addError } = await supabaseAdmin
      .from('group_members')
      .insert({
        group_id: groupId,
        user_id: memberData.id,
      });

    if (addError) {
      console.error('Error adding member:', addError);
      return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding group member:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

