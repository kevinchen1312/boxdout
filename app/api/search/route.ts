import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';
import { resolveTeams } from '@/lib/search/resolve';
import { resolveProspects } from '@/lib/search/resolveProspects';
import { tokenize, plain } from '@/lib/search/tokens';
import type { TeamItem } from '@/lib/search/tokens';
import type { ProspectItem } from '@/lib/search/prospectCatalog';
import type { GameWithProspects } from '@/app/utils/gameMatching';

/**
 * GET /api/search?q=...
 * Unified search for teams, myBoard prospects, and watchlist players
 */
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q')?.trim() || '';
    const sourceParam = searchParams.get('source') || 'myboard';
    
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    // Build team catalog from games (we'll need to pass games or load them)
    // For now, we'll focus on prospects and watchlist
    const teamResults: Array<{ type: 'team'; item: TeamItem }> = [];
    
    // Load myBoard prospects if source is 'myboard' and user is signed in
    let myBoardPlayerResults: Array<{ type: 'prospect'; item: ProspectItem }> = [];
    let watchlistResults: Array<{
      type: 'watchlist_player';
      id: string;
      name: string;
      teamId?: string;
      teamName?: string;
      league?: string;
      subtitle: string;
    }> = [];

    if (clerkUserId && sourceParam === 'myboard') {
      let supabaseUserId: string | null;
      try {
        supabaseUserId = await getSupabaseUserId(clerkUserId);
      } catch (err) {
        console.error('search: getSupabaseUserId failed', err);
        return NextResponse.json(
          { error: 'Failed to get user ID', results: [] },
          { status: 500 }
        );
      }

      if (supabaseUserId) {
        // Query myBoard players (prospects.source is NOT 'external' or 'espn')
        // We need to exclude watchlist players, so we filter out external/espn sources
        const { data: boardData, error: boardError } = await supabaseAdmin
          .from('user_rankings')
          .select(`
            prospect_id,
            rank,
            prospects (
              id,
              full_name,
              position,
              team_name,
              league,
              source
            )
          `)
          .eq('user_id', supabaseUserId)
          .ilike('prospects.full_name', `%${q}%`)
          .limit(20);

        // Filter out watchlist players client-side (Supabase doesn't support .not() with .or() easily)
        const filteredBoardData = boardData?.filter((r: any) => 
          r.prospects && 
          r.prospects.source && 
          r.prospects.source !== 'external' && 
          r.prospects.source !== 'espn'
        ) || [];

        if (!boardError && filteredBoardData) {
          myBoardPlayerResults = filteredBoardData
            .filter((r: any) => r.prospects && r.prospects.full_name)
            .slice(0, 10)
            .map((r: any) => ({
              type: 'prospect' as const,
              item: {
                canon: plain(r.prospects.full_name),
                label: r.prospects.full_name,
                tokens: tokenize(r.prospects.full_name),
                rank: r.rank,
              },
            }));
        }

        // Query watchlist players (source: 'external' or 'espn')
        const { data: watchlistData, error: watchlistError } = await supabaseAdmin
          .from('user_rankings')
          .select(`
            prospect_id,
            rank,
            prospects (
              id,
              full_name,
              position,
              team_name,
              league,
              source,
              team_id
            )
          `)
          .eq('user_id', supabaseUserId)
          .or(`prospects.source.eq.external,prospects.source.eq.espn`)
          .ilike('prospects.full_name', `%${q}%`)
          .limit(10);

        if (!watchlistError && watchlistData) {
          watchlistResults = watchlistData
            .filter((r: any) => r.prospects && r.prospects.full_name)
            .map((r: any) => ({
              type: 'watchlist_player' as const,
              id: r.prospect_id,
              name: r.prospects.full_name,
              teamId: r.prospects.team_id || undefined,
              teamName: r.prospects.team_name || undefined,
              league: r.prospects.league || undefined,
              subtitle: [
                r.prospects.position,
                r.prospects.team_name,
                r.prospects.league,
              ]
                .filter(Boolean)
                .join(' · '),
            }));
        }
      }
    }

    return NextResponse.json({
      results: [
        ...teamResults,
        ...myBoardPlayerResults,
        ...watchlistResults,
      ],
    });
  } catch (err) {
    console.error('search handler crashed', err);
    return NextResponse.json(
      { error: 'Internal Server Error', results: [] },
      { status: 500 }
    );
  }
}

