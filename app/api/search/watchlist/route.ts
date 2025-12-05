import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';

/**
 * GET /api/search/watchlist?q=...
 * Search watchlist/imported prospects for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Unauthorized', results: [] },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q')?.trim() || '';
    
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    let supabaseUserId: string | null;
    try {
      supabaseUserId = await getSupabaseUserId(clerkUserId);
    } catch (err) {
      console.error('search/watchlist: getSupabaseUserId failed', err);
      return NextResponse.json(
        { error: 'Failed to get user ID', results: [] },
        { status: 500 }
      );
    }

    if (!supabaseUserId) {
      return NextResponse.json({ results: [] });
    }

    // Search watchlist prospects (source: 'external' or 'espn')
    // Note: Can't use .or() with nested fields, so we filter client-side
    const { data, error } = await supabaseAdmin
      .from('user_rankings')
      .select(`
        prospect_id,
        rank,
        prospects (
          id,
          full_name,
          position,
          team_name,
          team_id,
          league,
          source
        )
      `)
      .eq('user_id', supabaseUserId)
      .limit(50); // Fetch more to filter client-side

    if (error) {
      console.error('search/watchlist query error', error);
      return NextResponse.json(
        { error: 'Failed to search watchlist', results: [] },
        { status: 500 }
      );
    }

    // Filter to watchlist prospects (source: 'external' or 'espn') and match search query
    const results = (data || [])
      .filter((r: any) => {
        if (!r.prospects) return false;
        const source = r.prospects.source;
        const isWatchlist = source === 'external' || source === 'espn';
        const matchesQuery = r.prospects.full_name?.toLowerCase().includes(q.toLowerCase());
        return isWatchlist && matchesQuery;
      })
      .slice(0, 10) // Limit to 10 results
      .map((r: any) => ({
        type: 'watchlist_player' as const,
        id: r.prospect_id,
        name: r.prospects.full_name,
        subtitle: [
          r.prospects.position,
          r.prospects.team_name,
          r.prospects.league,
        ]
          .filter(Boolean)
          .join(' · '),
        team: r.prospects.team_name,
        teamId: r.prospects.team_id || undefined,
        league: r.prospects.league,
        rank: r.rank,
      }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error('search/watchlist handler crashed', err);
    return NextResponse.json(
      { error: 'Internal Server Error', results: [] },
      { status: 500 }
    );
  }
}

