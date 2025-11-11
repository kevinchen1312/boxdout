// search/prospectCatalog.ts

import { tokenize, plain } from './tokens';
import type { Prospect } from '@/app/types/prospect';

export type ProspectItem = { canon: string; label: string; tokens: string[]; rank?: number };

export function buildProspectCatalog(
  allGames: { prospects: Prospect[]; homeProspects: Prospect[]; awayProspects: Prospect[] }[]
): ProspectItem[] {
  const m = new Map<string, { name: string; rank?: number }>(); // canon -> { name, rank }
  
  for (const g of allGames) {
    // Collect all prospects from the game
    const allProspects = [
      ...(g.prospects || []),
      ...(g.homeProspects || []),
      ...(g.awayProspects || []),
    ];
    
    for (const p of allProspects) {
      const canon = plain(p.name);
      // Keep the highest rank if duplicate names exist
      if (!m.has(canon) || (p.rank && (!m.get(canon)?.rank || p.rank < m.get(canon)!.rank!))) {
        m.set(canon, { name: p.name, rank: p.rank });
      }
    }
  }
  
  return [...m.entries()].map(([canon, { name, rank }]) => ({
    canon,
    label: name,
    tokens: tokenize(name),
    rank,
  }));
}

