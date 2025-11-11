'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Calendar from './components/Calendar';
import LoadingSkeleton from './components/LoadingSkeleton';
import DebugPanel from './components/DebugPanel';
import WeekDatePicker from './components/WeekDatePicker';
import { useGames } from './hooks/useGames';
import {
  toLocalMidnight,
  startOfWeekLocal,
  addDaysLocal,
  localYMD,
} from './utils/dateKey';

export default function Home() {
  const { games, loading, error, fetchGames } = useGames();
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => toLocalMidnight(new Date()));
  const dateRangeRef = useRef<{ start: string; end: string } | null>(null);

  // Update ref when dateRange changes
  useEffect(() => {
    dateRangeRef.current = dateRange;
  }, [dateRange]);

  const handleDateChange = useCallback((startDate: string, endDate: string) => {
    setDateRange({ start: startDate, end: endDate });
    fetchGames(startDate, endDate);
  }, [fetchGames]);

  // Initialize date range on mount and when selectedDate changes
  useEffect(() => {
    const sow = startOfWeekLocal(selectedDate);
    const start = localYMD(sow);
    const end = localYMD(addDaysLocal(sow, 6));
    handleDateChange(start, end);
  }, [selectedDate, handleDateChange]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      if (dateRangeRef.current) {
        console.log('Auto-refreshing game data...');
        fetchGames(dateRangeRef.current.start, dateRangeRef.current.end);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [fetchGames]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 overflow-x-hidden">
      <div className="container mx-auto px-32 py-4 md:py-6 max-w-4xl">
        <header className="flex items-center justify-between mb-4 md:mb-6">
          <h1 className="text-2xl md:text-4xl font-bold text-gray-900">
            Prospect Game Planner
          </h1>
          <WeekDatePicker selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </header>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-lg mb-4 shadow-md">
            <div className="flex items-center">
              <span className="text-xl mr-2">⚠️</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-2xl p-3 md:p-4 lg:p-6">
          {loading && !Object.keys(games).length ? (
            <LoadingSkeleton />
          ) : (
            <>
              <Calendar games={games} onDateChange={handleDateChange} selectedDate={selectedDate} />
              {!loading && Object.keys(games).length === 0 && dateRange && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🏀</div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">
                    No Games Found
                  </h3>
                  <p className="text-gray-600">
                    There are no scheduled games with top prospects for this date.
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Try navigating to a different date when the season is active.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

      </div>
      
      <DebugPanel 
        games={games} 
        loading={loading} 
        error={error} 
        dateRange={dateRange} 
      />
    </div>
  );
}
