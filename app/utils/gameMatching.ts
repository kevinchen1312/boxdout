import type { Prospect } from '@/app/types/prospect';

export interface TeamInfo {
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
  tipoff?: string;
  tv?: string;
  note?: string;
  highlight?: string;
  dateKey?: string;
  locationType?: 'home' | 'away' | 'neutral';
  sortTimestamp?: number | null;
}

