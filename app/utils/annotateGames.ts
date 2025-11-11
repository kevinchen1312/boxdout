// Annotate every game with side-specific prospects + ET key

import { buildTeamProspectsIndex, type Prospect } from './teamProspects';
import { canonTeam } from './normalize';
import { etYMD } from './dateKeyET';

export type RawGame = {
  id: string;               // stable id
  home: string;             // raw label
  away: string;             // raw label
  tipISO?: string;          // ISO tip datetime if available; otherwise leave undefined
  timeET?: string;          // "7:00 PM ET" (optional)
  network?: string;
};

export type Game = RawGame & {
  dateKeyET: string;               // YYYY-MM-DD (ET)
  homeKey: string;                 // canonical normalized team key
  awayKey: string;
  prospectsHome: Prospect[];
  prospectsAway: Prospect[];
  prospects: Prospect[];           // union, stable order (home first)
};

export function annotateGames(games: RawGame[], allProspects: Prospect[]): Game[] {
  const teamPros = buildTeamProspectsIndex(allProspects);
  return games.map((g) => {
    const homeKey = canonTeam(g.home);
    const awayKey = canonTeam(g.away);

    const prospectsHome = teamPros.get(homeKey) ?? [];
    const prospectsAway = teamPros.get(awayKey) ?? [];

    // Prefer tipISO for perfect day grouping; fallback: build ET day from now with no time (less accurate)
    const dateKeyET = g.tipISO ? etYMD(new Date(g.tipISO)) : etYMD(new Date(parseLocalYMDFallback(g).valueOf()));

    return {
      ...g,
      dateKeyET,
      homeKey,
      awayKey,
      prospectsHome,
      prospectsAway,
      prospects: [...prospectsHome, ...prospectsAway],
    };
  });
}

// If you have only a calendar date string, you can implement a fallback parser here:
function parseLocalYMDFallback(g: RawGame) {
  // Try to extract date from id or use current date as fallback
  // This is a fallback - ideally tipISO should always be provided
  const dateMatch = g.id.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const [y, m, d] = dateMatch[1].split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

