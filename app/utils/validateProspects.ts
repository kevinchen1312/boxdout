// Validation: catch any mismatch across the dataset

import type { Game } from './annotateGames';
import { canonTeam } from './normalize';

export function validateTeamCoverage(games: Game[], teamLabel: string, expectedNames: string[]) {
  const key = canonTeam(teamLabel);
  const issues: string[] = [];
  for (const g of games) {
    if (g.homeKey !== key && g.awayKey !== key) continue;
    const names = new Set([...g.prospectsHome, ...g.prospectsAway].map(p => p.name));
    for (const need of expectedNames) {
      if (!names.has(need)) {
        issues.push(`${teamLabel} missing ${need} on ${g.away} @ ${g.home} (${g.dateKeyET})`);
      }
    }
  }
  return issues;
}

// Global audit: ensure every team consistently carries its indexed prospects
export function auditAllTeams(
  games: Game[],
  teamProsIndex: Map<string, Array<{ name: string; team?: string }>>
) {
  const problems: string[] = [];
  for (const [teamKey, plist] of teamProsIndex.entries()) {
    const exp = plist.map((p) => p.name);
    const label = exp.length && plist[0].team ? plist[0].team : teamKey;
    problems.push(...validateTeamCoverage(games, label, exp));
  }
  return problems;
}

