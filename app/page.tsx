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

  // Toggle ranking source
  const handleToggleRankingSource = () => {
    const newSource: RankingSource = rankingSource === 'espn' ? 'myboard' : 'espn';
    setRankingSource(newSource);
    localStorage.setItem('useMyBoard', newSource === 'myboard' ? 'true' : 'false');
  };
  
  const { games, loading, error, loadingMessage, updating, fetchGames, refresh, updateProspectRanks } = useGames({ source: rankingSource });
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => toLocalMidnight(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notesPanelGame, setNotesPanelGame] = useState<GameWithProspects | null>(null);
  const [gameStatuses, setGameStatuses] = useState<Map<string, { watched: boolean; hasNote: boolean }>>(new Map());
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

  // Create games by ID map for FriendActivity
  const allGamesById = useMemo(() => {
    const gamesMap: Record<string, GameWithProspects> = {};
    allGames.forEach(game => {
      gamesMap[game.id] = game;
    });
    return gamesMap;
  }, [allGames]);


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

  // Listen for rankings updates and update ranks INSTANTLY using provided data
  // Use both localStorage polling (works across routes) and event listener (for same-page)
  useEffect(() => {
    console.log('[page] Setting up rankingsUpdated listeners, current rankingSource:', rankingSource);
    
    const handleRankingsUpdate = (rankings: Array<{ name: string; team: string; teamDisplay?: string; rank: number; isWatchlist?: boolean }>) => {
      if (rankingSource === 'myboard' && rankings && rankings.length > 0) {
        console.log('[page] ✓ Using provided rankings for INSTANT update, count:', rankings.length);
        const dashDaniels = rankings.find(r => r.name.toLowerCase().includes('dash'));
        if (dashDaniels) {
          console.log('[page] Dash Daniels in rankings:', dashDaniels);
        }
        updateProspectRanks(rankings);
      }
    };
    
    // Event listener for same-page updates
    const handleEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ source: string; rankings?: Array<{ name: string; team: string; teamDisplay?: string; rank: number; isWatchlist?: boolean }> }>;
      console.log('[page] ✓✓✓ Rankings updated event received!');
      if (customEvent.detail?.rankings) {
        handleRankingsUpdate(customEvent.detail.rankings);
      }
    };
    
    window.addEventListener('rankingsUpdated', handleEvent);
    
    // Poll localStorage for cross-route updates (check every 100ms)
    let lastTimestamp = 0;
    const pollInterval = setInterval(() => {
      try {
        const stored = localStorage.getItem('rankingsUpdated');
        if (stored) {
          const data = JSON.parse(stored);
          // Only process if newer than last processed
          if (data.timestamp > lastTimestamp && data.source === 'myboard' && data.rankings) {
            console.log('[page] ✓✓✓ Rankings update found in localStorage!');
            lastTimestamp = data.timestamp;
            handleRankingsUpdate(data.rankings);
          }
        }
      } catch (err) {
        // Ignore localStorage errors
      }
    }, 100); // Check every 100ms for instant updates
    
    console.log('[page] ✓ Event listener and localStorage polling set up');
    
    return () => {
      window.removeEventListener('rankingsUpdated', handleEvent);
      clearInterval(pollInterval);
    };
  }, [updateProspectRanks, rankingSource]);

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

    // Normalize prospect name for matching (same as trackedPlayers.ts)
    const normalizedSearchName = selectedProspect.toLowerCase().trim();

    for (const arr of Object.values(games)) {
      for (const g of arr) {
        // Check tracked players arrays first (new system)
        const hasProspectInTracked = 
          (g.homeTrackedPlayers || []).some((p) => p.playerName.toLowerCase().trim() === normalizedSearchName) ||
          (g.awayTrackedPlayers || []).some((p) => p.playerName.toLowerCase().trim() === normalizedSearchName);
        
        // Fallback to old system if tracked players not available
        const hasProspectInOldSystem = !hasProspectInTracked && (
          (g.prospects || []).some((p) => p.name.toLowerCase().trim() === normalizedSearchName) ||
          (g.homeProspects || []).some((p) => p.name.toLowerCase().trim() === normalizedSearchName) ||
          (g.awayProspects || []).some((p) => p.name.toLowerCase().trim() === normalizedSearchName)
        );
        
        if ((hasProspectInTracked || hasProspectInOldSystem) && !seen.has(g.id)) {
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

  // Fetch game statuses (watched + notes) once when games are loaded and user is signed in
  useEffect(() => {
    if (!isSignedIn || !allGames.length) {
      setGameStatuses(new Map());
      return;
    }

    const gameIds = allGames.map(g => g.id);
    if (gameIds.length === 0) return;

    fetch('/api/games/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameIds }),
    })
      .then(res => {
        if (!res.ok) {
          // If endpoint doesn't exist (404) or other error, return empty data
          console.warn(`Game status endpoint returned ${res.status}, using empty statuses`);
          return { watchedGames: [], notesByGame: {} };
        }
        return res.json();
      })
      .then(data => {
        const watchedSet = new Set((data.watchedGames || []).map((w: { game_id: string }) => w.game_id));
        const statusMap = new Map<string, { watched: boolean; hasNote: boolean }>();
        
        for (const game of allGames) {
          const watched = watchedSet.has(game.id);
          const notes = data.notesByGame?.[game.id] || [];
          const hasNote = notes.some((n: { isOwn: boolean }) => n.isOwn);
          statusMap.set(game.id, { watched, hasNote });
        }
        
        setGameStatuses(statusMap);
      })
      .catch(err => {
        console.error('Error fetching game statuses:', err);
        // Fail gracefully - app still works without statuses
        setGameStatuses(new Map());
      });
  }, [isSignedIn, allGames]);

  // Note: Auto-refresh removed since we load all data at once
  // If refresh is needed, reload the page or implement a manual refresh button

  return (
    <>
    <div className="min-h-screen overflow-x-hidden app-root">
      <div className="container mx-auto px-4 md:px-8 py-4 md:py-6 max-w-[1800px]">
        <header className="mb-4 md:mb-6">
          {/* Top row: Title and controls */}
          <div className="planner-header">
            <h1 className="page-title text-2xl md:text-3xl">
              Prospect Game Planner
            </h1>
            <nav className="planner-nav">
              {/* Toggle ranking source */}
              <button
                onClick={handleToggleRankingSource}
                className={`planner-tab ${rankingSource === 'myboard' ? 'planner-tab--active' : ''}`}
                title={`Currently using ${rankingSource === 'espn' ? 'ESPN Rankings' : 'My Board'}. Click to switch.`}
              >
                {rankingSource === 'espn' ? 'ESPN Rankings' : 'My Board'}
              </button>
              {/* Link to Rankings Editor */}
              <Link
                href="/rankings"
                className="planner-tab"
                title="Edit your custom rankings"
              >
                Edit Rankings
              </Link>
              {/* Profile/Auth Buttons */}
              {isSignedIn ? (
                <>
                  <Link
                    href="/notes"
                    className="planner-tab"
                    title="View your notes"
                  >
                    My Notes
                  </Link>
                  <Link
                    href="/profile"
                    className="planner-tab"
                  >
                    Profile
                  </Link>
                  <UserButton afterSignOutUrl="/" />
                </>
              ) : (
                <>
                  <SignInButton mode="modal">
                    <button className="planner-tab">Sign In</button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="planner-tab planner-tab--active">Sign Up</button>
                  </SignUpButton>
                </>
              )}
            </nav>
          </div>
          
          {/* Second row: View mode controls */}
          <div className="flex items-center gap-3 flex-1 justify-center max-w-2xl">
            {viewMode === 'day' && (
              <>
                <WeekDatePicker selectedDate={selectedDate} onSelectDate={setSelectedDate} />
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
              </>
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

        {/* 3-Column Layout: Friend Activity | Main Content | Notes Panel */}
        <div className="prospect-planner-layout planner-layout">
          {/* Left Sidebar: Friend Activity */}
          {isSignedIn ? (
            <div className="min-w-0 planner-panel">
              <FriendActivity games={allGamesById} />
            </div>
          ) : (
            <div className="min-w-0"></div>
          )}

          {/* Main Content */}
          <div className="min-w-0 overflow-hidden planner-panel">
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
                  gameStatuses={gameStatuses}
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
                    gameStatuses={gameStatuses}
                  />
                </div>
              )}
              {viewMode === 'prospect' && selectedProspect && (
                <div className="w-full max-w-5xl mx-auto">
                  <section>
                    <div className="panel-title date-header" style={{ border: 'none' }}>
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
                              gameStatuses={gameStatuses}
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
          {/* End Main Content */}

          {/* Right Sidebar: Notes Panel */}
          {notesPanelGame ? (
            <div className="notes-panel-wrapper min-w-0 overflow-hidden planner-panel">
              <NotesPanel
                game={notesPanelGame}
                isOpen={true}
                onClose={() => setNotesPanelGame(null)}
                onNoteSaved={() => {
                  // Optionally refresh data or update UI after note is saved
                }}
                sidebarMode={true}
              />
            </div>
          ) : (
            <div className="min-w-0"></div>
          )}
        </div>
        {/* End 3-Column Layout */}

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
    </>
  );
}
