import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const name = request.nextUrl.searchParams.get('name');
    if (!name) {
      return NextResponse.json({ error: 'Missing name parameter' }, { status: 400 });
    }

    // Check prospects table
    const { data: prospects } = await supabaseAdmin
      .from('prospects')
      .select('*')
      .ilike('full_name', `%${name}%`);

    // Check player_team_mappings
    const { data: mappings } = await supabaseAdmin
      .from('player_team_mappings')
      .select('*')
      .ilike('player_name', `%${name}%`);

    // Check games
    const prospectIds = (prospects || []).map(p => p.id);
    let games: any[] = [];
    if (prospectIds.length > 0) {
      const { data: gamesData } = await supabaseAdmin
        .from('prospect_games')
        .select('*')
        .in('prospect_id', prospectIds)
        .order('date_key', { ascending: true })
        .limit(10);
      games = gamesData || [];
    }

    return NextResponse.json({
      prospects: prospects || [],
      mappings: mappings || [],
      sampleGames: games.map(g => ({
        date: g.date_key,
        home: g.home_team,
        away: g.away_team,
        source: g.source,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}





