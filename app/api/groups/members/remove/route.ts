import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get('groupId');
    const memberId = searchParams.get('memberId');

    if (!groupId || !memberId) {
      return NextResponse.json({ error: 'Missing groupId or memberId' }, { status: 400 });
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

    // Verify user owns the group or is removing themselves
    const { data: group, error: groupError } = await supabaseAdmin
      .from('groups')
      .select('owner_id')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const isOwner = group.owner_id === userData.id;
    const isRemovingSelf = memberId === userData.id;

    if (!isOwner && !isRemovingSelf) {
      return NextResponse.json({ error: 'Only group owner can remove members' }, { status: 403 });
    }

    // Remove member (RLS policy handles authorization)
    const { error } = await supabaseAdmin
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', memberId);

    if (error) {
      console.error('Error removing member:', error);
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing group member:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

