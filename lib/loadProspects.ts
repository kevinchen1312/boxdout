import fs from 'fs';
import path from 'path';
import type { Prospect } from '@/app/types/prospect';

let cachedProspects: Prospect[] | null = null;

const BIG_BOARD_PATH = 'top_100_espn_2026_big_board.txt';

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

export const loadProspects = (): Prospect[] => {
  if (cachedProspects) {
    return cachedProspects;
  }

  const filePath = path.join(process.cwd(), BIG_BOARD_PATH);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Big board file not found at ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const prospects: Prospect[] = [];

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
    };

    prospects.push(prospect);
  }

  cachedProspects = prospects;
  return cachedProspects;
};

export const getProspectsByRank = (): Map<number, Prospect> => {
  const prospects = loadProspects();
  return new Map<number, Prospect>(prospects.map((prospect) => [prospect.rank, prospect]));
};

