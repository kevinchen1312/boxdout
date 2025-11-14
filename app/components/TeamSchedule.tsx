'use client';

import React, { useMemo } from 'react';
import type { GameWithProspects } from '../utils/gameMatching';
import { parseLocalYMD } from '../utils/dateKey';
import { canonTeam } from '../utils/normalize';
import DayTable from './DayTable';

export type RankingSource = 'espn' | 'myboard';

interface TeamScheduleProps {
  team: string;
  gamesByDate: Record<string, GameWithProspects[]>;
  parseLocalYMD: (s: string) => Date;
  DayTable: React.ComponentType<{ date: Date; games: GameWithProspects[]; rankingSource?: RankingSource; onOpenNotes?: (game: GameWithProspects) => void }>;
  rankingSource?: RankingSource;
  onOpenNotes?: (game: GameWithProspects) => void;
}

export default function TeamSchedule({
  team,
  gamesByDate,
  parseLocalYMD,
  DayTable: DayTableComponent,
  rankingSource = 'espn',
  onOpenNotes,
}: TeamScheduleProps) {
  // Normalize the search team name for matching
  const teamKey = useMemo(() => canonTeam(team), [team]);
  
  const gamesForTeam = useMemo(() => {
    const list: GameWithProspects[] = [];
    for (const arr of Object.values(gamesByDate)) {
      for (const g of arr) {
        const home = g.homeTeam.displayName || g.homeTeam.name || '';
        const away = g.awayTeam.displayName || g.awayTeam.name || '';
        // Use normalized matching for better team name resolution
        const homeKey = canonTeam(home);
        const awayKey = canonTeam(away);
        if (homeKey === teamKey || awayKey === teamKey || home === team || away === team) {
          list.push(g);
        }
      }
    }
    // sort by date + time once
    list.sort((a, b) => {
      const aDateKey = a.dateKey || a.date.substring(0, 10);
      const bDateKey = b.dateKey || b.date.substring(0, 10);
      const aTime = a.tipoff || '';
      const bTime = b.tipoff || '';
      return (aDateKey + aTime).localeCompare(bDateKey + bTime);
    });
    return list;
  }, [gamesByDate, team]);

  const grouped = useMemo(() => {
    const m: Record<string, GameWithProspects[]> = {};
    for (const g of gamesForTeam) {
      const dateKey = g.dateKey || g.date.substring(0, 10);
      if (!m[dateKey]) m[dateKey] = [];
      m[dateKey].push(g);
    }
    // sort each date's games by time (same as day view)
    for (const k in m) {
      m[k].sort((a, b) => {
        const aTime = a.tipoff || '';
        const bTime = b.tipoff || '';
        return aTime.localeCompare(bTime);
      });
    }
    return m;
  }, [gamesForTeam]);

  const keys = Object.keys(grouped).sort();

  return (
    <section className="schedule-section">
      <div className="date-header" style={{ border: 'none' }}>
        {team} — Full Schedule ({gamesForTeam.length})
      </div>
      {keys.length === 0 ? (
        <div className="text-sm text-neutral-600 px-2 py-3">No games found for {team}.</div>
      ) : (
        keys.map((dk) => (
          <DayTableComponent key={dk} date={parseLocalYMD(dk)} games={grouped[dk]} rankingSource={rankingSource} onOpenNotes={onOpenNotes} />
        ))
      )}
    </section>
  );
}

