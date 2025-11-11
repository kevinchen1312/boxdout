// Resolver with word-boundary matching and anti-Arkansas guard

import { norm, plain, TeamItem, FORCE_CANON } from './teams';
import { canonTeam } from '../utils/normalize';

const words = (s: string) => norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);

export function resolveTeam(query: string, catalog: TeamItem[]): TeamItem | null {
  const q = query.trim();
  if (!q) return null;

  const qPlain = plain(q);

  // 0) Force known aliases (kansas, ku, etc.)
  if (qPlain in FORCE_CANON) {
    // Use canonTeam to normalize the canonical team name (consistent with buildTeamCatalog)
    const wantCanon = canonTeam(FORCE_CANON[qPlain]);
    // Find team by matching canonical key (t.canon is already normalized via canonTeam)
    return catalog.find((t) => t.canon === wantCanon) ?? null;
  }

  // 1) exact normalized label match
  const qNorm = norm(q);
  const exact = catalog.find((t) => norm(t.label) === qNorm);
  if (exact) return exact;

  // 2) startsWith match
  const starts = catalog.filter((t) => norm(t.label).startsWith(qNorm));
  if (starts.length) return preferKansasOverArkansas(starts, qNorm);

  // 3) whole-word match
  const whole = catalog.filter((t) => words(t.label).includes(qNorm));
  if (whole.length) return preferKansasOverArkansas(whole, qNorm);

  // 4) substring fallback (guarded so 'kansas' won't pick 'arkansas')
  const sub = catalog.filter((t) => {
    const L = norm(t.label);
    if (qNorm === 'kansas' && /arkansas/.test(L)) return false; // anti-Arkansas
    return L.includes(qNorm);
  });
  if (sub.length) return sub.sort((a, b) => a.label.localeCompare(b.label))[0];

  return null;
}

function preferKansasOverArkansas(list: TeamItem[], qNorm: string): TeamItem {
  // If the query is 'kansas', remove any Arkansas/Central Arkansas from candidates
  if (qNorm === 'kansas') {
    const noArk = list.filter((t) => !/arkansas/i.test(t.label));
    if (noArk.length) return noArk.sort((a, b) => a.label.localeCompare(b.label))[0];
  }
  return list.sort((a, b) => a.label.localeCompare(b.label))[0];
}

