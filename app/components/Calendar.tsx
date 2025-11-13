'use client';

import { useEffect, useMemo, memo } from 'react';
import { GameWithProspects } from '../utils/gameMatching';
import {
  toLocalMidnight,
  localYMD,
  startOfWeekLocal,
  addDaysLocal,
} from '../utils/dateKey';
import DayTable, { type RankingSource } from './DayTable';

interface CalendarProps {
  games: Record<string, GameWithProspects[]>;
  onDateChange?: (startDate: string, endDate: string) => void;
  selectedDate?: Date;
  rankingSource?: RankingSource;
}

const Calendar = memo(function Calendar({ games, onDateChange, selectedDate, rankingSource = 'espn' }: CalendarProps) {
  const displayDate = selectedDate ? toLocalMidnight(selectedDate) : toLocalMidnight(new Date());
  const dateKey = localYMD(displayDate);
  
  // Memoize games for selected date - data is already pre-sorted from server
  const gamesForDay = useMemo(
    () => games[dateKey] ?? [],
    [games, dateKey]
  );

  // Update date range when selectedDate changes (for backward compatibility)
  useEffect(() => {
    if (onDateChange && selectedDate) {
      const sow = startOfWeekLocal(selectedDate);
      const start = localYMD(sow);
      const end = localYMD(addDaysLocal(sow, 6));
      onDateChange(start, end);
    }
  }, [selectedDate, onDateChange]);

  return (
    <div className="w-[60vw] mx-auto">
      <DayTable date={displayDate} games={gamesForDay} rankingSource={rankingSource} />
    </div>
  );
});

export default Calendar;
