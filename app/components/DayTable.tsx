'use client';

import React, { memo } from 'react';
import { format } from 'date-fns';
import { localYMD } from '../utils/dateKey';
import type { GameWithProspects } from '../utils/gameMatching';
import GameRow from './GameRow';

interface DayTableProps {
  date: Date;
  games: GameWithProspects[];
}

const DayTable = memo(function DayTable({ date, games }: DayTableProps) {
  const dateKey = localYMD(date);
  const isToday = dateKey === localYMD(new Date());

  return (
    <section className="day">
      <div className="date-header flex items-baseline justify-between text-left">
        <div>
          {format(date, 'EEEE')}
          <br />
          <span className="date-sub">{format(date, 'MMM d')}</span>
        </div>
        {isToday && (
          <div className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-600">
            Today
          </div>
        )}
      </div>

      {games.length > 0 ? (
        <div className="day-table">
          {games.map((game) => (
            <GameRow key={game.id} game={game} />
          ))}
        </div>
      ) : (
        <div className="day-table p-4 text-center text-xs font-medium text-gray-500">
          No tracked games
        </div>
      )}
    </section>
  );
});

export default DayTable;

