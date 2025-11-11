import { NextResponse } from 'next/server';
import { loadAllSchedules } from '@/lib/loadSchedules';
import type { GameWithProspects } from '@/app/utils/gameMatching';
import { canonTeam } from '@/app/utils/normalize';

export type GamesByDate = Record<string, GameWithProspects[]>;

// Sort function that matches the client-side sort logic
// This ensures games are pre-sorted ONCE on the server, not on every render
const sortGames = (games: GameWithProspects[]): GameWithProspects[] => {
  return [...games].sort((a, b) => {
    const aTipoffLabel = a.tipoff ? a.tipoff.toUpperCase() : '';
    const bTipoffLabel = b.tipoff ? b.tipoff.toUpperCase() : '';
    const aTbd =
      a.status === 'TIME_TBD' ||
      aTipoffLabel.includes('TBD') ||
      aTipoffLabel.includes('TBA');
    const bTbd =
      b.status === 'TIME_TBD' ||
      bTipoffLabel.includes('TBD') ||
      bTipoffLabel.includes('TBA');

    if (aTbd && bTbd) return 0;
    if (aTbd) return 1;
    if (bTbd) return -1;

    const aSort =
      typeof a.sortTimestamp === 'number'
        ? a.sortTimestamp
        : new Date(a.date).getTime();
    const bSort =
      typeof b.sortTimestamp === 'number'
        ? b.sortTimestamp
        : new Date(b.date).getTime();

    if (aSort === bSort) {
      return (a.tipoff ?? '').localeCompare(b.tipoff ?? '');
    }

    return aSort - bSort;
  });
};

export async function GET(request: Request) {
  console.time('buildData');
  try {
    // Check for force reload parameter
    const { searchParams } = new URL(request.url);
    const forceReload = searchParams.get('reload') === 'true';
    
    const { gamesByDate, allGames } = await loadAllSchedules(forceReload);
    
    // Validation: Check that Tennessee has Nate Ament
    const tenKey = canonTeam('Tennessee');
    const missingAment = allGames.filter(g => {
      const homeKey = canonTeam(g.homeTeam.displayName || g.homeTeam.name || '');
      const awayKey = canonTeam(g.awayTeam.displayName || g.awayTeam.name || '');
      const isTennesseeGame = homeKey === tenKey || awayKey === tenKey;
      if (!isTennesseeGame) return false;
      const hasAment = [...g.homeProspects, ...g.awayProspects].some(p => 
        /nate\s+ament/i.test(p.name)
      );
      return !hasAment;
    });
    
    if (missingAment.length) {
      console.warn('Tennessee missing Nate Ament on:', 
        missingAment.map(g => `${g.awayTeam.displayName} @ ${g.homeTeam.displayName} ${g.dateKey || g.date.substring(0, 10)}`)
      );
    }
    
    // Pre-sort all games by date
    const sortedGamesByDate: GamesByDate = {};
    for (const [dateKey, games] of Object.entries(gamesByDate)) {
      sortedGamesByDate[dateKey] = sortGames(games);
    }
    
    console.timeEnd('buildData');
    
    return NextResponse.json({ games: sortedGamesByDate });
  } catch (error) {
    console.error('Error loading all schedules:', error);
    return NextResponse.json(
      { error: 'Failed to load prospect schedules', games: {} },
      { status: 500 }
    );
  }
}

