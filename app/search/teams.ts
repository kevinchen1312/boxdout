// Canonical set + aliases (once)

import { canonTeam } from '../utils/normalize';

export type TeamItem = { label: string; canon: string };

export const norm = (s: string) =>
  (s || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export const plain = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '');

// High-confidence aliases (canonical team names, not normalized keys)
export const FORCE_CANON: Record<string, string> = {
  [plain('Kansas')]: 'Kansas',
  [plain('KU')]: 'Kansas',
  [plain('Kansas University')]: 'Kansas',
  [plain('University of Kansas')]: 'Kansas',
  [plain('North Carolina')]: 'North Carolina',
  [plain('UNC')]: 'North Carolina',
  [plain('UConn')]: 'Connecticut',
  [plain('Texas A & M')]: 'Texas A&M',
  [plain('Texas A and M')]: 'Texas A&M',
  [plain('Tennessee')]: 'Tennessee',
  [plain('UT Knoxville')]: 'Tennessee',
  [plain('UT')]: 'Tennessee',
  [plain('Kansas State')]: 'Kansas State',
  [plain('KSU')]: 'Kansas State',
  [plain('Ole Miss')]: 'Mississippi',
  [plain('BYU')]: 'Brigham Young',
  [plain('USC')]: 'Southern California',
  [plain('UCLA')]: 'California Los Angeles',
};

// Legacy alias map (kept for backward compatibility)
export const ALIAS: Record<string, string> = {
  [plain('KU')]: plain('Kansas'),
  [plain('Kansas University')]: plain('Kansas'),
  [plain('University of Kansas')]: plain('Kansas'),
  [plain('KSU')]: plain('Kansas State'),
  [plain('UNC')]: plain('North Carolina'),
  [plain('UConn')]: plain('Connecticut'),
  [plain('Ole Miss')]: plain('Mississippi'),
  [plain('Texas A and M')]: plain('Texas A&M'),
  [plain('Texas A & M')]: plain('Texas A&M'),
  [plain('UT')]: plain('Tennessee'),
  [plain('UT Knoxville')]: plain('Tennessee'),
  [plain('Tennessee Volunteers')]: plain('Tennessee'),
  [plain('BYU')]: plain('Brigham Young'),
  [plain('USC')]: plain('Southern California'),
  [plain('UCLA')]: plain('California Los Angeles'),
};

export const canonFromInput = (input: string) => ALIAS[plain(input)] ?? plain(input);

/** Build canonical team list from ALL annotated games (not just current week). */
export function buildTeamCatalog(
  allGames: Array<{
    homeTeam: { displayName?: string; name?: string };
    awayTeam: { displayName?: string; name?: string };
  }>
): TeamItem[] {
  const map = new Map<string, string>(); // canon -> best label

  for (const g of allGames) {
    const home = g.homeTeam.displayName || g.homeTeam.name || '';
    const away = g.awayTeam.displayName || g.awayTeam.name || '';
    const homeKey = canonTeam(home);
    const awayKey = canonTeam(away);

    if (!map.has(homeKey)) map.set(homeKey, home);
    if (!map.has(awayKey)) map.set(awayKey, away);
  }

  // Return unique list
  return [...map.entries()].map(([canon, label]) => ({ canon, label }));
}

