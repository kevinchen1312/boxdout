import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const { data: prospects } = await supabaseAdmin
      .from('prospects')
      .select('*')
      .ilike('full_name', '%pokusevski%');

    if (!prospects || prospects.length === 0) {
      return NextResponse.json({ error: 'Not found' });
    }

    const prospect = prospects[0];

    const { data: games } = await supabaseAdmin
      .from('prospect_games')
      .select('*')
      .eq('prospect_id', prospect.id)
      .order('date_key', { ascending: true });

    return NextResponse.json({
      prospect: {
        id: prospect.id,
        name: prospect.full_name,
        team: prospect.team_name,
        teamId: prospect.team_id,
        league: prospect.league,
      },
      gamesInDatabase: games?.length || 0,
      sampleGames: (games || []).slice(0, 5).map(g => ({
        date: g.date_key,
        home: g.home_team,
        away: g.away_team,
        hasLogos: !!(g.home_team_logo || g.away_team_logo),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}





