import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabaseUserId, supabaseAdmin } from '@/lib/supabase';

/**
 * Quick check to see if user has custom rankings saved in the database.
 * Used for cross-device sync - when a user visits from a new device,
 * we check if they have saved rankings to automatically enable "myboard" mode.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ hasCustomRankings: false });
    }
    
    const supabaseUserId = await getSupabaseUserId(userId);
    if (!supabaseUserId) {
      return NextResponse.json({ hasCustomRankings: false });
    }
    
    // Quick count query - just check if any custom rankings exist
    const { count, error } = await supabaseAdmin
      .from('user_big_board')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', supabaseUserId);
    
    if (error) {
      console.warn('[check-custom] Error checking custom rankings:', error);
      return NextResponse.json({ hasCustomRankings: false });
    }
    
    const hasCustomRankings = (count ?? 0) > 0;
    console.log(`[check-custom] User ${supabaseUserId} has custom rankings: ${hasCustomRankings} (count: ${count})`);
    
    return NextResponse.json({ 
      hasCustomRankings,
      count: count ?? 0,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    });
  } catch (error) {
    console.error('[check-custom] Error:', error);
    return NextResponse.json({ hasCustomRankings: false });
  }
}

