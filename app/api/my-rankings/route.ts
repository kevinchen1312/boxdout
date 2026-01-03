import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { loadProspects, clearProspectCache } from '@/lib/loadProspects';
import { clearScheduleCache } from '@/lib/loadSchedules';
import { clearCachedGames, supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  console.log('[my-rankings] GET request received');
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const source = searchParams.get('source') || 'myboard';
    const excludeWatchlist = searchParams.get('excludeWatchlist') === 'true';
    
    console.log('[my-rankings] Source:', source, 'excludeWatchlist:', excludeWatchlist);
    
    if (source !== 'espn' && source !== 'myboard') {
      return NextResponse.json(
        { error: 'Invalid source. Must be "espn" or "myboard"', prospects: [] },
        { status: 400 }
      );
    }
    
    try {
      const { userId } = await auth();
      const clerkUserId = userId || undefined;
      
      console.log('[my-rankings] Loading prospects for user:', clerkUserId, 'excludeWatchlist:', excludeWatchlist);
      
      // Add timeout to loadProspects to prevent hanging
      const loadProspectsPromise = loadProspects(source as 'espn' | 'myboard', clerkUserId);
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('loadProspects timeout')), 10000); // 10 second timeout
      });
      
      let allProspects;
      try {
        allProspects = await Promise.race([loadProspectsPromise, timeout]);
      } catch (timeoutError) {
        console.error('[my-rankings] loadProspects timed out, returning empty array');
        return NextResponse.json({ 
          prospects: [],
          source,
          error: 'Loading took too long'
        }, { status: 200 }); // Return 200 so page doesn't show error
      }
      
      let prospects = excludeWatchlist 
        ? allProspects.filter((p: any) => !p.isWatchlist)
        : allProspects;
      
      if (excludeWatchlist && clerkUserId) {
        const watchlistNames = new Set(
          allProspects
            .filter((p: any) => p.isWatchlist)
            .map((p: any) => p.name.toLowerCase().trim())
        );
        prospects = prospects.filter((p: any) => {
          const nameLower = p.name.toLowerCase().trim();
          return !watchlistNames.has(nameLower);
        });
      }
      
      console.log('[my-rankings] Loaded', prospects.length, 'prospects (filtered from', allProspects.length, ')');
      
      const headers: HeadersInit = {};
      if (source === 'myboard') {
        // User-specific data - no cache
        headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      } else {
        // ESPN rankings - cache for 5 minutes
        headers['Cache-Control'] = 'public, s-maxage=300, stale-while-revalidate=600';
      }
      
      return NextResponse.json({ 
        prospects: Array.isArray(prospects) ? prospects : [],
        source 
      }, { headers });
    } catch (loadError) {
        console.error(`[my-rankings] Error loading ${source} prospects:`, loadError);
        const errorMessage = loadError instanceof Error ? loadError.message : 'Failed to load prospects';
        // If timeout, return empty array instead of error to prevent page hang
        if (errorMessage.includes('timeout')) {
          console.warn('[my-rankings] Timeout occurred, returning empty prospects to prevent hang');
          return NextResponse.json({ 
            prospects: [],
            source,
            error: 'Loading took too long, please refresh'
          }, { status: 200 }); // Return 200 so page doesn't show error
        }
        return NextResponse.json({ 
          prospects: [],
          source,
          error: errorMessage
        }, { status: 500 });
      }
    } catch (error) {
      console.error('[my-rankings] Error in GET handler:', error);
      return NextResponse.json(
        { error: 'Failed to load rankings', prospects: [] },
        { status: 500 }
      );
    }
}

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'You must be signed in to save rankings' },
        { status: 401 }
      );
    }
    
    const supabaseUserId = await getSupabaseUserId(userId);
    if (!supabaseUserId) {
      return NextResponse.json(
        { error: 'User not found. Please sign out and sign back in.' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { prospects, resetToESPN } = body;
    
    if (resetToESPN === true) {
      console.log('[my-rankings] Resetting to ESPN rankings for user:', supabaseUserId);
      
      // Delete user's custom big board rankings
      const { error: deleteBigBoardError } = await supabaseAdmin
        .from('user_big_board')
        .delete()
        .eq('user_id', supabaseUserId);
      
      if (deleteBigBoardError) {
        // Table might not exist yet - that's OK
        console.warn('[my-rankings] Error clearing big board (may not exist):', deleteBigBoardError);
      } else {
        console.log('[my-rankings] Cleared big board for user');
      }
      
      // Also clear watchlist
      const { error: deleteWatchlistError } = await supabaseAdmin
        .from('user_rankings')
        .delete()
        .eq('user_id', supabaseUserId);
      
      if (deleteWatchlistError) {
        console.error('[my-rankings] Error clearing watchlist:', deleteWatchlistError);
      } else {
        console.log('[my-rankings] Cleared watchlist for user');
      }
      
      clearProspectCache('myboard');
      clearScheduleCache('myboard');
      await clearCachedGames('all_games_myboard');
      
      return NextResponse.json({ 
        success: true,
        message: 'Rankings reset to ESPN rankings. Watchlist cleared.'
      });
    }
    
    if (!Array.isArray(prospects)) {
      return NextResponse.json(
        { error: 'Invalid format: prospects must be an array' },
        { status: 400 }
      );
    }
    
    // Validate prospects
    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      if (!prospect.name || !prospect.position || !prospect.team) {
        return NextResponse.json(
          { error: `Invalid prospect at index ${i}: missing required fields` },
          { status: 400 }
        );
      }
    }
    
    console.log('[my-rankings] Saving', prospects.length, 'prospects to Supabase for user:', supabaseUserId);
    
    // Delete existing big board entries for this user
    const { error: deleteError } = await supabaseAdmin
      .from('user_big_board')
      .delete()
      .eq('user_id', supabaseUserId);
    
    if (deleteError) {
      // Table might not exist yet - log but continue (will fail on insert if really broken)
      console.warn('[my-rankings] Error deleting old big board (may not exist):', deleteError);
    }
    
    // Insert new rankings
    const rankingsToInsert = prospects.map((prospect: any, index: number) => ({
      user_id: supabaseUserId,
      prospect_name: prospect.name,
      prospect_position: prospect.position,
      prospect_team: prospect.team,
      rank: index + 1,
    }));
    
    if (rankingsToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('user_big_board')
        .insert(rankingsToInsert);
      
      if (insertError) {
        console.error('[my-rankings] Error inserting rankings:', insertError);
        return NextResponse.json(
          { error: 'Failed to save rankings to database' },
          { status: 500 }
        );
      }
    }
    
    console.log('[my-rankings] Successfully saved', rankingsToInsert.length, 'prospects');
    
    clearProspectCache('myboard');
    clearScheduleCache('myboard');
    await clearCachedGames('all_games_myboard');
    
    return NextResponse.json({ 
      success: true,
      message: 'Rankings saved successfully'
    });
  } catch (error) {
    console.error('Error saving rankings:', error);
    return NextResponse.json(
      { error: 'Failed to save rankings' },
      { status: 500 }
    );
  }
}

