import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const playerName = searchParams.get('name') || 'Maledon';
    const checkDatabase = searchParams.get('checkDatabase') === 'true';
    
    // If checkDatabase=true, return database stats instead
    if (checkDatabase) {
      // Get total games count
      const { count: totalGames } = await supabaseAdmin
        .from('international_team_schedules')
        .select('*', { count: 'exact', head: true });
      
      // Count unique teams using database queries
      // Supabase has a default limit of 1000, so we need to paginate or use a high limit
      // Fetch all home teams (with high limit)
      const { data: homeTeams, error: homeError } = await supabaseAdmin
        .from('international_team_schedules')
        .select('home_team_id, home_team_name')
        .not('home_team_id', 'is', null)
        .limit(100000); // High limit to get all rows
      
      // Fetch all away teams (with high limit)
      const { data: awayTeams, error: awayError } = await supabaseAdmin
        .from('international_team_schedules')
        .select('away_team_id, away_team_name')
        .not('away_team_id', 'is', null)
        .limit(100000); // High limit to get all rows
      
      if (homeError || awayError) {
        console.error('[debug/prospect] Error fetching teams:', homeError || awayError);
        return NextResponse.json({ error: (homeError || awayError)?.message }, { status: 500 });
      }
      
      // Combine and deduplicate teams
      const teamsMap = new Map<number, { names: Set<string>; gameCount: number }>();
      const uniqueTeamIds = new Set<number>();
      const uniqueTeamNames = new Set<string>();
      
      // Process home teams
      if (homeTeams && homeTeams.length > 0) {
        console.log(`[debug/prospect] Processing ${homeTeams.length} home team entries...`);
        homeTeams.forEach((game: any) => {
          const apiId = Number(game.home_team_id);
          if (!isNaN(apiId) && apiId > 0) {
            uniqueTeamIds.add(apiId);
            if (!teamsMap.has(apiId)) {
              teamsMap.set(apiId, { names: new Set(), gameCount: 0 });
            }
            teamsMap.get(apiId)!.gameCount++;
            if (game.home_team_name) {
              teamsMap.get(apiId)!.names.add(game.home_team_name);
              uniqueTeamNames.add(game.home_team_name);
            }
          }
        });
      } else {
        console.warn(`[debug/prospect] No home teams data returned (length: ${homeTeams?.length || 0})`);
      }
      
      // Process away teams
      if (awayTeams && awayTeams.length > 0) {
        console.log(`[debug/prospect] Processing ${awayTeams.length} away team entries...`);
        awayTeams.forEach((game: any) => {
          const apiId = Number(game.away_team_id);
          if (!isNaN(apiId) && apiId > 0) {
            uniqueTeamIds.add(apiId);
            if (!teamsMap.has(apiId)) {
              teamsMap.set(apiId, { names: new Set(), gameCount: 0 });
            }
            teamsMap.get(apiId)!.gameCount++;
            if (game.away_team_name) {
              teamsMap.get(apiId)!.names.add(game.away_team_name);
              uniqueTeamNames.add(game.away_team_name);
            }
          }
        });
      } else {
        console.warn(`[debug/prospect] No away teams data returned (length: ${awayTeams?.length || 0})`);
      }
      
      console.log(`[debug/prospect] Found ${uniqueTeamIds.size} unique teams from ${(homeTeams?.length || 0) + (awayTeams?.length || 0)} game entries`);
      
      // Convert to array format
      const allTeams: Array<{ teamId: number; names: string[]; gameCount: number }> = [];
      teamsMap.forEach((data, teamId) => {
        allTeams.push({
          teamId, // API Basketball ID (number)
          names: Array.from(data.names),
          gameCount: data.gameCount,
        });
      });
      
      // Sort by game count (most games first)
      allTeams.sort((a, b) => b.gameCount - a.gameCount);
      
      // Find teams with multiple name variations
      const teamsWithVariations = allTeams.filter(t => t.names.length > 1);
      teamsWithVariations.sort((a, b) => b.names.length - a.names.length);
      
      // Get games by league
      const { data: leagueData } = await supabaseAdmin
        .from('international_team_schedules')
        .select('league_name')
        .limit(1000);
      
      const leagueCounts: Record<string, number> = {};
      if (leagueData) {
        leagueData.forEach((g: any) => {
          const league = g.league_name || 'Unknown';
          leagueCounts[league] = (leagueCounts[league] || 0) + 1;
        });
      }
      
      // Get date range
      const { data: dateData } = await supabaseAdmin
        .from('international_team_schedules')
        .select('date')
        .order('date', { ascending: true })
        .limit(1);
      
      const { data: dateDataMax } = await supabaseAdmin
        .from('international_team_schedules')
        .select('date')
        .order('date', { ascending: false })
        .limit(1);
      
      // Also count teams in international_teams table (teams we've synced schedules for)
      const { count: teamsInDatabase } = await supabaseAdmin
        .from('international_teams')
        .select('*', { count: 'exact', head: true });
      
      // Count teams that have at least one prospect linked
      const { data: allTeamsWithProspects } = await supabaseAdmin
        .from('prospects')
        .select('international_team_id')
        .not('international_team_id', 'is', null)
        .limit(100000);
      
      const uniqueTeamsWithProspects = new Set(
        (allTeamsWithProspects || []).map((p: any) => p.international_team_id).filter(Boolean)
      );
      
      // Get ALL teams with their roster and schedule status
      const { data: allTeamsData, error: allTeamsError } = await supabaseAdmin
        .from('international_teams')
        .select(`
          id,
          name,
          display_name,
          api_team_id,
          league_name,
          country
        `)
        .order('name')
        .limit(10000); // Should cover all 2406 teams
      
      if (allTeamsError) {
        console.error('[debug/prospect] Error fetching all teams:', allTeamsError);
      }
      
      // For each team, check if it has rosters and schedules
      const teamsWithStatus: Array<{
        team: any;
        hasRoster: boolean;
        hasSchedule: boolean;
        hasProspects: boolean;
        rosterCount: number;
        scheduleCount: number;
        prospectCount: number;
      }> = [];
      
      if (allTeamsData) {
        console.log(`[debug/prospect] Checking status for ${allTeamsData.length} teams...`);
        
        // Batch check rosters
        const { data: rosterData } = await supabaseAdmin
          .from('international_rosters')
          .select('team_id')
          .limit(100000);
        
        const teamsWithRosters = new Set(
          (rosterData || []).map((r: any) => r.team_id).filter(Boolean)
        );
        
        // Batch check schedules
        const { data: scheduleData } = await supabaseAdmin
          .from('international_team_schedules')
          .select('team_id')
          .limit(100000);
        
        const teamsWithSchedules = new Set(
          (scheduleData || []).map((s: any) => s.team_id).filter(Boolean)
        );
        
        // Count rosters per team
        const rosterCounts = new Map<string, number>();
        if (rosterData) {
          rosterData.forEach((r: any) => {
            if (r.team_id) {
              rosterCounts.set(r.team_id, (rosterCounts.get(r.team_id) || 0) + 1);
            }
          });
        }
        
        // Count schedules per team (by team_id)
        const scheduleCounts = new Map<string, number>();
        if (scheduleData) {
          scheduleData.forEach((s: any) => {
            if (s.team_id) {
              scheduleCounts.set(s.team_id, (scheduleCounts.get(s.team_id) || 0) + 1);
            }
          });
        }
        
        // Count prospects per team
        const prospectCounts = new Map<string, number>();
        if (allTeamsWithProspects) {
          allTeamsWithProspects.forEach((p: any) => {
            if (p.international_team_id) {
              prospectCounts.set(p.international_team_id, (prospectCounts.get(p.international_team_id) || 0) + 1);
            }
          });
        }
        
        // Build status array
        for (const team of allTeamsData) {
          teamsWithStatus.push({
            team,
            hasRoster: teamsWithRosters.has(team.id),
            hasSchedule: teamsWithSchedules.has(team.id),
            hasProspects: uniqueTeamsWithProspects.has(team.id),
            rosterCount: rosterCounts.get(team.id) || 0,
            scheduleCount: scheduleCounts.get(team.id) || 0,
            prospectCount: prospectCounts.get(team.id) || 0,
          });
        }
        
        console.log(`[debug/prospect] Processed ${teamsWithStatus.length} teams`);
      }
      
      // Get sample teams with prospect counts (for display)
      const sampleTeamsWithProspects = teamsWithStatus
        .filter(t => t.hasProspects)
        .slice(0, 20);
      
      // FINAL SUMMARY LOG (AT VERY END)
      console.log(`\n\n[debug/prospect] ========== FINAL DATABASE STATS SUMMARY ==========`);
      console.log(`[debug/prospect] Total Games: ${totalGames || 0}`);
      console.log(`[debug/prospect] Unique Teams in Games (API Basketball IDs): ${uniqueTeamIds.size}`);
      console.log(`[debug/prospect] Unique Team Names: ${uniqueTeamNames.size}`);
      console.log(`[debug/prospect] Teams in Database (synced): ${teamsInDatabase || 0}`);
      console.log(`[debug/prospect] Teams with Prospects Linked: ${uniqueTeamsWithProspects.size}`);
      console.log(`[debug/prospect] All Teams Array Length: ${allTeams.length}`);
      console.log(`[debug/prospect] Teams with Multiple Names: ${teamsWithVariations.length}`);
      console.log(`[debug/prospect] Home Teams Fetched: ${homeTeams?.length || 0}`);
      console.log(`[debug/prospect] Away Teams Fetched: ${awayTeams?.length || 0}`);
      console.log(`[debug/prospect] ============================================================\n\n`);
      
      // Calculate summary stats
      const teamsWithRosters = teamsWithStatus.filter(t => t.hasRoster).length;
      const teamsWithSchedules = teamsWithStatus.filter(t => t.hasSchedule).length;
      const teamsWithBoth = teamsWithStatus.filter(t => t.hasRoster && t.hasSchedule).length;
      
      return NextResponse.json({
        totalGames: totalGames || 0,
        uniqueTeamsInGames: uniqueTeamIds.size, // All unique teams that appear in games (API Basketball IDs)
        uniqueTeamNames: uniqueTeamNames.size, // All unique team names
        teamsInDatabase: teamsInDatabase || 0, // Teams in international_teams table (teams we synced schedules for)
        teamsWithProspectsLinked: uniqueTeamsWithProspects.size, // How many teams have at least one prospect
        teamsWithRosters: teamsWithRosters, // How many teams have rosters synced
        teamsWithSchedules: teamsWithSchedules, // How many teams have schedules synced
        teamsWithBoth: teamsWithBoth, // How many teams have both rosters and schedules
        allTeamsWithStatus: teamsWithStatus, // All teams with their roster/schedule/prospect status
        sampleTeamsWithProspects: sampleTeamsWithProspects, // Sample of teams with prospects
        allTeams: allTeams, // All teams with schedules (API Basketball IDs)
        teamsWithMultipleNames: teamsWithVariations, // Teams with name variations
        leagueCounts,
        dateRange: {
          earliest: dateData?.[0]?.date || null,
          latest: dateDataMax?.[0]?.date || null,
        },
      });
    }
    
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

