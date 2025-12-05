import { NextResponse } from 'next/server';
import { cacheTeamLogo, fetchLogoFromApiBasketball } from '@/lib/teamLogoService';

/**
 * GET /api/admin/fetch-partizan-logos
 * Fetch and cache logos for all Partizan teams
 */
export async function GET() {
  try {
    // Known Partizan team IDs from API-Basketball
    const partizanTeams = [
      { id: 40, name: 'Partizan Mozzart Bet', league: 'EuroLeague' },
      { id: 40, name: 'Partizan Belgrade', league: 'EuroLeague' },
      { id: 123, name: 'Partizan NIS', league: 'Adriatic League' },
      // Add other Partizan variants if known
    ];

    const results = [];

    for (const team of partizanTeams) {
      console.log(`[fetch-partizan-logos] Fetching logo for ${team.name} (ID: ${team.id})...`);
      
      const logoUrl = await fetchLogoFromApiBasketball(team.id);
      
      if (logoUrl) {
        const cached = await cacheTeamLogo(team.id, team.name, logoUrl, 'api-basketball');
        results.push({
          team: team.name,
          id: team.id,
          logoUrl,
          cached,
        });
      } else {
        results.push({
          team: team.name,
          id: team.id,
          error: 'Could not fetch logo',
        });
      }
    }

    // Also try searching for common European teams
    const europeanTeams = [
      { id: 90, name: 'Paris Basketball' },
      { id: 91, name: 'Baskonia' },
      { id: 1334, name: 'Hapoel Tel-Aviv' },
      { id: 2419, name: 'Borac Cacak' },
      { id: 2, name: 'ASVEL' },
      { id: 30, name: 'Monaco' },
      { id: 26, name: 'Olympiacos' },
      { id: 28, name: 'Fenerbahce' },
    ];

    for (const team of europeanTeams) {
      const logoUrl = await fetchLogoFromApiBasketball(team.id);
      
      if (logoUrl) {
        const cached = await cacheTeamLogo(team.id, team.name, logoUrl, 'api-basketball');
        results.push({
          team: team.name,
          id: team.id,
          logoUrl,
          cached,
        });
      }
    }

    return NextResponse.json({
      success: true,
      cached: results.filter(r => r.cached).length,
      failed: results.filter(r => r.error).length,
      results,
    });
  } catch (error) {
    console.error('[fetch-partizan-logos] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}




