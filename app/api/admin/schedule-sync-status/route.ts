import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    // Get total games synced
    const { count: totalGames, error: countError } = await supabaseAdmin
      .from('international_team_schedules')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    // Get unique teams with schedules
    const { data: teamData } = await supabaseAdmin
      .from('international_team_schedules')
      .select('team_id');
    
    const uniqueTeamsWithSchedules = new Set(teamData?.map(r => r.team_id) || []).size;

    // Get total teams in database
    const { count: totalTeams } = await supabaseAdmin
      .from('international_teams')
      .select('*', { count: 'exact', head: true });

    // Get latest synced teams
    const { data: latestSchedules } = await supabaseAdmin
      .from('international_team_schedules')
      .select('created_at, international_teams!inner(name, league_name)')
      .order('created_at', { ascending: false })
      .limit(10);

    const latestTeams = latestSchedules?.map((s: any) => ({
      team: s.international_teams.name,
      league: s.international_teams.league_name,
      syncedAt: s.created_at,
    })) || [];

    // Get sample games
    const { data: sampleGames } = await supabaseAdmin
      .from('international_team_schedules')
      .select('date, home_team_name, away_team_name, home_score, away_score, status')
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      status: 'success',
      stats: {
        totalGames: totalGames || 0,
        teamsWithSchedules: uniqueTeamsWithSchedules,
        totalTeams: totalTeams || 0,
        progress: totalTeams ? `${((uniqueTeamsWithSchedules / totalTeams) * 100).toFixed(1)}%` : '0%',
      },
      latestTeams,
      sampleGames: sampleGames || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}





