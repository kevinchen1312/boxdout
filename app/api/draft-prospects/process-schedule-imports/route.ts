import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import { findTeamEntry } from '@/lib/fetchCustomPlayerGames';

/**
 * POST /api/draft-prospects/process-schedule-imports
 * Process pending schedule imports for prospects
 * This can be called manually or via a cron job
 */
export async function POST(request: NextRequest) {
  try {
    // Get pending imports
    const { data: pendingImports, error: fetchError } = await supabaseAdmin
      .from('prospect_schedule_imports')
      .select(`
        id,
        prospect_id,
        prospects:prospect_id (
          id,
          espn_id,
          team_name,
          league,
          full_name
        )
      `)
      .eq('status', 'pending')
      .limit(10); // Process 10 at a time

    if (fetchError) {
      console.error('Error fetching pending imports:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch pending imports' },
        { status: 500 }
      );
    }

    if (!pendingImports || pendingImports.length === 0) {
      return NextResponse.json({ 
        message: 'No pending imports',
        processed: 0 
      });
    }

    const results = [];

    for (const importItem of pendingImports) {
      const prospect = (importItem as any).prospects;
      
      if (!prospect) {
        // Mark as error if prospect not found
        await supabaseAdmin
          .from('prospect_schedule_imports')
          .update({ 
            status: 'error',
            last_error: 'Prospect not found'
          })
          .eq('id', importItem.id);
        continue;
      }

      try {
        // Mark as in_progress
        await supabaseAdmin
          .from('prospect_schedule_imports')
          .update({ status: 'in_progress' })
          .eq('id', importItem.id);

        // Find team ID from team name using existing team directory
        if (!prospect.team_name) {
          throw new Error('Prospect has no team name');
        }

        const teamEntry = await findTeamEntry(prospect.team_name);
        
        if (!teamEntry) {
          throw new Error(`Could not find team ID for ${prospect.team_name}`);
        }

        // Fetch schedule from ESPN
        const scheduleUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamEntry.id}/schedule`;
        const response = await fetch(scheduleUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch schedule: ${response.status} ${response.statusText}`);
        }

        const scheduleData = await response.json();
        const events = scheduleData.events || [];

        // Process and insert games
        let gamesInserted = 0;
        for (const event of events) {
          const comp = event.competitions?.[0];
          if (!comp) continue;

          const statusType = comp.status?.type;
          // Only process future/pre games (scheduled games)
          if (statusType?.state !== 'pre') continue;

          const competitors = comp.competitors || [];
          const home = competitors.find((c: any) => c.homeAway === 'home');
          const away = competitors.find((c: any) => c.homeAway === 'away');

          if (!home || !away) continue;

          const gameId = event.id;
          const eventDate = parseISO(event.date);
          const dateKey = format(eventDate, 'yyyy-MM-dd');
          const date = format(eventDate, 'yyyy-MM-dd');

          // Determine if this is home, away, or neutral
          const prospectIsHome = home.team?.id === teamEntry.id;
          const isNeutral = comp.neutralSite || false;
          let locationType: 'home' | 'away' | 'neutral' = 'away';
          if (isNeutral) {
            locationType = 'neutral';
          } else if (prospectIsHome) {
            locationType = 'home';
          }

          // Extract TV info
          const broadcasts = comp.broadcasts || [];
          const tv = broadcasts
            .map((b: any) => b.media?.shortName || b.names?.[0])
            .filter(Boolean)
            .join(', ') || null;

          // Extract venue
          const venue = comp.venue?.fullName || null;

          // Extract tipoff time
          let tipoff: string | null = null;
          if (comp.status?.type?.shortDetail) {
            const shortDetail = comp.status.type.shortDetail;
            // Parse time from shortDetail like "Nov 3, 2025 - 8:30 PM ET"
            const timeMatch = shortDetail.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)\s*ET)/i);
            if (timeMatch) {
              tipoff = timeMatch[1];
            } else {
              tipoff = shortDetail;
            }
          }

          // Format team names
          const homeTeam = home.team?.displayName || home.team?.name || 'TBD';
          const awayTeam = away.team?.displayName || away.team?.name || 'TBD';

          // Check if game already exists for this prospect
          // We'll use custom_player_games table for now (can be migrated to prospect_games later)
          // First, check if we need to create a custom_player entry for this prospect
          // For now, we'll create games linked to the prospect via a different mechanism
          // Since we're using the prospects table, we need to check if there's a prospect_games table
          // or if we should create custom_player entries

          // For MVP, let's create the games in custom_player_games by creating/using a custom_player entry
          // First, get the user_id from user_rankings for this prospect
          const { data: userRanking } = await supabaseAdmin
            .from('user_rankings')
            .select('user_id')
            .eq('prospect_id', prospect.id)
            .limit(1)
            .maybeSingle();

          if (!userRanking) {
            // No user has this prospect ranked, skip game import
            continue;
          }

          // Check if custom_player exists for this prospect
          let customPlayerId: string | null = null;
          const { data: existingCustomPlayer } = await supabaseAdmin
            .from('custom_players')
            .select('id')
            .eq('user_id', userRanking.user_id)
            .eq('name', prospect.full_name)
            .maybeSingle();

          if (existingCustomPlayer) {
            customPlayerId = existingCustomPlayer.id;
          } else {
            // Create a custom_player entry to link games
            const { data: newCustomPlayer, error: createError } = await supabaseAdmin
              .from('custom_players')
              .insert({
                user_id: userRanking.user_id,
                name: prospect.full_name,
                position: prospect.position || 'N/A',
                team: prospect.team_name || 'N/A',
                rank: 999, // Placeholder rank
                team_id: teamEntry.id,
              })
              .select('id')
              .single();

            if (createError || !newCustomPlayer) {
              console.warn('Failed to create custom_player for prospect:', createError);
              continue;
            }
            customPlayerId = newCustomPlayer.id;
          }

          // Check if game already exists
          const { data: existingGame } = await supabaseAdmin
            .from('custom_player_games')
            .select('id')
            .eq('custom_player_id', customPlayerId)
            .eq('game_id', gameId)
            .maybeSingle();

          if (existingGame) continue; // Already imported

          // Insert game
          const { error: insertError } = await supabaseAdmin
            .from('custom_player_games')
            .insert({
              custom_player_id: customPlayerId,
              game_id: gameId,
              date,
              date_key: dateKey,
              home_team: homeTeam,
              away_team: awayTeam,
              tipoff,
              tv,
              venue,
              location_type: locationType,
              source: 'espn',
            });

          if (insertError) {
            console.warn('Failed to insert game:', insertError);
            continue;
          }

          gamesInserted++;
        }

        // Mark as done
        await supabaseAdmin
          .from('prospect_schedule_imports')
          .update({ 
            status: 'done',
            last_error: null
          })
          .eq('id', importItem.id);

        results.push({
          prospect_id: prospect.id,
          prospect_name: prospect.full_name,
          games_inserted: gamesInserted,
          status: 'success'
        });
      } catch (error) {
        // Mark as error
        await supabaseAdmin
          .from('prospect_schedule_imports')
          .update({ 
            status: 'error',
            last_error: error instanceof Error ? error.message : 'Unknown error'
          })
          .eq('id', importItem.id);

        results.push({
          prospect_id: prospect.id,
          prospect_name: prospect.full_name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      message: 'Processed schedule imports',
      processed: results.length,
      results
    });
  } catch (error) {
    console.error('Error processing schedule imports:', error);
    return NextResponse.json(
      { error: 'Failed to process schedule imports' },
      { status: 500 }
    );
  }
}

