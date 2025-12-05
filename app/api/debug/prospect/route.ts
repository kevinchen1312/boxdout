import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const playerName = searchParams.get('name') || 'Maledon';
    
    // Query prospects table
    const { data: prospects, error: prospectsError } = await supabaseAdmin
      .from('prospects')
      .select('*')
      .ilike('full_name', `%${playerName}%`);
    
    if (prospectsError) {
      return NextResponse.json({ error: prospectsError.message }, { status: 500 });
    }
    
    const results: any = {
      playerName,
      prospectsFound: prospects?.length || 0,
      prospects: [],
    };
    
    if (prospects && prospects.length > 0) {
      for (const prospect of prospects) {
        const prospectInfo: any = {
          id: prospect.id,
          fullName: prospect.full_name,
          teamName: prospect.team_name,
          internationalTeamId: prospect.international_team_id,
          source: prospect.source,
          teamId: prospect.team_id,
        };
        
        // Query games for this prospect's international team
        // First try by international_team_id
        if (prospect.international_team_id) {
          const { data: games, error: gamesError } = await supabaseAdmin
            .from('international_team_schedules')
            .select('*')
            .eq('team_id', prospect.international_team_id)
            .order('date', { ascending: true });
          
          if (!gamesError && games) {
            prospectInfo.gamesCount = games.length;
            prospectInfo.games = games.slice(0, 10).map((g: any) => ({
              date: g.date,
              homeTeam: g.home_team_name,
              awayTeam: g.away_team_name,
              league: g.league_name,
            }));
            prospectInfo.totalGames = games.length;
            
            // Get unique leagues
            const leagues = new Set(games.map((g: any) => g.league_name).filter(Boolean));
            prospectInfo.leagues = Array.from(leagues);
          }
        } else if (prospect.team_name) {
          // If no international_team_id, try searching by team name
          // Normalize team name for matching
          const normalizedTeamName = prospect.team_name.toLowerCase().trim();
          
          // Try exact match first
          let { data: games, error: gamesError } = await supabaseAdmin
            .from('international_team_schedules')
            .select('*')
            .or(`home_team_name.ilike.%${prospect.team_name}%,away_team_name.ilike.%${prospect.team_name}%`)
            .order('date', { ascending: true });
          
          // If no results, try variations (e.g., "Lyon-Villeurbanne" vs "ASVEL")
          if ((!games || games.length === 0) && normalizedTeamName.includes('lyon')) {
            const { data: asvelGames } = await supabaseAdmin
              .from('international_team_schedules')
              .select('*')
              .or(`home_team_name.ilike.%asvel%,away_team_name.ilike.%asvel%`)
              .order('date', { ascending: true });
            games = asvelGames;
          }
          
          if (!gamesError && games && games.length > 0) {
            prospectInfo.gamesCount = games.length;
            prospectInfo.games = games.slice(0, 10).map((g: any) => ({
              date: g.date,
              homeTeam: g.home_team_name,
              awayTeam: g.away_team_name,
              league: g.league_name,
            }));
            prospectInfo.totalGames = games.length;
            
            // Get unique leagues
            const leagues = new Set(games.map((g: any) => g.league_name).filter(Boolean));
            prospectInfo.leagues = Array.from(leagues);
            
            prospectInfo.gamesFoundBy = 'team name search';
          }
        }
        
        // Check if in user rankings
        const { data: rankings } = await supabaseAdmin
          .from('user_rankings')
          .select('rank, user_id')
          .eq('prospect_id', prospect.id)
          .limit(5);
        
        if (rankings && rankings.length > 0) {
          prospectInfo.inUserRankings = true;
          prospectInfo.rankingCount = rankings.length;
        }
        
        results.prospects.push(prospectInfo);
      }
    }
    
    return NextResponse.json(results, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to query database' },
      { status: 500 }
    );
  }
}

