import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';

/**
 * GET /api/draft-prospects/user-rankings
 * Get all user rankings for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    let supabaseUserId: string | null;
    try {
      supabaseUserId = await getSupabaseUserId(userId);
    } catch (err) {
      console.error('user-rankings: getSupabaseUserId failed', err);
      return NextResponse.json(
        { error: 'Failed to get user ID', rankings: [] },
        { status: 500 }
      );
    }

    if (!supabaseUserId) {
      console.warn('user-rankings: User not found in Supabase, returning empty rankings');
      return NextResponse.json({ rankings: [] });
    }

    const { data, error } = await supabaseAdmin
      .from('user_rankings')
      .select('prospect_id, rank, source, prospects(id, full_name, position, team_name, league, source)')
      .eq('user_id', supabaseUserId)
      .order('rank', { ascending: true });

    if (error) {
      console.error('user-rankings query error', error);
      // If table doesn't exist, return empty array instead of error
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('user_rankings table does not exist yet, returning empty array');
        return NextResponse.json({ rankings: [] });
      }
      return NextResponse.json(
        { error: 'Failed to load user rankings', rankings: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({ rankings: data || [] });
  } catch (err) {
    console.error('user-rankings handler crashed', err);
    return NextResponse.json(
      { error: 'Internal Server Error', rankings: [] },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/draft-prospects/user-rankings?prospectId=...
 * Remove a prospect from user's rankings
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const prospectId = searchParams.get('prospectId');
    
    if (!prospectId) {
      return NextResponse.json(
        { error: 'prospectId parameter is required' },
        { status: 400 }
      );
    }

    let supabaseUserId: string | null;
    try {
      supabaseUserId = await getSupabaseUserId(userId);
    } catch (err) {
      console.error('user-rankings DELETE: getSupabaseUserId failed', err);
      return NextResponse.json(
        { error: 'Failed to get user ID' },
        { status: 500 }
      );
    }

    if (!supabaseUserId) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Delete the user ranking
    const { error: deleteError } = await supabaseAdmin
      .from('user_rankings')
      .delete()
      .eq('user_id', supabaseUserId)
      .eq('prospect_id', prospectId);

    if (deleteError) {
      console.error('Error deleting user ranking:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete ranking' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('user-rankings DELETE handler crashed', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/draft-prospects/user-rankings
 * Add or update watchlist prospects
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
    const { watchlist } = body;

    if (!Array.isArray(watchlist)) {
      return NextResponse.json(
        { error: 'watchlist must be an array' },
        { status: 400 }
      );
    }

    let supabaseUserId: string | null;
    try {
      supabaseUserId = await getSupabaseUserId(userId);
    } catch (err) {
      console.error('user-rankings POST: getSupabaseUserId failed', err);
      return NextResponse.json(
        { error: 'Failed to get user ID' },
        { status: 500 }
      );
    }

    if (!supabaseUserId) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // CRITICAL: First, delete ALL existing watchlist entries for this user
    // Then re-insert only the ones that are still in the watchlist
    // This ensures that prospects moved to big board are removed from watchlist
    console.log('[user-rankings POST] Clearing existing watchlist entries before re-inserting');
    const { error: deleteError } = await supabaseAdmin
      .from('user_rankings')
      .delete()
      .eq('user_id', supabaseUserId);
    
    if (deleteError) {
      console.error('[user-rankings POST] Error clearing watchlist:', deleteError);
      // Continue anyway - we'll try to insert the new ones
    } else {
      console.log('[user-rankings POST] Cleared existing watchlist entries');
    }

    // Process each watchlist prospect
    for (const prospect of watchlist) {
      if (!prospect.id || !prospect.name) {
        console.warn('Skipping invalid prospect:', prospect);
        continue;
      }

      // Check if prospect exists in prospects table
      // ESPN prospects are identified by name, not database ID
      let prospectDbId: string | null = null;
      
      // First try to find by name (most reliable for ESPN prospects)
      const { data: existingByName } = await supabaseAdmin
        .from('prospects')
        .select('id')
        .eq('full_name', prospect.name)
        .maybeSingle();

      if (existingByName) {
        prospectDbId = existingByName.id;
      } else {
        // Try to find by id (if it's a UUID from database)
        const { data: existingById } = await supabaseAdmin
          .from('prospects')
          .select('id')
          .eq('id', prospect.id)
          .maybeSingle();

        if (existingById) {
          prospectDbId = existingById.id;
        } else {
          // Create prospect if it doesn't exist (for ESPN prospects moved to watchlist)
          // Use name-based espn_id since ESPN prospects don't have numeric IDs
          const espnId = `espn-${prospect.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          
          console.log(`[user-rankings POST] Creating new prospect: ${prospect.name} with espn_id: ${espnId}`);
          
          const { data: newProspect, error: createError } = await supabaseAdmin
            .from('prospects')
            .insert({
              espn_id: espnId,
              full_name: prospect.name,
              position: prospect.position || null,
              team_name: prospect.team || null,
              league: 'NCAA',
              source: 'espn',
            })
            .select('id')
            .single();

          if (createError) {
            console.error('Error creating prospect:', createError, 'prospect:', prospect);
            // If it's a duplicate key error (espn_id or full_name), try to find it again
            if (createError.code === '23505') {
              console.log('[user-rankings POST] Duplicate key error, trying to find existing prospect');
              const { data: duplicate } = await supabaseAdmin
                .from('prospects')
                .select('id')
                .or(`full_name.eq.${prospect.name},espn_id.eq.${espnId}`)
                .maybeSingle();
              if (duplicate) {
                console.log('[user-rankings POST] Found existing prospect:', duplicate.id);
                prospectDbId = duplicate.id;
              } else {
                console.warn('[user-rankings POST] Could not find duplicate prospect, skipping');
                continue;
              }
            } else {
              continue;
            }
          } else {
            console.log(`[user-rankings POST] Created new prospect: ${newProspect.id}`);
            prospectDbId = newProspect.id;
          }
        }
      }

      if (!prospectDbId) {
        console.warn('Could not find or create prospect:', prospect.name);
        continue;
      }

      // Insert into user_rankings (we've already cleared all entries above)
      const { error: insertError } = await supabaseAdmin
        .from('user_rankings')
        .insert({
          user_id: supabaseUserId,
          prospect_id: prospectDbId,
          rank: prospect.watchlistRank || 1,
          source: 'my_board',
        });

      if (insertError) {
        console.error('Error inserting user ranking:', insertError, 'prospect:', prospect.name);
      } else {
        console.log('[user-rankings POST] Inserted watchlist entry for:', prospect.name, 'rank:', prospect.watchlistRank || 1);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('user-rankings POST handler crashed', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

