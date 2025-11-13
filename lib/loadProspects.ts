import fs from 'fs';
import path from 'path';
import type { Prospect } from '@/app/types/prospect';

export type RankingSource = 'espn' | 'myboard';

let cachedProspectsESPN: Prospect[] | null = null;
let cachedProspectsMyBoard: Prospect[] | null = null;

const RANKING_FILES: Record<RankingSource, string> = {
  espn: 'top_100_espn_2026_big_board.txt',
  myboard: 'my_board_2026.txt',
};

const INTERNATIONAL_MARKERS = ['(', 'Mega Superbet', 'Melbourne United', 'New Zealand Breakers', 'Valencia', 'Paris Basket'];

const classifyProspect = (team: string): string => {
  const lowered = team.toLowerCase();

  if (lowered.includes('g league') || lowered.includes('ignite')) {
    return 'G League';
  }

  const isInternational = INTERNATIONAL_MARKERS.some((marker) =>
    lowered.includes(marker.toLowerCase())
  );

  if (isInternational) {
    return 'International';
  }

  return 'NCAA';
};

const normalizeTeam = (team: string): string => {
  return team.replace(/\s+/g, ' ').trim();
};

export const loadProspects = (source: RankingSource = 'espn'): Prospect[] => {
  const cache = source === 'espn' ? cachedProspectsESPN : cachedProspectsMyBoard;
  
  if (cache) {
    return cache;
  }

  const filePath = path.join(process.cwd(), RANKING_FILES[source]);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Big board file not found at ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const prospects: Prospect[] = [];

  // Load ESPN rankings to get original ESPN rank for each prospect (for schedule matching)
  const espnProspects = source === 'espn' ? null : loadESPNProspectsForMapping();
  const espnNameToRank = new Map<string, number>();
  if (espnProspects) {
    for (const p of espnProspects) {
      espnNameToRank.set(p.name, p.rank);
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(\d+)\.\s+([^–-]+)\s*[-–]\s*([^,]+),\s*(.+)$/);
    if (!match) {
      continue;
    }

    const rank = Number.parseInt(match[1], 10);
    if (Number.isNaN(rank)) continue;

    const name = match[2].trim();
    const position = match[3].trim();
    const teamRaw = match[4].trim();
    const team = normalizeTeam(teamRaw);

    const prospect: Prospect = {
      rank,
      name,
      position,
      team,
      class: classifyProspect(team),
      espnRank: source === 'espn' ? rank : (espnNameToRank.get(name) || rank),
    };

    prospects.push(prospect);
  }

  if (source === 'espn') {
    cachedProspectsESPN = prospects;
  } else {
    cachedProspectsMyBoard = prospects;
  }

  return prospects;
};

// Helper to load ESPN prospects for mapping (without caching to avoid recursion)
function loadESPNProspectsForMapping(): Prospect[] {
  const filePath = path.join(process.cwd(), RANKING_FILES.espn);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const prospects: Prospect[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(\d+)\.\s+([^–-]+)\s*[-–]\s*([^,]+),\s*(.+)$/);
    if (!match) continue;

    const rank = Number.parseInt(match[1], 10);
    if (Number.isNaN(rank)) continue;

    const name = match[2].trim();
    const position = match[3].trim();
    const teamRaw = match[4].trim();
    const team = normalizeTeam(teamRaw);

    prospects.push({
      rank,
      name,
      position,
      team,
      class: classifyProspect(team),
      espnRank: rank,
    });
  }

  return prospects;
}

export const getProspectsByRank = (source: RankingSource = 'espn'): Map<number, Prospect> => {
  const prospects = loadProspects(source);
  // Map by ESPN rank for schedule matching (schedules reference ESPN ranks)
  return new Map<number, Prospect>(prospects.map((prospect) => [prospect.espnRank || prospect.rank, prospect]));
};

export const clearProspectCache = (source?: RankingSource) => {
  if (!source || source === 'espn') {
    cachedProspectsESPN = null;
  }
  if (!source || source === 'myboard') {
    cachedProspectsMyBoard = null;
  }
};

