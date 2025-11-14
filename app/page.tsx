'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs';
import Calendar from './components/Calendar';
import LoadingSkeleton from './components/LoadingSkeleton';
import DebugPanel from './components/DebugPanel';
import WeekDatePicker from './components/WeekDatePicker';
import SearchOverlay from './components/SearchOverlay';
import SearchBox from './components/SearchBox';
import TeamSchedule from './components/TeamSchedule';
import DayTable from './components/DayTable';
import NotesPanel from './components/NotesPanel';
import FriendActivity from './components/FriendActivity';
import { useGames, type RankingSource } from './hooks/useGames';
import type { GameWithProspects } from './utils/gameMatching';
import { format } from 'date-fns';
import {
  toLocalMidnight,
  startOfWeekLocal,
  addDaysLocal,
  localYMD,
  parseLocalYMD,
} from './utils/dateKey';

type ViewMode = 'day' | 'team' | 'prospect';

export default function Home() {
  const { isSignedIn } = useUser();
  // Initialize ranking source to 'espn' for SSR, update on mount
  const [rankingSource, setRankingSource] = useState<RankingSource>('espn');
  const [mounted, setMounted] = useState(false);
  
  // Load ranking source from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    const useMyBoard = localStorage.getItem('useMyBoard');
    if (useMyBoard === 'true') {
      setRankingSource('myboard');
    }
  }, []);
  
  const { games, loading, error, loadingMessage, fetchGames } = useGames({ source: rankingSource });
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => toLocalMidnight(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notesPanelGame, setNotesPanelGame] = useState<GameWithProspects | null>(null);
  const dateRangeRef = useRef<{ start: string; end: string } | null>(null);

  // Flatten all games from all dates (for SearchBox catalog) - optimized
  const allGames = useMemo(() => {
    const flat: GameWithProspects[] = [];
    const gameLists = Object.values(games);
    // Pre-allocate if we can estimate size
    for (const gamesList of gameLists) {
      flat.push(...gamesList);
    }
    return flat;
  }, [games]);


  // Build team index once
  const teamIndex = useMemo(() => {
    const map = new Map<string, GameWithProspects[]>();
    for (const list of Object.values(games)) {
      for (const g of list) {
        const home = g.homeTeam.displayName || g.homeTeam.name || '';
        const away = g.awayTeam.displayName || g.awayTeam.name || '';
        
        if (home && !map.has(home)) map.set(home, []);
        if (away && !map.has(away)) map.set(away, []);
        
        if (home) map.get(home)!.push(g);
        if (away) map.get(away)!.push(g);
      }
    }
    // Sort each team's list by date/time once
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const aDateKey = a.dateKey || a.date.substring(0, 10);
        const bDateKey = b.dateKey || b.date.substring(0, 10);
        const aTime = a.tipoff || '';
        const bTime = b.tipoff || '';
        return (aDateKey + aTime).localeCompare(bDateKey + bTime);
      });
    }
    return map;
  }, [games]);

  // URL deep linking - hydrate from URL on load (separate from ranking source)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const team = params.get('team');
    const prospect = params.get('prospect');
    
    if (team) {
      setViewMode('team');
      setSelectedTeam(team);
      setSelectedProspect(null);
    } else if (prospect) {
      setViewMode('prospect');
      setSelectedProspect(prospect);
      setSelectedTeam(null);
    }
  }, []);

  // URL deep linking - update URL when view changes (avoid stray "?")
  useEffect(() => {
    const params = new URLSearchParams();
    if (viewMode === 'team' && selectedTeam) {
      params.set('team', selectedTeam);
    } else if (viewMode === 'prospect' && selectedProspect) {
      params.set('prospect', selectedProspect);
    }
    
    const qs = params.toString();
    const clean = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', clean);
  }, [viewMode, selectedTeam, selectedProspect]);

  // Keyboard shortcut: / to open search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !searchOpen) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  // Update ref when dateRange changes
  useEffect(() => {
    dateRangeRef.current = dateRange;
  }, [dateRange]);

  const handleDateChange = useCallback((startDate: string, endDate: string) => {
    setDateRange({ start: startDate, end: endDate });
    fetchGames(startDate, endDate);
  }, [fetchGames]);

  const onSelectGame = useCallback((gameId: string) => {
    // Scroll to the game row
    const el = document.getElementById(`game-${gameId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const onSelectTeam = useCallback((teamName: string) => {
    setSelectedTeam(teamName);
    setSelectedProspect(null);
    setViewMode('team');
  }, []);

  const onSelectProspect = useCallback((prospectName: string) => {
    setSelectedProspect(prospectName);
    setSelectedTeam(null);
    setViewMode('prospect');
  }, []);


  const gamesForProspect = useMemo(() => {
    if (!selectedProspect) return [];

    const out: GameWithProspects[] = [];
    const seen = new Set<string>();

    for (const arr of Object.values(games)) {
      for (const g of arr) {
        if (
          (g.prospects || []).some((p) => p.name === selectedProspect) &&
          !seen.has(g.id)
        ) {
          seen.add(g.id);
          out.push(g);
        }
      }
    }

    out.sort((a, b) => {
      const aDateKey = a.dateKey || a.date.substring(0, 10);
      const bDateKey = b.dateKey || b.date.substring(0, 10);
      const aTime = a.tipoff || '';
      const bTime = b.tipoff || '';
      return (aDateKey + aTime).localeCompare(bDateKey + bTime);
    });

    return out;
  }, [selectedProspect, games]);

  // Initialize date range on mount and when selectedDate changes
  // Note: This is now mainly for backward compatibility since we load all data at once
  useEffect(() => {
    const sow = startOfWeekLocal(selectedDate);
    const start = localYMD(sow);
    const end = localYMD(addDaysLocal(sow, 6));
    handleDateChange(start, end);
  }, [selectedDate, handleDateChange]);

  // Note: Auto-refresh removed since we load all data at once
  // If refresh is needed, reload the page or implement a manual refresh button

  return (
    <>
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 overflow-x-hidden">
      <div className="container mx-auto px-4 md:px-8 lg:px-32 py-4 md:py-6 max-w-7xl">
        <header className="mb-4 md:mb-6">
          {/* Top row: Title and controls */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-3 gap-3">
            <h1 className="text-2xl md:text-4xl font-bold text-gray-900">
              Prospect Game Planner
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Show current ranking source */}
              <span className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg">
                {rankingSource === 'espn' ? 'ESPN Rankings' : 'My Board'}
              </span>
              {/* Link to Rankings Editor */}
              <Link
                href="/rankings"
                className="px-3 py-1.5 text-sm font-medium text-white bg-orange-600 border border-orange-600 rounded-lg hover:bg-orange-700 transition-colors"
                title="Edit your custom rankings"
              >
                Edit Rankings
              </Link>
              {/* Profile/Auth Buttons */}
              {isSignedIn ? (
                <>
                  <Link
                    href="/notes"
                    className="px-3 py-1.5 text-sm font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                    title="View your notes"
                  >
                    My Notes
                  </Link>
                  <Link
                    href="/profile"
                    className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    Profile
                  </Link>
                  <UserButton afterSignOutUrl="/" />
                </>
              ) : (
                <>
                  <SignInButton mode="modal">
                    <button className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                      Sign In
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                      Sign Up
                    </button>
                  </SignUpButton>
                </>
              )}
            </div>
          </div>
          
          {/* Second row: View mode controls */}
          <div className="flex items-center gap-3 flex-1 justify-center max-w-2xl">
            {viewMode === 'day' && (
              <WeekDatePicker selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            )}
            {(viewMode === 'team' || viewMode === 'prospect') && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">
                  {viewMode === 'team' && selectedTeam
                    ? `${selectedTeam} — Full Schedule`
                    : viewMode === 'prospect' && selectedProspect
                    ? `${selectedProspect} — Matchups`
                    : ''}
                </span>
                <button
                  className="border border-neutral-900 bg-white px-2.5 py-1 rounded-md font-semibold hover:bg-neutral-50 transition-colors"
                  onClick={() => {
                    setViewMode('day');
                    setSelectedTeam(null);
                    setSelectedProspect(null);
                  }}
                  aria-label="Back to Day View"
                >
                  Back to Day
                </button>
              </div>
            )}
            <SearchBox
              allGamesFull={allGames}
              onPickTeam={(t) => {
                setSelectedProspect(null);
                setViewMode('team');
                setSelectedTeam(t.label);

                const params = new URLSearchParams();
                params.set('team', t.label);
                window.history.replaceState(null, '', `?${params.toString()}`);
              }}
              onPickProspect={(p) => {
                setSelectedTeam(null);
                setViewMode('prospect');
                setSelectedProspect(p.label);

                const params = new URLSearchParams();
                params.set('prospect', p.label);
                window.history.replaceState(null, '', `?${params.toString()}`);
              }}
            />
          </div>
        </header>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-lg mb-4 shadow-md">
            <div className="flex items-center">
              <span className="text-xl mr-2">⚠️</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Friend Activity Sidebar */}
        {isSignedIn && (
          <div className="mb-6">
            <FriendActivity />
          </div>
        )}

        <div className="bg-white rounded-xl shadow-2xl p-3 md:p-4 lg:p-6">
          {loading && !Object.keys(games).length ? (
            <LoadingSkeleton message={loadingMessage} />
          ) : (
            <>
              {viewMode === 'day' && (
                <Calendar 
                  games={games} 
                  onDateChange={handleDateChange} 
                  selectedDate={selectedDate} 
                  rankingSource={rankingSource}
                  onOpenNotes={setNotesPanelGame}
                />
              )}
              {viewMode === 'team' && selectedTeam && (
                <div className="w-full max-w-5xl mx-auto">
                  <TeamSchedule
                    team={selectedTeam}
                    gamesByDate={games}
                    parseLocalYMD={parseLocalYMD}
                    DayTable={DayTable}
                    rankingSource={rankingSource}
                    onOpenNotes={setNotesPanelGame}
                  />
                </div>
              )}
              {viewMode === 'prospect' && selectedProspect && (
                <div className="w-full max-w-5xl mx-auto">
                  <section>
                    <div className="date-header" style={{ border: 'none' }}>
                      {selectedProspect} — Matchups ({gamesForProspect.length})
                    </div>
                    {gamesForProspect.length > 0 ? (
                      (() => {
                        // Group games by date
                        const grouped: Record<string, GameWithProspects[]> = {};
                        for (const g of gamesForProspect) {
                          const dateKey = g.dateKey || g.date.substring(0, 10);
                          if (!grouped[dateKey]) grouped[dateKey] = [];
                          grouped[dateKey].push(g);
                        }
                        // Sort each date's games by time
                        for (const k in grouped) {
                          grouped[k].sort((a, b) => {
                            const aTime = a.tipoff || '';
                            const bTime = b.tipoff || '';
                            return aTime.localeCompare(bTime);
                          });
                        }
                        return Object.keys(grouped)
                          .sort()
                          .map((dk) => (
                            <DayTable 
                              key={dk} 
                              date={parseLocalYMD(dk)} 
                              games={grouped[dk]} 
                              rankingSource={rankingSource}
                              onOpenNotes={setNotesPanelGame}
                            />
                          ));
                      })()
                    ) : (
                      <div className="text-sm text-neutral-600 px-2 py-3">No games found for {selectedProspect}.</div>
                    )}
                  </section>
                </div>
              )}
              {!loading && Object.keys(games).length === 0 && dateRange && viewMode === 'day' && (
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

        <SearchOverlay
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          gamesByDate={games}
          onGoTeam={(team) => {
            setSelectedProspect(null);
            setSelectedTeam(team);
            setViewMode('team');
          }}
          onGoProspect={(name) => {
            setSelectedTeam(null);
            setSelectedProspect(name);
            setViewMode('prospect');
          }}
        />

      </div>
      
      <DebugPanel 
        games={games} 
        loading={loading} 
        error={error} 
        dateRange={dateRange} 
      />
    </div>

    <NotesPanel
      game={notesPanelGame}
      isOpen={!!notesPanelGame}
      onClose={() => setNotesPanelGame(null)}
      onNoteSaved={() => {
        // Optionally refresh data or update UI after note is saved
      }}
    />
    </>
  );
}
