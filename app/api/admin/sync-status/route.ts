import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    // Get total count
    const { count: totalPlayers, error: countError } = await supabaseAdmin
      .from('international_rosters')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    // Get unique teams count
    const { data: teamData } = await supabaseAdmin
      .from('international_rosters')
      .select('team_id');
    
    const uniqueTeams = new Set(teamData?.map(r => r.team_id) || []).size;

    // Get latest synced teams
    const { data: latestRosters } = await supabaseAdmin
      .from('international_rosters')
      .select('created_at, international_teams!inner(name)')
      .order('created_at', { ascending: false })
      .limit(10);

    const latestTeams = latestRosters?.map((r: any) => ({
      team: r.international_teams.name,
      syncedAt: r.created_at,
    })) || [];

    // Get sample player names from different teams
    const { data: samples } = await supabaseAdmin
      .from('international_rosters')
      .select('player_name, international_teams!inner(name)')
      .order('created_at', { ascending: false })
      .limit(20);

    const samplePlayers = samples?.map((s: any) => ({
      name: s.player_name,
      team: s.international_teams.name,
    })) || [];

    return NextResponse.json({
      status: 'success',
      stats: {
        totalPlayers: totalPlayers || 0,
        teamsWithRosters: uniqueTeams,
      },
      latestTeams,
      samplePlayers,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}




