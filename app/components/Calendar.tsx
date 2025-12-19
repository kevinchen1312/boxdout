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

// Helper to sort games by time properly (using date field, not tipoff string)
// The date field is an ISO timestamp that can be parsed to get the actual time
const sortGamesByTime = (a: GameWithProspects, b: GameWithProspects): number => {
  // Priority 1: Parse time from date field (ISO format) - most reliable
  const aDate = a.date ? new Date(a.date).getTime() : 0;
  const bDate = b.date ? new Date(b.date).getTime() : 0;
  if (aDate !== 0 && bDate !== 0 && aDate !== bDate) {
    return aDate - bDate;
  }
  
  // Priority 2: Use sortTimestamp if both games have it (fallback)
  const aSort = typeof (a as { sortTimestamp?: number }).sortTimestamp === 'number' 
    ? (a as { sortTimestamp: number }).sortTimestamp 
    : null;
  const bSort = typeof (b as { sortTimestamp?: number }).sortTimestamp === 'number' 
    ? (b as { sortTimestamp: number }).sortTimestamp 
    : null;
  
  if (aSort !== null && bSort !== null) {
    return aSort - bSort;
  }
  
  // Priority 3: Parse tipoff string to get minutes since midnight (last resort)
  const parseTipoffToMinutes = (tipoff: string | undefined): number => {
    if (!tipoff) return Number.MAX_SAFE_INTEGER;
    const match = tipoff.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return Number.MAX_SAFE_INTEGER;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const isPM = match[3].toUpperCase() === 'PM';
    if (isPM && hours !== 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };
  
  return parseTipoffToMinutes(a.tipoff) - parseTipoffToMinutes(b.tipoff);
};

interface CalendarProps {
  games: Record<string, GameWithProspects[]>;
  onDateChange?: (startDate: string, endDate: string) => void;
  selectedDate?: Date;
  rankingSource?: RankingSource;
  gameStatuses?: Map<string, { watched: boolean; hasNote: boolean }>;
}

const Calendar = memo(function Calendar({ games, onDateChange, selectedDate, rankingSource = 'espn', gameStatuses }: CalendarProps) {
  const displayDate = selectedDate ? toLocalMidnight(selectedDate) : toLocalMidnight(new Date());
  const dateKey = localYMD(displayDate);
  
  // Memoize games for selected date - sort by actual date/time (not ET sortTimestamp)
  // This ensures correct ordering when times are displayed in user's local timezone
  const gamesForDay = useMemo(
    () => [...(games[dateKey] ?? [])].sort(sortGamesByTime),
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
    <div className="w-full">
      <DayTable 
        date={displayDate} 
        games={gamesForDay} 
        rankingSource={rankingSource} 
        gameStatuses={gameStatuses}
      />
    </div>
  );
});

export default Calendar;
