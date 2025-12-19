import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const debug: any = {
      clerkUserId,
      steps: [],
    };

    // 1. Get Supabase user ID
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (!user) {
      debug.steps.push({ step: 1, status: 'FAILED', message: 'No user found in users table' });
      return NextResponse.json(debug);
    }

    debug.supabaseUserId = user.id;
    debug.steps.push({ step: 1, status: 'OK', message: 'Found Supabase user ID' });

    // 2. Get user rankings with international roster players
    const { data: rankings, error: rankingsError } = await supabaseAdmin
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
      .eq('user_id', user.id);

    debug.steps.push({ 
      step: 2, 
      status: rankingsError ? 'FAILED' : 'OK',
      message: `Found ${rankings?.length || 0} ranked prospects`,
      error: rankingsError,
      data: rankings,
    });

    // 3. Filter for international roster players
    const internationalProspects = rankings?.filter(
      (r: any) => r.prospects?.international_team_id && r.prospects?.source === 'international-roster'
    ) || [];

    debug.steps.push({
      step: 3,
      status: 'OK',
      message: `Found ${internationalProspects.length} international roster players`,
      data: internationalProspects.map((r: any) => ({
        name: r.prospects.full_name,
        team: r.prospects.team_name,
        teamId: r.prospects.international_team_id,
        source: r.prospects.source,
      })),
    });

    if (internationalProspects.length === 0) {
      debug.steps.push({ step: 4, status: 'STOPPED', message: 'No international roster players to load games for' });
      return NextResponse.json(debug);
    }

    // 4. Get team IDs
    const teamIds = internationalProspects.map((r: any) => r.prospects.international_team_id);
    debug.teamIds = teamIds;

    // 5. Fetch games from international_team_schedules
    const { data: gamesData, error: gamesError } = await supabaseAdmin
      .from('international_team_schedules')
      .select('*')
      .in('team_id', teamIds)
      .order('date', { ascending: true });

    debug.steps.push({
      step: 5,
      status: gamesError ? 'FAILED' : 'OK',
      message: `Found ${gamesData?.length || 0} games in international_team_schedules`,
      error: gamesError,
      sampleGames: gamesData?.slice(0, 5).map(g => ({
        date: g.date,
        home: g.home_team_name,
        away: g.away_team_name,
        teamId: g.team_id,
      })),
    });

    return NextResponse.json(debug);
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}

