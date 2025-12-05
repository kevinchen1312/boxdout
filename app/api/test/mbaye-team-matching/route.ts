import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { teamNamesMatch } from '@/lib/loadSchedules';

export async function GET(request: NextRequest) {
  try {
    // Find Mbaye Ndiaye prospect
    const { data: prospect, error: prospectError } = await supabaseAdmin
      .from('prospects')
      .select('id, full_name, team_name, team_id')
      .or('full_name.ilike.%mbaye%,full_name.ilike.%ndiaye%')
      .limit(5);

    if (prospectError) {
      return NextResponse.json({ error: 'Failed to find prospect', details: prospectError }, { status: 500 });
    }

    if (!prospect || prospect.length === 0) {
      return NextResponse.json({ error: 'No prospect found' }, { status: 404 });
    }

    const mbayeProspect = prospect[0];
    console.log(`[Test] Found prospect: ${mbayeProspect.full_name}, team: ${mbayeProspect.team_name}`);

    // Get watchlist entry
    const { data: watchlist, error: watchlistError } = await supabaseAdmin
      .from('user_rankings')
      .select('id, prospect_id, rank')
      .eq('prospect_id', mbayeProspect.id)
      .limit(1);

    if (watchlistError) {
      return NextResponse.json({ error: 'Failed to find watchlist entry', details: watchlistError }, { status: 500 });
    }

    // Get games for this prospect
    const { data: games, error: gamesError } = await supabaseAdmin
      .from('prospect_games')
      .select('game_id, date_key, home_team, away_team, tipoff')
      .eq('prospect_id', mbayeProspect.id)
      .order('date_key', { ascending: true })
      .limit(10);

    if (gamesError) {
      return NextResponse.json({ error: 'Failed to find games', details: gamesError }, { status: 500 });
    }

    // Test matching for each game
    const prospectTeamName = mbayeProspect.team_name || '';
    const results = games?.map(game => {
      const prospectIsHome = teamNamesMatch(prospectTeamName, game.home_team);
      const prospectIsAway = teamNamesMatch(prospectTeamName, game.away_team);
      
      let prospectSide: 'home' | 'away' | 'unknown';
      if (prospectIsHome && !prospectIsAway) {
        prospectSide = 'home';
      } else if (prospectIsAway && !prospectIsHome) {
        prospectSide = 'away';
      } else if (prospectIsHome && prospectIsAway) {
        prospectSide = 'home'; // Default to home if both match
      } else {
        prospectSide = 'unknown';
      }

      return {
        date: game.date_key,
        home_team: game.home_team,
        away_team: game.away_team,
        prospectTeam: prospectTeamName,
        prospectIsHome,
        prospectIsAway,
        prospectSide,
        tipoff: game.tipoff,
      };
    }) || [];

    return NextResponse.json({
      prospect: {
        id: mbayeProspect.id,
        name: mbayeProspect.full_name,
        team_name: mbayeProspect.team_name,
        team_id: mbayeProspect.team_id,
      },
      watchlist: watchlist?.[0] || null,
      games: results,
    });
  } catch (error) {
    console.error('[Test] Error:', error);
    return NextResponse.json({ error: 'Failed to run test', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}




