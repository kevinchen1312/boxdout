import type { Prospect } from '@/app/types/prospect';
import type { TrackedPlayerInfo } from '@/lib/trackedPlayers';

export interface TeamInfo {
  id?: string;        // Canonical team ID (e.g., ESPN team ID)
  name: string;
  displayName: string;
  logo?: string;
  score?: string;
}

export interface Game {
  id: string;
  date: string;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  status: string;
  venue?: string;
}

export interface GameWithProspects extends Game {
  prospects: Prospect[];
  homeProspects: Prospect[];
  awayProspects: Prospect[];
  // Tracked players arrays (decorated from prospects)
  homeTrackedPlayers?: TrackedPlayerInfo[];
  awayTrackedPlayers?: TrackedPlayerInfo[];
  tipoff?: string;
  tv?: string;
  note?: string;
  highlight?: string;
  dateKey?: string;
  locationType?: 'home' | 'away' | 'neutral';
  sortTimestamp?: number | null;
  // Live game status
  clock?: string; // e.g., "9:54"
  period?: number; // e.g., 1, 2
  statusDetail?: string; // e.g., "Halftime", "9:54 - 2nd Half", "End of 1st"
  // ESPN game ID for fetching live details
  espnId?: string;
}

