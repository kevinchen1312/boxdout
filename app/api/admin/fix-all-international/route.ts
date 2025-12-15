import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAndStoreInternationalProspectGames } from '@/lib/fetchInternationalProspectGames';

/**
 * GET /api/admin/fix-all-international
 * Find and fix all international players with missing or incorrect team associations
 */
export async function GET() {
  const apiKey = process.env.API_BASKETBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  try {
    // Find all international prospects (external source or French/European leagues)
    const { data: prospects } = await supabaseAdmin
      .from('prospects')
      .select('*')
      .or('source.eq.external,league.ilike.%French%,league.ilike.%Europe%,league.ilike.%Super League%,league.ilike.%Adriatic%');

    if (!prospects || prospects.length === 0) {
      return NextResponse.json({ message: 'No international prospects found' });
    }

    console.log(`[fix-all-international] Found ${prospects.length} international prospects`);

    const results = [];

    for (const prospect of prospects) {
      console.log(`\n[fix-all-international] Processing: ${prospect.full_name} (Team: ${prospect.team_name}, ID: ${prospect.team_id})`);

      const result: any = {
        name: prospect.full_name,
        currentTeam: prospect.team_name,
        currentTeamId: prospect.team_id,
        league: prospect.league,
      };

      // If no team_id, try to find it
      if (!prospect.team_id && prospect.team_name) {
        console.log(`[fix-all-international] Searching API for team: ${prospect.team_name}`);
        
        try {
          const searchUrl = `https://v1.basketball.api-sports.io/teams?search=${encodeURIComponent(prospect.team_name)}`;
          const response = await fetch(searchUrl, {
            headers: { 'x-apisports-key': apiKey },
          });

          if (response.ok) {
            const data = await response.json();
            const teams = data.response || [];
            
            if (teams.length > 0) {
              // Try to find best match
              const exactMatch = teams.find((t: any) => 
                t.name.toLowerCase() === prospect.team_name.toLowerCase()
              );
              const partialMatch = teams.find((t: any) => 
                t.name.toLowerCase().includes(prospect.team_name.toLowerCase()) ||
                prospect.team_name.toLowerCase().includes(t.name.toLowerCase())
              );
              
              const bestMatch = exactMatch || partialMatch || teams[0];
              
              result.foundTeam = {
                id: bestMatch.id,
                name: bestMatch.name,
                country: bestMatch.country?.name,
                logo: bestMatch.logo,
              };

              // Update prospect with found team ID
              await supabaseAdmin
                .from('prospects')
                .update({ 
                  team_id: bestMatch.id,
                  team_name: bestMatch.name, // Use API's exact name
                })
                .eq('id', prospect.id);

              result.updated = true;
              result.newTeamId = bestMatch.id;
              result.newTeamName = bestMatch.name;
            } else {
              result.error = 'No teams found in API search';
            }
          }
        } catch (error) {
          result.searchError = error instanceof Error ? error.message : 'Unknown error';
        }
      }

      // Check existing games
      const { data: games } = await supabaseAdmin
        .from('prospect_games')
        .select('home_team, away_team, date_key')
        .eq('prospect_id', prospect.id)
        .limit(5);

      result.currentGames = games?.length || 0;
      result.sampleGames = (games || []).map(g => `${g.away_team} @ ${g.home_team} (${g.date_key})`);

      results.push(result);
    }

    return NextResponse.json({
      success: true,
      prospectsChecked: prospects.length,
      results,
      nextStep: 'Use POST /api/admin/fix-all-international to refetch all games',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/fix-all-international
 * Refetch games for all international prospects
 */
export async function POST() {
  try {
    // Find all international prospects with team IDs
    const { data: prospects } = await supabaseAdmin
      .from('prospects')
      .select('*')
      .not('team_id', 'is', null)
      .or('source.eq.external,league.ilike.%French%,league.ilike.%Europe%,league.ilike.%Super League%,league.ilike.%Adriatic%');

    if (!prospects || prospects.length === 0) {
      return NextResponse.json({ message: 'No prospects to fix' });
    }

    const results = [];

    for (const prospect of prospects) {
      console.log(`\n[fix-all-international] Fetching games for: ${prospect.full_name} (${prospect.team_name})`);

      // Delete old games
      await supabaseAdmin
        .from('prospect_games')
        .delete()
        .eq('prospect_id', prospect.id);

      // Fetch new games
      const fetchResult = await fetchAndStoreInternationalProspectGames(
        prospect.id,
        prospect.team_name,
        prospect.team_id
      );

      results.push({
        name: prospect.full_name,
        team: prospect.team_name,
        teamId: prospect.team_id,
        success: fetchResult.success,
        gamesFetched: fetchResult.gamesCount,
        error: fetchResult.error,
      });
    }

    return NextResponse.json({
      success: true,
      prospectsProcessed: prospects.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}





