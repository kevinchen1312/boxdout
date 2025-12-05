'use client';

import React from 'react';
import type { GameWithProspects } from '../utils/gameMatching';
import GameCard from './GameCard';

export type RankingSource = 'espn' | 'myboard';

export default function GameRow({ game, rankingSource = 'espn', onOpenNotes, watched, hasNote }: { game: GameWithProspects; rankingSource?: RankingSource; onOpenNotes?: (game: GameWithProspects) => void; watched?: boolean; hasNote?: boolean }) {
  return <GameCard game={game} rankingSource={rankingSource} onOpenNotes={onOpenNotes} watched={watched} hasNote={hasNote} />;
}
