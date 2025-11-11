// search/resolveProspects.ts

import type { ProspectItem } from './prospectCatalog';
import { tokenize } from './tokens';

const includesAll = (hay: string[], needles: string[]) => {
  const set = new Set(hay);
  return needles.every(t => set.has(t));
};

// Check if any token in hay starts with any token in needles (for prefix matching)
const includesPrefix = (hay: string[], needles: string[]) => {
  return needles.every(needle => 
    hay.some(h => h.startsWith(needle))
  );
};

export function resolveProspects(query: string, catalog: ProspectItem[]): ProspectItem[] {
  const q = query.trim();
  if (!q) return [];

  // Token subset match (with prefix matching for partial tokens)
  const qt = tokenize(q);
  if (!qt.length) return [];

  const matches = catalog.filter(p => {
    // Try exact token match first
    const exactMatch = includesAll(p.tokens, qt);
    // If no exact match, try prefix matching (e.g., "dyb" matches "dybantsa")
    const prefixMatch = !exactMatch && includesPrefix(p.tokens, qt);
    
    return exactMatch || prefixMatch;
  });

  // Sort: exact token matches first, then prefix matches, then by rank (lower is better), then alpha
  return matches.sort((a, b) => {
    // Check if exact match
    const aExact = includesAll(a.tokens, qt);
    const bExact = includesAll(b.tokens, qt);
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    
    // If both exact, prefer same token count
    if (aExact && bExact) {
      const aCountMatch = a.tokens.length === qt.length;
      const bCountMatch = b.tokens.length === qt.length;
      if (aCountMatch && !bCountMatch) return -1;
      if (!aCountMatch && bCountMatch) return 1;
    }
    
    // Then by rank (lower rank = better prospect)
    if (a.rank !== undefined && b.rank !== undefined) {
      const rankDiff = a.rank - b.rank;
      if (rankDiff !== 0) return rankDiff;
    } else if (a.rank !== undefined) return -1;
    else if (b.rank !== undefined) return 1;
    
    // Then by token length difference
    const d = Math.abs(a.tokens.length - qt.length) - Math.abs(b.tokens.length - qt.length);
    if (d !== 0) return d;
    
    // Finally alpha
    return a.label.localeCompare(b.label);
  });
}

