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
    
    // Query for count AND latest updated_at (for cache versioning across devices)
    const { data, count, error } = await supabaseAdmin
      .from('user_big_board')
      .select('updated_at', { count: 'exact' })
      .eq('user_id', supabaseUserId)
      .order('updated_at', { ascending: false })
      .limit(1);
    
    if (error) {
      console.warn('[check-custom] Error checking custom rankings:', error);
      return NextResponse.json({ hasCustomRankings: false });
    }
    
    const hasCustomRankings = (count ?? 0) > 0;
    // Get the most recent update timestamp (used to invalidate client game cache)
    const rankingsVersion = data?.[0]?.updated_at || null;
    console.log(`[check-custom] User ${supabaseUserId} has custom rankings: ${hasCustomRankings} (count: ${count}, version: ${rankingsVersion})`);
    
    return NextResponse.json({ 
      hasCustomRankings,
      count: count ?? 0,
      rankingsVersion, // Timestamp of last rankings update - used for cross-device cache invalidation
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


