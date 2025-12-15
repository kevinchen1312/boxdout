import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get Supabase user ID
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get Hoshikawa from user_rankings
    const { data: rankings } = await supabaseAdmin
      .from('user_rankings')
      .select(`
        rank,
        prospects!inner(
          id,
          full_name,
          team_name,
          international_team_id,
          source
        )
      `)
      .eq('user_id', user.id)
      .ilike('prospects.full_name', '%hoshikawa%');

    if (!rankings || rankings.length === 0) {
      return NextResponse.json({
        error: 'Hoshikawa not found in user_rankings',
        allRankings: await supabaseAdmin
          .from('user_rankings')
          .select('rank, prospects(full_name, team_name)')
          .eq('user_id', user.id),
      });
    }

    const hoshikawaRanking: any = rankings[0];
    const prospect = hoshikawaRanking.prospects;

    // Check if games exist for this team
    const { data: games, count } = await supabaseAdmin
      .from('international_team_schedules')
      .select('*', { count: 'exact' })
      .eq('team_id', prospect.international_team_id)
      .gte('date_key', '2025-12-06')
      .lte('date_key', '2025-12-06');

    return NextResponse.json({
      hoshikawa: {
        rank: hoshikawaRanking.rank,
        full_name: prospect.full_name,
        team_name: prospect.team_name,
        international_team_id: prospect.international_team_id,
        source: prospect.source,
      },
      gamesOnDec6: {
        count,
        games: games?.map(g => ({
          date_key: g.date_key,
          home: g.home_team_name,
          away: g.away_team_name,
        })),
      },
      diagnosis: {
        hasInternationalTeamId: !!prospect.international_team_id,
        isInternationalRoster: prospect.source === 'international-roster',
        shouldLoadGames: !!prospect.international_team_id && prospect.source === 'international-roster',
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}





