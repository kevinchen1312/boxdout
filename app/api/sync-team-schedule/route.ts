import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { syncNCAATeamSchedule, syncNBLTeamSchedule } from '@/lib/syncESPNTeamSchedules';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/sync-team-schedule
 * Sync schedule for a specific ESPN team ID (NCAA or NBL)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { espnTeamId, league } = body;

    if (!espnTeamId || !league) {
      return NextResponse.json(
        { error: 'Missing espnTeamId or league (ncaa/nbl)' },
        { status: 400 }
      );
    }

    if (league !== 'ncaa' && league !== 'nbl') {
      return NextResponse.json(
        { error: 'League must be "ncaa" or "nbl"' },
        { status: 400 }
      );
    }

    console.log(`[Sync] Syncing ${league.toUpperCase()} schedule for team ${espnTeamId}...`);

    let result;
    if (league === 'ncaa') {
      result = await syncNCAATeamSchedule(espnTeamId);
    } else {
      result = await syncNBLTeamSchedule(espnTeamId);
    }

    return NextResponse.json({
      success: true,
      synced: result.synced,
      errors: result.errors,
      league,
      espnTeamId,
    });
  } catch (error) {
    console.error('[Sync] Error syncing team schedule:', error);
    return NextResponse.json(
      { error: 'Failed to sync schedule', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}


