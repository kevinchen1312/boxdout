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
    const eurocupLeagueId = 121;
    const season = '2025';

    // Fetch EuroCup games
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
        message: 'No EuroCup games found',
        apiResults: data.results,
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
      message: `Added ${inserted.length} EuroCup games`,
      games: inserted,
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to add EuroCup games',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function GET() {
  return new NextResponse(`
    <html>
      <body style="font-family: sans-serif; padding: 20px;">
        <h1>Add Besiktas EuroCup Games</h1>
        <button onclick="addGames()" style="padding: 10px 20px; font-size: 16px;">
          Add EuroCup Games
        </button>
        <div id="result" style="margin-top: 20px;"></div>
        <script>
          async function addGames() {
            document.getElementById('result').innerHTML = 'Fetching...';
            const response = await fetch('/api/admin/add-eurocup', {method: 'POST'});
            const data = await response.json();
            document.getElementById('result').innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
          }
        </script>
      </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' },
  });
}




