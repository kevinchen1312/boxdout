// Grouping for Day View and Team/Prospect View

import type { Game } from './annotateGames';

export const groupByET = (games: Game[]) => {
  const m: Record<string, Game[]> = {};
  for (const g of games) (m[g.dateKeyET] ??= []).push(g);
  for (const k in m) m[k].sort((a,b)=> (a.timeET || '').localeCompare(b.timeET || ''));
  return m;
};

