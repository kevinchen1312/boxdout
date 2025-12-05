import { NextRequest, NextResponse } from 'next/server';
import { getGamesForDate, loadAllSchedules } from '@/lib/loadSchedules';
import { setCachedGames } from '@/lib/supabase';
import { localYMD } from '@/app/utils/dateKey';
import { enrichWithLiveScores } from '@/lib/loadSchedulesFromScoreboard';

// This endpoint is called by Vercel Cron every minute to refresh today's games
// For self-hosted deployments, set up a cron job to call this endpoint

export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    // Vercel Cron sends Authorization header automatically
    // For self-hosted, check CRON_SECRET environment variable
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    // If CRON_SECRET is set, verify it matches
    if (cronSecret) {
      if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        console.error('[Cron] Unauthorized request - invalid secret');
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    } else if (process.env.VERCEL) {
      // On Vercel, check for Vercel Cron header
      if (!authHeader) {
        console.error('[Cron] Unauthorized request - missing auth header');
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }
    // For local development without CRON_SECRET, allow through

    const todayKey = localYMD(new Date());
    console.log(`[Cron] Starting cache refresh for ${todayKey}`);
    console.time('[Cron] Total refresh time');

    const results: Array<{ source: string; success: boolean; games: number; error?: string; timeMs: number }> = [];

    // Refresh cache for 'espn' source
    try {
      const startTime = performance.now();
      console.time('[Cron] ESPN source - full schedule');
      
      // Load ALL schedules once - this populates in-memory cache and gives us all dates
      const { gamesByDate } = await loadAllSchedules('espn', false, undefined);
      let todayGames = gamesByDate[todayKey] || [];
      
      // Enrich today's games with real-time scores from scoreboard API
      todayGames = await enrichWithLiveScores(todayGames);
      
      console.timeEnd('[Cron] ESPN source - full schedule');
      
      // Cache today's games specifically (for /api/games/today)
      const todayKey_cache = `today_games_espn_${todayKey}`;
      const todaySuccess = await setCachedGames(todayKey_cache, {
        games: { [todayKey]: todayGames },
        source: 'espn',
        date: todayKey,
      });
      
      // Also cache full schedule (for fallback and /api/games/all)
      const allGamesKey = `all_games_espn`;
      const allSuccess = await setCachedGames(allGamesKey, {
        games: gamesByDate,
        source: 'espn',
        date: todayKey,
      });
      
      const timeMs = performance.now() - startTime;
      
      results.push({
        source: 'espn',
        success: todaySuccess && allSuccess,
        games: todayGames.length,
        timeMs,
      });
      
      console.log(`[Cron] ESPN: ${todaySuccess && allSuccess ? 'Success' : 'Failed'} - ${todayGames.length} games today, ${Object.keys(gamesByDate).length} dates total in ${timeMs.toFixed(0)}ms`);
    } catch (error) {
      console.error('[Cron] Error refreshing ESPN cache:', error);
      results.push({
        source: 'espn',
        success: false,
        games: 0,
        error: error instanceof Error ? error.message : String(error),
        timeMs: 0,
      });
    }

    // Note: 'myboard' source requires user context, so we only cache 'espn'
    // Users with custom boards will fall back to live fetch or use client-side cache

    console.timeEnd('[Cron] Total refresh time');

    const allSuccess = results.every(r => r.success);
    const totalGames = results.reduce((sum, r) => sum + r.games, 0);

    return NextResponse.json({
      success: allSuccess,
      timestamp: new Date().toISOString(),
      date: todayKey,
      results,
      totalGames,
    });
  } catch (error) {
    console.error('[Cron] Fatal error in cache refresh:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing
export async function GET(request: NextRequest) {
  return POST(request);
}

