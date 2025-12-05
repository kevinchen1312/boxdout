import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;
const BASE_URL = 'https://v1.basketball.api-sports.io';

export async function POST() {
  try {
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const besiktasTeamId = 1266;
    const besiktasDbId = '3ef42f64-bcae-416c-b7bb-3896d054c2d3';
    const eurocupLeagueId = 194; // Real EuroCup league ID
    const season = '2024'; // EuroCup uses single-year format for 2024-25 season

    const params = new URLSearchParams({
      league: String(eurocupLeagueId),
      season: season,
      team: String(besiktasTeamId),
    });

    const response = await fetch(`${BASE_URL}/games?${params.toString()}`, {
      headers: { 'x-apisports-key': apiKey },
    });

    const data = await response.json();

    if (!data.response || data.response.length === 0) {
      return NextResponse.json({ 
        message: `No games found for season ${season}`,
        apiResults: data.results,
        errors: data.errors,
      });
    }

    // Insert games
    const inserted = [];
    for (const game of data.response) {
      const gameId = `apibball-${game.id}`;
      const gameDate = new Date(game.date);
      const dateKey = gameDate.toISOString().split('T')[0];
      const isHome = game.teams.home.id === besiktasTeamId;

      const gameData = {
        team_id: besiktasDbId,
        game_id: gameId,
        date: gameDate.toISOString(),
        date_key: dateKey,
        home_team_id: game.teams.home.id,
        away_team_id: game.teams.away.id,
        home_team_name: game.teams.home.name,
        away_team_name: game.teams.away.name,
        home_team_logo: game.teams.home.logo,
        away_team_logo: game.teams.away.logo,
        location_type: isHome ? 'home' : 'away',
        venue: game.arena?.name || null,
        league_id: eurocupLeagueId,
        season: season,
        status: game.status?.long || 'Scheduled',
        home_score: game.scores?.home?.total || null,
        away_score: game.scores?.away?.total || null,
      };

      const { error } = await supabaseAdmin
        .from('international_team_schedules')
        .upsert(gameData, { onConflict: 'team_id,game_id' });

      if (!error) {
        inserted.push(`${dateKey}: ${gameData.away_team_name} @ ${gameData.home_team_name}`);
      }
    }

    return NextResponse.json({
      success: true,
      season,
      totalGames: data.results,
      insertedGames: inserted.length,
      games: inserted,
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

