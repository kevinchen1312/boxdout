import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAndStoreInternationalProspectGames } from '@/lib/fetchInternationalProspectGames';

/**
 * GET /api/admin/fix-pokusevski-complete
 * Show a simple HTML page with a button to trigger the fix
 */
export async function GET() {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fix Pokusevski Data</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .card {
          background: white;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; margin-top: 0; }
        .info { background: #e3f2fd; padding: 15px; border-radius: 4px; margin: 20px 0; }
        button {
          background: #8b5cf6;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          font-weight: 600;
        }
        button:hover { background: #7c3aed; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        .result { margin-top: 20px; padding: 15px; border-radius: 4px; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        .loading { color: #666; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🔧 Fix Pokusevski Data</h1>
        <div class="info">
          <strong>This will:</strong>
          <ul>
            <li>Delete all NBL games (Brisbane Bullets, Melbourne United, etc.)</li>
            <li>Refetch EuroLeague/Adriatic League games with high-quality logos</li>
            <li>Update the database with team IDs and logo URLs</li>
          </ul>
        </div>
        
        <button onclick="runFix()" id="fixBtn">Run Fix</button>
        
        <div id="result"></div>
      </div>

      <script>
        async function runFix() {
          const btn = document.getElementById('fixBtn');
          const result = document.getElementById('result');
          
          btn.disabled = true;
          result.innerHTML = '<div class="result loading">⏳ Processing... This may take 10-30 seconds...</div>';
          
          try {
            const response = await fetch('/api/admin/fix-pokusevski-complete', {
              method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
              result.innerHTML = \`
                <div class="result success">
                  <strong>✅ Success!</strong>
                  <pre>\${JSON.stringify(data, null, 2)}</pre>
                  <p><strong>Next steps:</strong></p>
                  <ol>
                    <li>Restart your dev server (npm run dev)</li>
                    <li>Hard refresh the page (Ctrl+Shift+R)</li>
                  </ol>
                </div>
              \`;
            } else {
              result.innerHTML = \`
                <div class="result error">
                  <strong>❌ Error</strong>
                  <pre>\${JSON.stringify(data, null, 2)}</pre>
                </div>
              \`;
            }
          } catch (error) {
            result.innerHTML = \`
              <div class="result error">
                <strong>❌ Error</strong>
                <p>\${error.message}</p>
              </div>
            \`;
          } finally {
            btn.disabled = false;
          }
        }
      </script>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

/**
 * POST /api/admin/fix-pokusevski-complete
 * Complete fix for Pokusevski: delete NBL games, refetch with logos
 */
export async function POST() {
  try {
    console.log('=== POKUSEVSKI COMPLETE FIX ===');
    
    // Step 1: Find Pokusevski
    console.log('[1/5] Finding Pokusevski prospect...');
    const { data: prospects, error: prospectError } = await supabaseAdmin
      .from('prospects')
      .select('*')
      .ilike('full_name', '%pokusevski%');

    if (prospectError || !prospects || prospects.length === 0) {
      return NextResponse.json({ error: 'Could not find Pokusevski' }, { status: 404 });
    }

    const results = [];

    for (const prospect of prospects) {
      console.log(`\n[2/5] Processing: ${prospect.full_name} (${prospect.team_name}, ${prospect.league})`);
      
      // Step 2: Get current games
      const { data: games } = await supabaseAdmin
        .from('prospect_games')
        .select('*')
        .eq('prospect_id', prospect.id);

      // Identify NBL games
      const nblGames = (games || []).filter(game => {
        const teams = `${game.home_team} ${game.away_team}`.toLowerCase();
        const nblTeams = ['brisbane', 'bullets', 'melbourne', 'united', 'sydney', 'kings', 
                          'perth', 'wildcats', 'adelaide', '36ers', 'cairns', 'taipans',
                          'illawarra', 'hawks', 'tasmania', 'jackjumpers', 'new zealand', 'breakers',
                          'south east melbourne', 'phoenix'];
        return nblTeams.some(team => teams.includes(team));
      });

      const isEuropeanProspect = (prospect.league || '').toLowerCase().includes('euro') || 
                                  (prospect.league || '').toLowerCase().includes('super league') ||
                                  (prospect.league || '').toLowerCase().includes('adriatic') ||
                                  (prospect.team_name || '').toLowerCase().includes('partizan');

      if (!isEuropeanProspect) {
        results.push({
          prospect: prospect.full_name,
          skipped: true,
          reason: 'Not a European prospect',
        });
        continue;
      }

      // Step 3: Delete ALL existing games (to get fresh data with logos)
      console.log(`[3/5] Deleting all existing games for ${prospect.full_name}...`);
      const { error: deleteError } = await supabaseAdmin
        .from('prospect_games')
        .delete()
        .eq('prospect_id', prospect.id);

      if (deleteError) {
        results.push({
          prospect: prospect.full_name,
          error: `Failed to delete games: ${deleteError.message}`,
        });
        continue;
      }

      console.log(`[4/5] Deleted ${games?.length || 0} games (${nblGames.length} were NBL games)`);

      // Step 4: Refetch games with new schema (includes logos)
      console.log(`[5/5] Refetching games for ${prospect.full_name} from API-Basketball...`);
      const fetchResult = await fetchAndStoreInternationalProspectGames(
        prospect.id,
        prospect.team_name,
        prospect.team_id
      );

      results.push({
        prospect: prospect.full_name,
        team: prospect.team_name,
        deleted: games?.length || 0,
        nblGamesRemoved: nblGames.length,
        refetch: fetchResult.success ? {
          success: true,
          gamesCount: fetchResult.gamesCount,
        } : {
          success: false,
          error: fetchResult.error,
        },
      });

      console.log(`✓ Complete: ${fetchResult.gamesCount} games fetched with logos`);
    }

    return NextResponse.json({
      success: true,
      message: 'Pokusevski data has been cleaned and refreshed',
      results,
    });
  } catch (error) {
    console.error('[fix-pokusevski-complete] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

