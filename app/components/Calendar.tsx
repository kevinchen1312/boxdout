'use client';

import { useEffect } from 'react';
import { format } from 'date-fns';
import { GameWithProspects } from '../utils/gameMatching';
import {
  toLocalMidnight,
  localYMD,
  startOfWeekLocal,
  addDaysLocal,
} from '../utils/dateKey';
import GameCard from './GameCard';

interface CalendarProps {
  games: Record<string, GameWithProspects[]>;
  onDateChange?: (startDate: string, endDate: string) => void;
  selectedDate?: Date;
}

const sortDayGames = (games: GameWithProspects[]) => {
  return [...games].sort((a, b) => {
    const aTipoffLabel = a.tipoff ? a.tipoff.toUpperCase() : '';
    const bTipoffLabel = b.tipoff ? b.tipoff.toUpperCase() : '';
    const aTbd =
      a.status === 'TIME_TBD' ||
      aTipoffLabel.includes('TBD') ||
      aTipoffLabel.includes('TBA');
    const bTbd =
      b.status === 'TIME_TBD' ||
      bTipoffLabel.includes('TBD') ||
      bTipoffLabel.includes('TBA');

    if (aTbd && bTbd) return 0;
    if (aTbd) return 1;
    if (bTbd) return -1;

    const aSort =
      typeof a.sortTimestamp === 'number'
        ? a.sortTimestamp
        : new Date(a.date).getTime();
    const bSort =
      typeof b.sortTimestamp === 'number'
        ? b.sortTimestamp
        : new Date(b.date).getTime();

    if (aSort === bSort) {
      return (a.tipoff ?? '').localeCompare(b.tipoff ?? '');
    }

    return aSort - bSort;
  });
};

export default function Calendar({ games, onDateChange, selectedDate }: CalendarProps) {
  const displayDate = selectedDate ? toLocalMidnight(selectedDate) : toLocalMidnight(new Date());
  const dateKey = localYMD(displayDate);
  const dayGames = sortDayGames(games[dateKey] || []);

  // Update date range when selectedDate changes
  useEffect(() => {
    if (onDateChange && selectedDate) {
      const sow = startOfWeekLocal(selectedDate);
      const start = localYMD(sow);
      const end = localYMD(addDaysLocal(sow, 6));
      onDateChange(start, end);
    }
  }, [selectedDate, onDateChange]);

  const isToday = dateKey === localYMD(new Date());

  return (
    <div className="w-[60vw] mx-auto">
      <section className="day">
        <div className="date-header flex items-baseline justify-between text-left">
          <div>
            {format(displayDate, 'EEEE')}
            <br />
            <span className="date-sub">{format(displayDate, 'MMM d')}</span>
          </div>
          {isToday && (
            <div className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-600">
              Today
            </div>
          )}
        </div>

        {dayGames.length > 0 ? (
          <div className="day-table">
            {dayGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        ) : (
          <div className="day-table p-4 text-center text-xs font-medium text-gray-500">
            No tracked games
          </div>
        )}
      </section>
    </div>
  );
}
