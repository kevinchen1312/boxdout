import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/debug-pokusevski
 * Check Pokusevski's data in the database
 */
export async function GET() {
  try {
    // Find Pokusevski
    const { data: prospects } = await supabaseAdmin
      .from('prospects')
      .select('*')
      .ilike('full_name', '%pokusevski%');

    if (!prospects || prospects.length === 0) {
      return NextResponse.json({ error: 'Pokusevski not found' });
    }

    const results = [];

    for (const prospect of prospects) {
      // Get games
      const { data: games } = await supabaseAdmin
        .from('prospect_games')
        .select('*')
        .eq('prospect_id', prospect.id)
        .order('date_key', { ascending: true });

      // Categorize games
      const nblGames = (games || []).filter(g => {
        const teams = `${g.home_team} ${g.away_team}`.toLowerCase();
        return teams.includes('brisbane') || teams.includes('melbourne') || 
               teams.includes('perth') || teams.includes('sydney') || 
               teams.includes('adelaide') || teams.includes('tasmania') || 
               teams.includes('illawarra') || teams.includes('breakers');
      });

      const euroGames = (games || []).filter(g => {
        const teams = `${g.home_team} ${g.away_team}`.toLowerCase();
        return teams.includes('paris') || teams.includes('monaco') || 
               teams.includes('barcelona') || teams.includes('madrid') || 
               teams.includes('fenerbah') || teams.includes('partizan') ||
               teams.includes('borac') || teams.includes('olympiacos');
      });

      results.push({
        prospect: {
          id: prospect.id,
          name: prospect.full_name,
          team: prospect.team_name,
          teamId: prospect.team_id,  // THIS IS CRITICAL FOR FETCHING
          league: prospect.league,  // THIS IS KEY
          source: prospect.source,
        },
        games: {
          total: games?.length || 0,
          nbl: nblGames.length,
          euro: euroGames.length,
        },
        sampleNBL: nblGames.slice(0, 3).map(g => ({
          date: g.date_key,
          matchup: `${g.away_team} @ ${g.home_team}`,
          hasLogos: !!(g.home_team_logo || g.away_team_logo),
        })),
        sampleEuro: euroGames.slice(0, 3).map(g => ({
          date: g.date_key,
          matchup: `${g.away_team} @ ${g.home_team}`,
          hasLogos: !!(g.home_team_logo || g.away_team_logo),
        })),
      });
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
      diagnosis: results[0]?.games.nbl > 0 ? 
        'NBL games still in database - fix endpoint may have failed' :
        results[0]?.prospect.league ? 
          'No NBL games in DB, but league is set - filtering should work' :
          'League field is empty - filtering will not work!',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

