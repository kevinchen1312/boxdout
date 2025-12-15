import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    // Get ALL Besiktas games
    const { data: allGames, error } = await supabaseAdmin
      .from('international_team_schedules')
      .select('*')
      .eq('team_id', '3ef42f64-bcae-416c-b7bb-3896d054c2d3')
      .order('date', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Check for games with college teams
    const suspiciousGames = allGames?.filter(g => 
      g.home_team_name?.toLowerCase().includes('duke') ||
      g.away_team_name?.toLowerCase().includes('duke') ||
      g.home_team_name?.toLowerCase().includes('louisville') ||
      g.away_team_name?.toLowerCase().includes('louisville') ||
      g.home_team_name?.toLowerCase().includes('fresno') ||
      g.away_team_name?.toLowerCase().includes('fresno') ||
      g.home_team_name?.toLowerCase().includes('arkansas') ||
      g.away_team_name?.toLowerCase().includes('arkansas')
    ) || [];

    return NextResponse.json({
      totalGames: allGames?.length || 0,
      suspiciousGames: suspiciousGames.map(g => ({
        date: g.date_key,
        home: g.home_team_name,
        away: g.away_team_name,
        venue: g.venue,
      })),
      allGames: allGames?.map(g => ({
        date: g.date_key,
        home: g.home_team_name,
        away: g.away_team_name,
      })) || [],
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to check',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}





