// search/catalog.ts

import { TeamItem, tokenize } from './tokens';

export function buildTeamCatalog(
  allGames: { home: string; away: string; homeKey: string; awayKey: string }[]
): TeamItem[] {
  const m = new Map<string, string>(); // canon -> label
  for (const g of allGames) {
    if (!m.has(g.homeKey)) m.set(g.homeKey, g.home);
    if (!m.has(g.awayKey)) m.set(g.awayKey, g.away);
  }
  return [...m.entries()].map(([canon, label]) => ({ canon, label, tokens: tokenize(label) }));
}

