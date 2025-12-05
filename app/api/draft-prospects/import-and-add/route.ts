import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';
import { fetchAndStoreProspectGames, resolveTeamIdFromName } from '@/lib/fetchProspectGames';
import { fetchAndStoreInternationalProspectGames } from '@/lib/fetchInternationalProspectGames';
import { fetchLogoFromApiBasketball, cacheTeamLogo } from '@/lib/teamLogoService';

export interface ImportAndAddRequest {
  externalId: string;
  fullName: string;
  position?: string;
  team?: string;
  league?: string;
  provider?: string;
  teamId?: number; // API Basketball team ID for international players
  jerseyNumber?: string; // For international players
  country?: string; // For international players
  age?: number; // For international players
  // userId is NOT accepted - server derives it from Clerk auth
}

export interface ImportAndAddResponse {
  prospect: {
    id: string;
    full_name: string;
    position: string | null;
    team_name: string | null;
  };
  rank: number;
}

/**
 * POST /api/draft-prospects/import-and-add
 * Import a prospect from external source and add to user's board
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    console.log('Import-and-add userId:', clerkUserId);
    
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'You must be signed in to import players' },
        { status: 401 }
      );
    }

    let supabaseUserId: string | null;
    try {
      supabaseUserId = await getSupabaseUserId(clerkUserId);
    } catch (err) {
      console.error('import-and-add: getSupabaseUserId failed', err);
      return NextResponse.json(
        { error: 'Failed to get user ID' },
        { status: 500 }
      );
    }

    if (!supabaseUserId) {
      console.error('import-and-add: User not found in Supabase for Clerk userId:', clerkUserId);
      return NextResponse.json(
        { error: 'User not found. Please ensure your account is properly set up.' },
        { status: 404 }
      );
    }

    const body: ImportAndAddRequest = await request.json();
    const { externalId, fullName, position, team, league, provider = 'espn', teamId: apiBasketballTeamId, jerseyNumber, country, age } = body;

    console.log('[import-and-add] Request body:', { externalId, fullName, position, team, league, provider });

    if (!externalId || !fullName) {
      return NextResponse.json(
        { error: 'Missing required fields: externalId and fullName' },
        { status: 400 }
      );
    }

    // 1. Find or create prospect
    // Check if this is an international roster player (new system)
    const isInternationalRoster = externalId.startsWith('intl-roster-');
    let internationalTeamDbId: string | null = null;
    let internationalTeamApiId: number | null = null;
    
    if (isInternationalRoster) {
      // Extract roster ID and look up team info
      const rosterIdMatch = externalId.match(/^intl-roster-(.+)$/);
      if (rosterIdMatch) {
        const rosterId = rosterIdMatch[1];
        const { data: rosterEntry, error: rosterError } = await supabaseAdmin
          .from('international_rosters')
          .select(`
            team_id,
            international_teams (
              id,
              api_team_id
            )
          `)
          .eq('id', rosterId)
          .single();
        
        if (!rosterError && rosterEntry) {
          internationalTeamDbId = (rosterEntry as any).international_teams?.id || null;
          internationalTeamApiId = (rosterEntry as any).international_teams?.api_team_id || null;
          console.log('[import-and-add] Found international roster team:', { internationalTeamDbId, internationalTeamApiId });
        } else {
          console.error('[import-and-add] Failed to look up international roster:', rosterError);
        }
      }
    }
    
    // Determine if this is an international player (old API-Basketball system) or college player (ESPN)
    // Check multiple indicators: provider, externalId format, league, and team name
    const isInternational = !isInternationalRoster && (provider === 'api-basketball' || 
                           externalId.startsWith('api-basketball-') ||
                           externalId.startsWith('intl-') ||
                           (league && league.toLowerCase() !== 'ncaa' && !team?.match(/\b(college|university|state|tech|univ)\b/i)));
    
    console.log('[import-and-add] Player type:', { isInternationalRoster, isInternational, provider, externalId, league, team });
    
    // Check for existing prospect
    // For ESPN players, check by espn_id; for API-Basketball, check by espn_id (we store API-Basketball IDs there too)
    const { data: existingProspect, error: existingError } = await supabaseAdmin
      .from('prospects')
      .select('id, espn_id, full_name, position, team_name, source')
      .eq('espn_id', externalId)
      .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine, but log other errors
      console.error('Error checking existing prospect:', existingError);
    }

    let prospect = existingProspect;
    
    if (!prospect) {
      // Insert new prospect
      // Store externalId in espn_id (works for both ESPN IDs and API-Basketball IDs)
      const insertData: any = {
        espn_id: externalId,
        full_name: fullName,
        position: position || null,
        team_name: team || null,
        league: league || (isInternational || isInternationalRoster ? 'International' : 'NCAA'),
        source: isInternationalRoster ? 'international-roster' : 'external', // New source type for roster-based players
      };
      
      // For international roster players, store the team foreign key
      if (isInternationalRoster && internationalTeamDbId) {
        insertData.international_team_id = internationalTeamDbId;
      }

      console.log('Attempting to insert prospect:', insertData);

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('prospects')
        .insert(insertData)
        .select('*')
        .single();

      if (insertError || !inserted) {
        console.error('Error inserting prospect', {
          message: insertError?.message,
          code: insertError?.code,
          details: insertError?.details,
          hint: insertError?.hint,
          insertData: insertData,
        });
        return NextResponse.json(
          { error: 'Failed to create prospect' },
          { status: 500 }
        );
      }

      console.log('Successfully inserted prospect:', inserted.id);
      prospect = inserted;
    }

    // 2. Check if prospect is already in user's rankings
    const { data: existingRanking, error: rankingCheckError } = await supabaseAdmin
      .from('user_rankings')
      .select('id, rank')
      .eq('user_id', supabaseUserId)
      .eq('prospect_id', prospect.id) // Use prospect.id (UUID), not externalId
      .maybeSingle();

    if (rankingCheckError && rankingCheckError.code !== 'PGRST116') {
      console.error('Error checking existing ranking:', rankingCheckError);
    }

    let newRank = existingRanking?.rank;

    if (!existingRanking) {
      // Get max rank for this user
      const { data: maxRow, error: maxRankError } = await supabaseAdmin
        .from('user_rankings')
        .select('rank')
        .eq('user_id', supabaseUserId)
        .order('rank', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (maxRankError && maxRankError.code !== 'PGRST116') {
        console.error('Error getting max rank:', maxRankError);
      }

      newRank = (maxRow?.rank ?? 0) + 1;

      console.log('Inserting user ranking:', {
        user_id: supabaseUserId,
        prospect_id: prospect.id,
        rank: newRank,
      });

      // Insert user ranking using prospect.id (UUID)
      const { data: insertedRanking, error: rankingError } = await supabaseAdmin
        .from('user_rankings')
        .insert({
          user_id: supabaseUserId,
          prospect_id: prospect.id, // Use prospect.id (UUID), not externalId
          rank: newRank,
          source: 'my_board',
        })
        .select('*')
        .single();

      if (rankingError) {
        console.error('Error inserting user ranking', {
          message: rankingError.message,
          details: rankingError.details,
          hint: rankingError.hint,
          code: rankingError.code,
          fullError: rankingError,
        });
        return NextResponse.json(
          { error: 'Failed to add player to board' },
          { status: 500 }
        );
      }

      console.log('Successfully inserted user ranking:', insertedRanking?.id);
    } else {
      console.log('Prospect already in rankings at rank:', existingRanking.rank);
    }

    // 3. Resolve team_id from team name and update prospect (for college players only)
    // Note: isInternational was already determined above
    let teamId: string | null = null;
    if (team && !isInternational) {
      const maxRetries = 2;
      let retryCount = 0;
      
      while (!teamId && retryCount <= maxRetries) {
        try {
          if (retryCount > 0) {
            console.log(`[import-and-add] Retry ${retryCount} of ${maxRetries} for team ID resolution: "${team}"`);
            // Wait a bit before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
          
          teamId = await resolveTeamIdFromName(team);
          
          if (teamId) {
            // Update prospect with team_id
            const { error: updateError } = await supabaseAdmin
              .from('prospects')
              .update({ team_id: teamId })
              .eq('id', prospect.id);
            
            if (updateError) {
              console.warn(`[import-and-add] Error updating prospect ${prospect.id} with team_id:`, updateError);
            } else {
              console.log(`[import-and-add] Updated prospect ${prospect.id} with team_id: ${teamId}`);
            }
            break; // Success, exit retry loop
          } else {
            console.warn(`[import-and-add] Could not resolve team_id for team: "${team}" (attempt ${retryCount + 1})`);
          }
        } catch (err) {
          console.error(`[import-and-add] Error resolving team_id (attempt ${retryCount + 1}):`, err);
        }
        
        retryCount++;
      }
      
      if (!teamId) {
        console.error(`[import-and-add] ❌ CRITICAL: Failed to resolve team_id for "${team}" after ${maxRetries + 1} attempts`);
        console.error(`[import-and-add] ❌ Player will be added to board but NO GAMES will be fetched`);
        console.error(`[import-and-add] ❌ This is why the player appears but has no games`);
      } else {
        console.log(`[import-and-add] ✅ Successfully resolved team_id: ${teamId} for team: "${team}"`);
      }
    }

    // 5. Fetch and store team schedule synchronously (with retry logic)
    let scheduleFetchResult: { success: boolean; gamesCount: number; error?: string } | null = null;
    
    if (isInternationalRoster) {
      // International roster players don't need game fetching - games are already in international_team_schedules
      console.log(`[import-and-add] ✅ International roster player - games already in database, skipping fetch`);
      scheduleFetchResult = {
        success: true,
        gamesCount: 0, // We don't count them here, they're loaded dynamically from international_team_schedules
      };
    } else if (isInternational && team) {
      // International player - use API-Basketball
      console.log(`[import-and-add] Fetching international schedule for prospect ${prospect.id} (team: ${team}, teamId: ${apiBasketballTeamId})...`);
      const maxScheduleRetries = 2;
      let scheduleRetryCount = 0;
      
      while (!scheduleFetchResult?.success && scheduleRetryCount <= maxScheduleRetries) {
        try {
          if (scheduleRetryCount > 0) {
            console.log(`[import-and-add] Retry ${scheduleRetryCount} of ${maxScheduleRetries} for international schedule fetch: prospect ${prospect.id} (team: ${team})`);
            // Wait a bit before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * scheduleRetryCount));
          }
          
          // Pass the API Basketball team ID if available (much faster, more reliable)
          scheduleFetchResult = await fetchAndStoreInternationalProspectGames(
            prospect.id, 
            team, 
            apiBasketballTeamId
          );
          
          if (scheduleFetchResult.success) {
            console.log(`[import-and-add] ✅ Successfully fetched and stored ${scheduleFetchResult.gamesCount} international games for prospect ${prospect.id}`);
            
            // Cache team logo for international player (async, non-blocking)
            if (apiBasketballTeamId && team) {
              console.log(`[import-and-add] Fetching and caching team logo for ${team} (ID: ${apiBasketballTeamId})...`);
              fetchLogoFromApiBasketball(apiBasketballTeamId)
                .then(logoUrl => {
                  if (logoUrl) {
                    return cacheTeamLogo(apiBasketballTeamId, team, logoUrl, 'api-basketball');
                  }
                  return false;
                })
                .then(cached => {
                  if (cached) {
                    console.log(`[import-and-add] ✓ Cached team logo for ${team}`);
                  }
                })
                .catch(err => {
                  console.warn(`[import-and-add] Failed to cache team logo for ${team}:`, err);
                });
            }
            
            break; // Success, exit retry loop
          } else {
            console.warn(`[import-and-add] Failed to fetch international schedule for prospect ${prospect.id} (attempt ${scheduleRetryCount + 1}):`, scheduleFetchResult.error);
          }
        } catch (err) {
          console.error(`[import-and-add] Error fetching international prospect schedule (attempt ${scheduleRetryCount + 1}):`, err);
          scheduleFetchResult = {
            success: false,
            gamesCount: 0,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }
        
        scheduleRetryCount++;
      }
      
      if (!scheduleFetchResult?.success) {
        console.error(`[import-and-add] ❌ CRITICAL: Failed to fetch international schedule for prospect ${prospect.id} after ${maxScheduleRetries + 1} attempts`);
        console.error(`[import-and-add] ❌ Player added to board but will have NO GAMES`);
      }
    } else if (teamId) {
      // College player - use ESPN
      const maxScheduleRetries = 2;
      let scheduleRetryCount = 0;
      
      while (!scheduleFetchResult?.success && scheduleRetryCount <= maxScheduleRetries) {
        try {
          if (scheduleRetryCount > 0) {
            console.log(`[import-and-add] Retry ${scheduleRetryCount} of ${maxScheduleRetries} for schedule fetch: prospect ${prospect.id} (team_id: ${teamId})`);
            // Wait a bit before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * scheduleRetryCount));
          }
          
          console.log(`[import-and-add] Fetching schedule for prospect ${prospect.id} (team_id: ${teamId})...`);
          scheduleFetchResult = await fetchAndStoreProspectGames(prospect.id, teamId);
          
          if (scheduleFetchResult.success) {
            console.log(`[import-and-add] Successfully fetched and stored ${scheduleFetchResult.gamesCount} games for prospect ${prospect.id}`);
            break; // Success, exit retry loop
          } else {
            console.warn(`[import-and-add] Failed to fetch schedule for prospect ${prospect.id} (attempt ${scheduleRetryCount + 1}):`, scheduleFetchResult.error);
          }
        } catch (err) {
          console.error(`[import-and-add] Error fetching prospect schedule (attempt ${scheduleRetryCount + 1}):`, err);
          scheduleFetchResult = {
            success: false,
            gamesCount: 0,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }
        
        scheduleRetryCount++;
      }
      
      if (!scheduleFetchResult?.success) {
        console.warn(`[import-and-add] Failed to fetch schedule for prospect ${prospect.id} after ${maxScheduleRetries + 1} attempts`);
      }
    } else {
      console.warn(`[import-and-add] Skipping schedule fetch for prospect ${prospect.id} - no team_id/team available`);
    }

    // 5. Enqueue schedule import for this prospect (for background processing if needed)
    const { error: importError } = await supabaseAdmin
      .from('prospect_schedule_imports')
      .insert({
        prospect_id: prospect.id,
        status: 'pending',
      });

    if (importError) {
      // Log but don't fail - schedule import is optional
      console.warn('Error enqueueing schedule import:', importError);
    }

    // Return success response with game fetch status
    console.log(`[import-and-add] ✅ SUCCESS: Prospect ${prospect.full_name} added to board at rank ${newRank}`);
    console.log(`[import-and-add] Games fetched: ${scheduleFetchResult?.success ? 'YES' : 'NO'} (${scheduleFetchResult?.gamesCount || 0} games)`);
    
    return NextResponse.json<ImportAndAddResponse>({
      prospect: {
        id: prospect.id, // UUID
        full_name: prospect.full_name,
        position: prospect.position,
        team_name: prospect.team_name,
      },
      rank: newRank!,
    }, { status: 200 });
  } catch (error) {
    console.error('Error in import-and-add:', error);
    return NextResponse.json(
      { error: 'Failed to import and add prospect' },
      { status: 500 }
    );
  }
}


