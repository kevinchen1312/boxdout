import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get all rankings
    const { data: rankings } = await supabaseAdmin
      .from('user_rankings')
      .select('rank, prospects(full_name, team_name)')
      .eq('user_id', user.id)
      .order('rank', { ascending: true });

    return NextResponse.json({
      rankings: rankings?.map((r: any) => ({
        rank: r.rank,
        name: r.prospects?.full_name,
        team: r.prospects?.team_name,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





