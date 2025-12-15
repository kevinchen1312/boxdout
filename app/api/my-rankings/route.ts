import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { auth } from '@clerk/nextjs/server';
import { loadProspects, clearProspectCache } from '@/lib/loadProspects';
import { clearScheduleCache } from '@/lib/loadSchedules';
import { clearCachedGames, supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';

const MY_BOARD_PATH = join(process.cwd(), 'my_board_2026.txt');
const ESPN_BOARD_PATH = join(process.cwd(), 'top_100_espn_2026_big_board.txt');

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
    const body = await request.json();
    const { prospects, resetToESPN } = body;
    
    if (resetToESPN === true) {
      const espnContent = readFileSync(ESPN_BOARD_PATH, 'utf-8');
      const tempPath = MY_BOARD_PATH + '.tmp';
      writeFileSync(tempPath, espnContent, 'utf-8');
      renameSync(tempPath, MY_BOARD_PATH);
      
      try {
        const { userId } = await auth();
        if (userId) {
          const supabaseUserId = await getSupabaseUserId(userId);
          if (supabaseUserId) {
            const { error: deleteError } = await supabaseAdmin
              .from('user_rankings')
              .delete()
              .eq('user_id', supabaseUserId);
            
            if (deleteError) {
              console.error('[my-rankings] Error clearing watchlist:', deleteError);
            } else {
              console.log('[my-rankings] Cleared watchlist for user');
            }
          }
        }
      } catch (err) {
        console.error('[my-rankings] Error clearing watchlist:', err);
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
    
    // No limit on number of prospects - users can customize their board as they see fit
    
    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      if (!prospect.name || !prospect.position || !prospect.team) {
        return NextResponse.json(
          { error: `Invalid prospect at index ${i}: missing required fields` },
          { status: 400 }
        );
      }
    }
    
    const lines: string[] = [];
    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      const rank = String(i + 1).padStart(2, '0');
      lines.push(`${rank}. ${prospect.name} - ${prospect.position}, ${prospect.team}`);
    }
    
    const content = lines.join('\n') + '\n';
    
    const tempPath = MY_BOARD_PATH + '.tmp';
    writeFileSync(tempPath, content, 'utf-8');
    renameSync(tempPath, MY_BOARD_PATH);
    
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

