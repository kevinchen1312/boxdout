// search/resolve.ts

import { TeamItem, tokenize, plain } from './tokens';
import { ALIAS } from './alias';

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

export function resolveTeams(query: string, catalog: TeamItem[]): TeamItem[] {
  const q = query.trim();
  if (!q) return [];

  // Alias shortcut (e.g., "KU", "Kansas University")
  const aliasKey = plain(q);
  const alias = ALIAS[aliasKey];
  
  if (alias) {
    const targetTokens = tokenize(alias);
    // For aliases, find teams that contain all the target tokens (subset match)
    const aliasMatches = catalog.filter(t => {
      if (!includesAll(t.tokens, targetTokens)) return false;
      
      // CRITICAL: Exclude Arkansas teams when searching for Kansas (prevent substring match)
      if (targetTokens.includes('kansas') && t.tokens.includes('arkansas')) {
        return false;
      }
      
      return true;
    });
    
    if (aliasMatches.length > 0) {
      // Sort: exact token matches first, then by token length difference, then alpha
      return aliasMatches.sort((a, b) => {
        const aExact = a.tokens.length === targetTokens.length;
        const bExact = b.tokens.length === targetTokens.length;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        const d = Math.abs(a.tokens.length - targetTokens.length) - Math.abs(b.tokens.length - targetTokens.length);
        if (d !== 0) return d;
        return a.label.localeCompare(b.label);
      });
    }
    return [];
  }

  // Token subset match (with prefix matching for partial tokens)
  const qt = tokenize(q);
  if (!qt.length) return [];

  const matches = catalog.filter(t => {
    // Try exact token match first
    const exactMatch = includesAll(t.tokens, qt);
    // If no exact match, try prefix matching (e.g., "kans" matches "kansas")
    const prefixMatch = !exactMatch && includesPrefix(t.tokens, qt);
    
    if (!exactMatch && !prefixMatch) return false;
    
    // CRITICAL: Exclude Arkansas teams when searching for "kansas" (prevent substring match)
    if ((qt.includes('kansas') || qt.some(t => t.startsWith('kans'))) && t.tokens.includes('arkansas')) {
      return false;
    }
    
    return true;
  });

  // Sort: exact token matches first, then prefix matches, then by token length difference, then alpha
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
    
    // Then by token length difference
    const d = Math.abs(a.tokens.length - qt.length) - Math.abs(b.tokens.length - qt.length);
    if (d !== 0) return d;
    
    // Finally alpha
    return a.label.localeCompare(b.label);
  });
}

