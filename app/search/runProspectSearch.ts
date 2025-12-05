// Prospect search function

import { norm } from './teams';

const words = (s: string) => norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);

function scoreProspect(qRaw: string, label: string): readonly number[] {
  const q = norm(qRaw);
  const L = norm(label);
  const w = words(label);

  const exact = Number(L === q);
  const starts = Number(L.startsWith(q));
  const wholeWord = Number(w.includes(q));
  const substr = L.includes(q) ? 1 : 0;
  const lenPenalty = -Math.abs(L.length - q.length);

  return [exact, starts, wholeWord, substr, lenPenalty] as const;
}

export function runProspectSearch(q: string, prospectNames: string[]) {
  const query = q.trim();
  if (!query) return [];

  const scored = prospectNames
    .map((name) => ({ name, s: scoreProspect(query, name) }))
    .filter((x) => x.s[0] || x.s[1] || x.s[2] || x.s[3]) // any match
    .sort((a, b) => {
      for (let i = 0; i < a.s.length; i++) {
        const d = b.s[i] - a.s[i];
        if (d) return d;
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, 20)
    .map((x) => x.name);

  return scored;
}






