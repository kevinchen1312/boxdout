// Search function (deterministic, fast)

import { TeamItem, canonFromInput, norm } from './teams';
import { scoreTeam } from './score';
import { levenshtein } from './fuzzy';

export function runTeamSearch(q: string, catalog: TeamItem[]) {
  const query = q.trim();
  if (!query) return [];

  // Primary: scored matches
  const scored = catalog
    .map((t) => ({ t, s: scoreTeam(query, t.label, t.canon) }))
    .filter((x) => x.s[1] || x.s[2] || x.s[3] || x.s[4]) // any of exact/starts/whole/substring
    .sort((a, b) => {
      for (let i = 0; i < a.s.length; i++) {
        const d = b.s[i] - a.s[i];
        if (d) return d;
      }
      return a.t.label.localeCompare(b.t.label);
    });

  if (scored.length) return scored.slice(0, 20).map((x) => x.t);

  // Fallback: fuzzy (small edit distance)
  const qn = norm(query);
  const withDist = catalog
    .map((t) => ({ t, d: levenshtein(qn, t.label) }))
    .filter((x) => x.d <= Math.max(1, Math.floor(qn.length * 0.25))) // allow ~25% edits
    .sort((a, b) => a.d - b.d)
    .slice(0, 10)
    .map((x) => x.t);

  // Last resort: alias resolution direct hit
  const resolvedCanon = canonFromInput(query);
  const aliasHit = catalog.find((t) => t.canon === resolvedCanon);
  return aliasHit ? [aliasHit, ...withDist] : withDist;
}

