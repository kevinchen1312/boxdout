import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/custom-players - Get all custom players for current user
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized', players: [] }, { status: 401 });
    }

    let supabaseUserId: string | null;
    try {
      supabaseUserId = await getSupabaseUserId(userId);
    } catch (err) {
      console.error('custom-players: getSupabaseUserId failed', err);
      // Return empty array instead of error - user might not be in Supabase yet
      return NextResponse.json({ players: [] });
    }

    if (!supabaseUserId) {
      console.warn('custom-players: User not found in Supabase, returning empty players');
      return NextResponse.json({ players: [] });
    }

    const { data, error } = await supabaseAdmin
      .from('custom_players')
      .select('*')
      .eq('user_id', supabaseUserId)
      .order('rank', { ascending: true });

    if (error) {
      console.error('custom-players query error', error);
      // If table doesn't exist, return empty array instead of error
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('custom_players table does not exist yet, returning empty array');
        return NextResponse.json({ players: [] });
      }
      return NextResponse.json(
        { error: 'Failed to fetch custom players', players: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({ players: data || [] });
  } catch (err) {
    console.error('custom-players handler crashed', err);
    return NextResponse.json(
      { error: 'Internal Server Error', players: [] },
      { status: 500 }
    );
  }
}

// POST /api/custom-players - Create a new custom player
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUserId = await getSupabaseUserId(userId);
    if (!supabaseUserId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, position, team, rank, height, class: playerClass, jersey, team_id } = body;

    // Validate required fields
    if (!name || !position || !team) {
      return NextResponse.json(
        { error: 'Missing required fields: name, position, and team are required' },
        { status: 400 }
      );
    }

    // If rank not provided, get the next available rank
    let finalRank = rank;
    if (!finalRank) {
      const { data: existingPlayers } = await supabaseAdmin
        .from('custom_players')
        .select('rank')
        .eq('user_id', supabaseUserId)
        .order('rank', { ascending: false })
        .limit(1);
      
      finalRank = existingPlayers && existingPlayers.length > 0 
        ? existingPlayers[0].rank + 1 
        : 1;
    }

    const { data, error } = await supabaseAdmin
      .from('custom_players')
      .insert({
        user_id: supabaseUserId,
        name,
        position,
        team,
        rank: finalRank,
        height: height || null,
        class: playerClass || null,
        jersey: jersey || null,
        team_id: team_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating custom player:', error);
      return NextResponse.json({ error: 'Failed to create custom player' }, { status: 500 });
    }

    return NextResponse.json({ player: data }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/custom-players:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

