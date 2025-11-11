// Helper to enhance existing GameWithProspects with ET date keys and normalized team keys
// This bridges the existing system with the new normalization system

import type { GameWithProspects } from './gameMatching';
import { canonTeam } from './normalize';
import { etYMD } from './dateKeyET';

export type EnhancedGame = GameWithProspects & {
  dateKeyET: string;  // ET date key for ESPN day matching
  homeKey: string;    // canonical normalized team key
  awayKey: string;    // canonical normalized team key
};

export function enhanceGameWithETKeys(game: GameWithProspects): EnhancedGame {
  const homeDisplay = game.homeTeam.displayName || game.homeTeam.name || '';
  const awayDisplay = game.awayTeam.displayName || game.awayTeam.name || '';
  
  const homeKey = canonTeam(homeDisplay);
  const awayKey = canonTeam(awayDisplay);
  
  // Convert game date to ET date key
  // If game.date is ISO string, parse it; otherwise use dateKey
  let gameDate: Date;
  if (game.date && game.date.includes('T')) {
    gameDate = new Date(game.date);
  } else {
    const dateKey = game.dateKey || game.date?.substring(0, 10) || '';
    if (dateKey) {
      const [y, m, d] = dateKey.split('-').map(Number);
      gameDate = new Date(y, m - 1, d);
    } else {
      gameDate = new Date();
    }
  }
  
  const dateKeyET = etYMD(gameDate);
  
  return {
    ...game,
    dateKeyET,
    homeKey,
    awayKey,
  };
}

export function enhanceGamesWithETKeys(games: GameWithProspects[]): EnhancedGame[] {
  return games.map(enhanceGameWithETKeys);
}

