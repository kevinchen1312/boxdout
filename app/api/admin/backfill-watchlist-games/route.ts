import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { backfillWatchlistPlayerGames } from '@/lib/fetchProspectGames';

/**
 * POST /api/admin/backfill-watchlist-games
 * Backfill games for existing watchlist players who don't have games yet
 * Requires authentication
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'You must be signed in to backfill watchlist games' },
        { status: 401 }
      );
    }

    console.log(`[backfill-watchlist-games] Starting backfill for user ${clerkUserId}`);

    const result = await backfillWatchlistPlayerGames(clerkUserId);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Backfill operation encountered errors',
          result,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Backfill completed successfully',
      result: {
        totalProspects: result.totalProspects,
        prospectsProcessed: result.prospectsProcessed,
        prospectsWithGames: result.prospectsWithGames,
        prospectsWithoutGames: result.prospectsWithoutGames,
        totalGamesAdded: result.totalGamesAdded,
        errors: result.errors,
        errorCount: result.errors.length,
      },
    }, { status: 200 });
  } catch (error) {
    console.error('[backfill-watchlist-games] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to backfill watchlist games',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}





