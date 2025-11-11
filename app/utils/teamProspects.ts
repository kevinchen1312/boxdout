// Build a global TEAM → Prospects index (one source of truth)

import { canonTeam } from './normalize';
import type { Prospect as ProspectType } from '@/app/types/prospect';

// Re-export Prospect type for compatibility
export type Prospect = {
  name: string;
  rank?: number;    // ESPN rank int if you have it
  jersey?: string;  // optional
  team: string;     // raw label from your source
};

// Helper to convert ProspectType to our Prospect format
export function toProspect(p: ProspectType): Prospect {
  return {
    name: p.name,
    rank: p.rank,
    jersey: p.jersey,
    team: p.teamDisplay || p.espnTeamName || p.team || '',
  };
}

export function buildTeamProspectsIndex(prospects: Prospect[]) {
  const map = new Map<string, Prospect[]>();
  for (const p of prospects) {
    const key = canonTeam(p.team);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  for (const arr of map.values()) arr.sort((a,b)=>(a.rank ?? 999) - (b.rank ?? 999));
  return map;
}

