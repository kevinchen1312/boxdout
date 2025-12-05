import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { auth } from '@clerk/nextjs/server';
import { loadProspects, clearProspectCache } from '@/lib/loadProspects';
import { clearScheduleCache } from '@/lib/loadSchedules';
import { clearCachedGames, supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';

const MY_BOARD_PATH = join(process.cwd(), 'my_board_2026.txt');
const ESPN_BOARD_PATH = join(process.cwd(), 'top_100_espn_2026_big_board.txt');

// GET /api/rankings - Retrieve current myBoard rankings
export async function GET(request: NextRequest) {
  console.log('[rankings] GET request received');
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const source = searchParams.get('source') || 'myboard';
    const excludeWatchlist = searchParams.get('excludeWatchlist') === 'true';
    
    console.log('[rankings] Source:', source, 'excludeWatchlist:', excludeWatchlist);
    
    if (source !== 'espn' && source !== 'myboard') {
      return NextResponse.json(
        { error: 'Invalid source. Must be "espn" or "myboard"', prospects: [] },
        { status: 400 }
      );
    }
    
    try {
      // Get userId if available (needed for custom players and watchlist)
      const { userId } = await auth();
      const clerkUserId = userId || undefined;
      
      console.log('[rankings] Loading prospects for user:', clerkUserId, 'excludeWatchlist:', excludeWatchlist);
      
      // Always load with userId to get watchlist players (needed for filtering)
      const allProspects = await loadProspects(source as 'espn' | 'myboard', clerkUserId);
      
      // If excludeWatchlist is true, filter out watchlist players
      // Watchlist players have isWatchlist: true property
      let prospects = excludeWatchlist 
        ? allProspects.filter((p: any) => !p.isWatchlist)
        : allProspects;
      
      // When excluding watchlist, also remove any players whose names match watchlist players
      // This prevents players from appearing in both big board and watchlist
      // (e.g., if Cameron Boozer is in ESPN top 100 AND in watchlist, exclude from big board)
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
      
      console.log('[rankings] Loaded', prospects.length, 'prospects (filtered from', allProspects.length, ')');
      
      // For myboard source, always return fresh data (no caching)
      // This ensures custom rankings are immediately visible after save
      const headers: HeadersInit = {};
      if (source === 'myboard') {
        headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }
      
      return NextResponse.json({ 
        prospects: Array.isArray(prospects) ? prospects : [],
        source 
      }, { headers });
    } catch (loadError) {
      console.error(`[rankings] Error loading ${source} prospects:`, loadError);
      // Return error status code so client can handle it properly
      const errorMessage = loadError instanceof Error ? loadError.message : 'Failed to load prospects';
      return NextResponse.json({ 
        prospects: [],
        source,
        error: errorMessage
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[rankings] Error in GET handler:', error);
    return NextResponse.json(
      { error: 'Failed to load rankings', prospects: [] },
      { status: 500 }
    );
  }
}

// POST /api/rankings - Save updated myBoard rankings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prospects, resetToESPN } = body;
    
    // If resetToESPN is true, copy ESPN rankings to myBoard and clear watchlist
    if (resetToESPN === true) {
      const espnContent = readFileSync(ESPN_BOARD_PATH, 'utf-8');
      const tempPath = MY_BOARD_PATH + '.tmp';
      writeFileSync(tempPath, espnContent, 'utf-8');
      renameSync(tempPath, MY_BOARD_PATH);
      
      // Clear watchlist for the user (delete all user_rankings entries)
      try {
        const { userId } = await auth();
        if (userId) {
          const supabaseUserId = await getSupabaseUserId(userId);
          if (supabaseUserId) {
            // Delete all user_rankings entries for this user (this clears the watchlist)
            const { error: deleteError } = await supabaseAdmin
              .from('user_rankings')
              .delete()
              .eq('user_id', supabaseUserId);
            
            if (deleteError) {
              console.error('[rankings] Error clearing watchlist:', deleteError);
              // Don't fail the request if watchlist clearing fails
            } else {
              console.log('[rankings] Cleared watchlist for user');
            }
          }
        }
      } catch (err) {
        console.error('[rankings] Error clearing watchlist:', err);
        // Don't fail the request if watchlist clearing fails
      }
      
      // Clear caches
      clearProspectCache('myboard');
      clearScheduleCache('myboard');
      // Clear Supabase cache for myboard games to ensure fresh rankings
      await clearCachedGames('all_games_myboard');
      
      return NextResponse.json({ 
        success: true,
        message: 'Rankings reset to ESPN rankings. Watchlist cleared.'
      });
    }
    
    // Validate prospects array
    if (!Array.isArray(prospects)) {
      return NextResponse.json(
        { error: 'Invalid format: prospects must be an array' },
        { status: 400 }
      );
    }
    
    // Optional constraints: at least 0, at most 100
    if (prospects.length > 100) {
      return NextResponse.json(
        { error: `Invalid format: Maximum 100 prospects allowed, got ${prospects.length}` },
        { status: 400 }
      );
    }
    
    // Validate each prospect has required fields
    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      if (!prospect.name || !prospect.position || !prospect.team) {
        return NextResponse.json(
          { error: `Invalid prospect at index ${i}: missing required fields` },
          { status: 400 }
        );
      }
    }
    
    // Generate file content
    const lines: string[] = [];
    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      const rank = String(i + 1).padStart(2, '0');
      lines.push(`${rank}. ${prospect.name} - ${prospect.position}, ${prospect.team}`);
    }
    
    const content = lines.join('\n') + '\n';
    
    // Write atomically (temp file -> rename)
    const tempPath = MY_BOARD_PATH + '.tmp';
    writeFileSync(tempPath, content, 'utf-8');
    renameSync(tempPath, MY_BOARD_PATH);
    
    // Clear caches to force reload with new rankings
    clearProspectCache('myboard');
    clearScheduleCache('myboard');
    // Clear Supabase cache for myboard games to ensure fresh rankings
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
