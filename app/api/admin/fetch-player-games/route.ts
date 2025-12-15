import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';
import { fetchAndStoreProspectGames, resolveTeamIdFromName } from '@/lib/fetchProspectGames';
import { fetchAndStoreInternationalProspectGames } from '@/lib/fetchInternationalProspectGames';

/**
 * POST /api/admin/fetch-player-games
 * Manually trigger game fetching for a specific player
 * Query params: prospectId (UUID) or prospectName (string)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Unauthorized. You must be signed in to access this endpoint.' },
        { status: 401 }
      );
    }

    const supabaseUserId = await getSupabaseUserId(clerkUserId);
    if (!supabaseUserId) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const prospectId = searchParams.get('prospectId');
    const prospectName = searchParams.get('prospectName');

    if (!prospectId && !prospectName) {
      return NextResponse.json(
        { error: 'Missing required parameter: prospectId or prospectName' },
        { status: 400 }
      );
    }

    // Find the prospect
    let prospect: { id: string; full_name: string; team_name: string | null; team_id: string | null; league: string | null; source: string } | null = null;

    if (prospectId) {
      const { data, error } = await supabaseAdmin
        .from('prospects')
        .select('id, full_name, team_name, team_id, league, source')
        .eq('id', prospectId)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { error: `Error finding prospect: ${error.message}` },
          { status: 500 }
        );
      }

      prospect = data;
    } else if (prospectName) {
      const { data, error } = await supabaseAdmin
        .from('prospects')
        .select('id, full_name, team_name, team_id, league, source')
        .ilike('full_name', `%${prospectName}%`)
        .limit(1)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { error: `Error finding prospect: ${error.message}` },
          { status: 500 }
        );
      }

      prospect = data;
    }

    if (!prospect) {
      return NextResponse.json(
        { error: 'Prospect not found' },
        { status: 404 }
      );
    }

    if (!prospect.team_name) {
      return NextResponse.json(
        { error: `Prospect "${prospect.full_name}" has no team name. Cannot fetch games.` },
        { status: 400 }
      );
    }

    // Determine if this is an international player
    const isInternational = prospect.source === 'external' || 
                           prospect.league?.toLowerCase() !== 'ncaa' ||
                           !prospect.team_name.match(/\b(college|university|state|tech|univ)\b/i);

    let result: { success: boolean; gamesCount: number; error?: string };

    if (isInternational) {
      // Use API-Basketball
      console.log(`[AdminFetchPlayerGames] Fetching international games for ${prospect.full_name} (team: ${prospect.team_name})`);
      result = await fetchAndStoreInternationalProspectGames(prospect.id, prospect.team_name);
    } else {
      // Use ESPN
      if (!prospect.team_id) {
        // Try to resolve team ID
        console.log(`[AdminFetchPlayerGames] Resolving team ID for ${prospect.team_name}...`);
        const teamId = await resolveTeamIdFromName(prospect.team_name);
        if (!teamId) {
          return NextResponse.json(
            { error: `Could not resolve team ID for "${prospect.team_name}". Cannot fetch games.` },
            { status: 400 }
          );
        }
        // Update prospect with team_id
        await supabaseAdmin
          .from('prospects')
          .update({ team_id: teamId })
          .eq('id', prospect.id);
        prospect.team_id = teamId;
      }

      console.log(`[AdminFetchPlayerGames] Fetching ESPN games for ${prospect.full_name} (team_id: ${prospect.team_id})`);
      result = await fetchAndStoreProspectGames(prospect.id, prospect.team_id);
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        prospect: {
          id: prospect.id,
          name: prospect.full_name,
          team: prospect.team_name,
        },
        gamesCount: result.gamesCount,
        source: isInternational ? 'api-basketball' : 'espn',
      }, { status: 200 });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to fetch games',
        prospect: {
          id: prospect.id,
          name: prospect.full_name,
          team: prospect.team_name,
        },
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[AdminFetchPlayerGames] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}





