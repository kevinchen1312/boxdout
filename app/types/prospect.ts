export interface Prospect {
  rank: number;
  name: string;
  position: string;
  team: string;
  espnTeamName?: string;
  height?: string;
  class?: string;
  teamDisplay?: string;
  teamId?: string;
  jersey?: string;
  espnRank?: number; // Original ESPN rank for schedule matching
  isWatchlist?: boolean; // True if this is a watchlist/imported player
  injuryStatus?: 'OUT' | 'QUESTIONABLE' | 'DOUBTFUL' | 'PROBABLE'; // Injury status from ESPN API
  source?: 'espn' | 'external' | 'international-roster'; // Source of the prospect data
  id?: string; // Prospect ID from database
}

