'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs';
import Calendar from './Calendar';
import LoadingSkeleton from './LoadingSkeleton';
import DebugPanel from './DebugPanel';
import WeekDatePicker from './WeekDatePicker';
import SearchOverlay from './SearchOverlay';
import SearchBox from './SearchBox';
import TeamSchedule from './TeamSchedule';
import DayTable from './DayTable';
import { useGames, type RankingSource, type GamesByDate } from '../hooks/useGames';
import type { GameWithProspects } from '../utils/gameMatching';
import { format } from 'date-fns';
import { buildTrackedPlayersMap, decorateGamesWithTrackedPlayers } from '@/lib/trackedPlayers';
import { createCanonicalPlayerId } from '@/lib/createCanonicalPlayerId';
import type { TrackedPlayerInfo } from '@/lib/trackedPlayers';
import type { Prospect } from '@/app/types/prospect';
import {
  toLocalMidnight,
  startOfWeekLocal,
  addDaysLocal,
  localYMD,
  parseLocalYMD,
} from '../utils/dateKey';

// Helper to sort games by time properly (not alphabetically by tipoff string)
const sortGamesByTime = (a: GameWithProspects, b: GameWithProspects): number => {
  const aDate = a.date ? new Date(a.date).getTime() : 0;
  const bDate = b.date ? new Date(b.date).getTime() : 0;
  if (aDate !== 0 && bDate !== 0 && aDate !== bDate) {
    return aDate - bDate;
  }
  
  const aSort = typeof (a as { sortTimestamp?: number }).sortTimestamp === 'number' 
    ? (a as { sortTimestamp: number }).sortTimestamp 
    : null;
  const bSort = typeof (b as { sortTimestamp?: number }).sortTimestamp === 'number' 
    ? (b as { sortTimestamp: number }).sortTimestamp 
    : null;
  
  if (aSort !== null && bSort !== null) {
    return aSort - bSort;
  }
  
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

type ViewMode = 'day' | 'team' | 'prospect';

interface HomeClientProps {
  initialGames: GamesByDate;
  initialSource: RankingSource;
}

export default function HomeClient({ initialGames, initialSource }: HomeClientProps) {
  const { isSignedIn } = useUser();
  const [sourceReady, setSourceReady] = useState(true); // Start ready since we have initial data
  const [rankingSource, setRankingSource] = useState<RankingSource>(initialSource);
  const [mounted, setMounted] = useState(false);
  
  // Read ranking source from localStorage on mount
  // For signed-in users, check database for custom rankings (cross-device sync)
  useEffect(() => {
    setMounted(true);
    
    const checkSource = async () => {
      const useMyBoard = localStorage.getItem('useMyBoard');
      let actualSource: RankingSource = useMyBoard === 'true' ? 'myboard' : 'espn';
      
      // For signed-in users, check if they have custom rankings in database
      // This enables cross-device sync - even on a new device with empty localStorage
      if (isSignedIn && actualSource === 'espn') {
        try {
          const response = await fetch('/api/my-rankings/check-custom', { cache: 'no-store' });
          if (response.ok) {
            const data = await response.json();
            if (data.hasCustomRankings) {
              console.log('[HomeClient] User has custom rankings in database, switching to myboard mode');
              actualSource = 'myboard';
              localStorage.setItem('useMyBoard', 'true');
            }
          }
        } catch (err) {
          console.warn('[HomeClient] Failed to check for custom rankings:', err);
        }
      }
      
      // Only update if different from initial (user has custom rankings)
      if (actualSource !== initialSource) {
        setRankingSource(actualSource);
        // This will trigger a refresh for user-specific data
      }
    };
    
    checkSource();
  }, [initialSource, isSignedIn]);

  // Pass initial games to useGames hook
  const { games, loading, error, loadingMessage, updating, fetchGames, refresh, updateProspectRanks } = useGames({ 
    source: rankingSource, 
    ready: sourceReady,
    initialGames: rankingSource === initialSource ? initialGames : undefined, // Use initial games if source matches
  });
  
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => toLocalMidnight(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [gameStatuses, setGameStatuses] = useState<Map<string, { watched: boolean; hasNote: boolean }>>(new Map());
  const dateRangeRef = useRef<{ start: string; end: string } | null>(null);
  const mainContentRef = useRef<HTMLDivElement | null>(null);
  
  // Additional games fetched from database for watchlist players
  const [additionalTeamGames, setAdditionalTeamGames] = useState<Record<string, GameWithProspects[]>>({});
  const fetchedTeamIdsRef = useRef<Set<string>>(new Set());
  
  // Fetched prospect info for the currently viewed prospect
  const [fetchedProspectInfo, setFetchedProspectInfo] = useState<TrackedPlayerInfo | null>(null);

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
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const aDateKey = a.dateKey || a.date.substring(0, 10);
        const bDateKey = b.dateKey || b.date.substring(0, 10);
        const dateComparison = aDateKey.localeCompare(bDateKey);
        if (dateComparison !== 0) return dateComparison;
        return sortGamesByTime(a, b);
      });
    }
    return map;
  }, [games]);

  // Listen for rankings updates
  useEffect(() => {
    console.log('[page] Setting up rankingsUpdated listeners, current rankingSource:', rankingSource);
    
    const handleRankingsUpdate = (rankings: Array<{ name: string; team: string; teamDisplay?: string; rank: number; isWatchlist?: boolean }>) => {
      if (rankingSource === 'myboard' && rankings && rankings.length > 0) {
        console.log('[page] ✓ Using provided rankings for INSTANT update, count:', rankings.length);
        updateProspectRanks(rankings);
      }
    };
    
    const handleEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ source: string; rankings?: Array<{ name: string; team: string; teamDisplay?: string; rank: number; isWatchlist?: boolean }> }>;
      console.log('[page] ✓✓✓ Rankings updated event received!');
      if (customEvent.detail?.rankings) {
        handleRankingsUpdate(customEvent.detail.rankings);
      }
    };
    
    window.addEventListener('rankingsUpdated', handleEvent);
    
    let lastTimestamp = 0;
    const pollInterval = setInterval(() => {
      try {
        const stored = localStorage.getItem('rankingsUpdated');
        if (stored) {
          const data = JSON.parse(stored);
          if (data.timestamp > lastTimestamp && data.source === 'myboard' && data.rankings) {
            console.log('[page] ✓✓✓ Rankings update found in localStorage!');
            lastTimestamp = data.timestamp;
            handleRankingsUpdate(data.rankings);
          }
        }
      } catch (err) {
        // Ignore localStorage errors
      }
    }, 100);
    
    return () => {
      window.removeEventListener('rankingsUpdated', handleEvent);
      clearInterval(pollInterval);
    };
  }, [updateProspectRanks, rankingSource]);

  // URL deep linking
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

  // Build tracked players map
  const trackedByPlayerId = useMemo<Record<string, TrackedPlayerInfo>>(() => {
    const map: Record<string, TrackedPlayerInfo> = {};
    for (const gamesForDate of Object.values(games)) {
      for (const game of gamesForDate) {
        const homeTracked = game.homeTrackedPlayers || [];
        const awayTracked = game.awayTrackedPlayers || [];
        for (const p of [...homeTracked, ...awayTracked]) {
          if (!map[p.playerId]) {
            map[p.playerId] = p;
          }
        }
      }
    }
    return map;
  }, [games]);

  // Build big board and watchlist
  const { bigBoardProspects, watchlistProspects } = useMemo(() => {
    const bigBoard: TrackedPlayerInfo[] = [];
    const watchlist: TrackedPlayerInfo[] = [];
    for (const p of Object.values(trackedByPlayerId)) {
      if (p.type === 'myBoard') {
        bigBoard.push(p);
      } else if (p.type === 'watchlist') {
        watchlist.push(p);
      }
    }
    bigBoard.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    watchlist.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    return { bigBoardProspects: bigBoard, watchlistProspects: watchlist };
  }, [trackedByPlayerId]);

  const allGames = useMemo(() => Object.values(games).flat(), [games]);

  const handleDateChange = useCallback((start: string, end: string) => {
    if (dateRangeRef.current?.start === start && dateRangeRef.current?.end === end) return;
    dateRangeRef.current = { start, end };
    setDateRange({ start, end });
  }, []);

  useEffect(() => {
    const sow = startOfWeekLocal(selectedDate);
    const start = localYMD(sow);
    const end = localYMD(addDaysLocal(sow, 6));
    handleDateChange(start, end);
  }, [selectedDate, handleDateChange]);

  // Fetch game statuses
  useEffect(() => {
    if (!isSignedIn || !allGames.length) {
      setGameStatuses(new Map());
      return;
    }

    const fetchStatuses = async () => {
      try {
        const gameIds = allGames.slice(0, 200).map(g => g.id);
        const response = await fetch('/api/watched/batch-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameIds }),
        });

        if (response.ok) {
          const data = await response.json();
          const statusMap = new Map<string, { watched: boolean; hasNote: boolean }>();
          for (const status of data.statuses || []) {
            statusMap.set(status.gameId, {
              watched: status.watched,
              hasNote: status.hasNote,
            });
          }
          setGameStatuses(statusMap);
        }
      } catch (error) {
        console.error('Error fetching game statuses:', error);
      }
    };

    fetchStatuses();
  }, [isSignedIn, allGames]);

  // Prospect schedule data
  const prospectScheduleData = useMemo(() => {
    if (!selectedProspect) return null;
    
    const prospectInfo = trackedByPlayerId[selectedProspect] || fetchedProspectInfo;
    if (!prospectInfo) return null;

    const getDedupeKey = (g: GameWithProspects) => {
      const date = g.dateKey || g.date?.substring(0, 10) || '';
      const home = (g.homeTeam?.displayName || g.homeTeam?.name || '').toLowerCase().trim();
      const away = (g.awayTeam?.displayName || g.awayTeam?.name || '').toLowerCase().trim();
      const teams = [home, away].sort().join('|');
      return `${date}|${teams}`;
    };
    
    const out: GameWithProspects[] = [];
    const seenGameKeys = new Set<string>();
    const prospectTeamId = prospectInfo.teamId;
    
    for (const gamesForDate of Object.values(games)) {
      for (const g of gamesForDate) {
        const homeTeamId = g.homeTeam?.id;
        const awayTeamId = g.awayTeam?.id;
        const matchesHome = prospectTeamId && homeTeamId && String(homeTeamId) === String(prospectTeamId);
        const matchesAway = prospectTeamId && awayTeamId && String(awayTeamId) === String(prospectTeamId);
        
        if (matchesHome || matchesAway) {
          const dedupeKey = getDedupeKey(g);
          if (!seenGameKeys.has(dedupeKey)) {
            seenGameKeys.add(dedupeKey);
            out.push(g);
          }
        }
      }
    }
    
    if (prospectTeamId && additionalTeamGames[prospectTeamId]) {
      for (const g of additionalTeamGames[prospectTeamId]) {
        const dedupeKey = getDedupeKey(g);
        if (!seenGameKeys.has(dedupeKey)) {
          seenGameKeys.add(dedupeKey);
          out.push(g);
        }
      }
    }
    
    out.sort((a, b) => {
      const aDate = a.dateKey || a.date.substring(0, 10);
      const bDate = b.dateKey || b.date.substring(0, 10);
      return aDate.localeCompare(bDate);
    });
    
    return {
      prospect: prospectInfo,
      games: out.map(g => {
        const homeTeamId = g.homeTeam?.id;
        const awayTeamId = g.awayTeam?.id;
        const isHome = prospectTeamId && homeTeamId && String(homeTeamId) === String(prospectTeamId);
        return {
          ...g,
          locationType: isHome ? 'home' as const : 'away' as const,
        };
      }),
    };
  }, [selectedProspect, games, trackedByPlayerId, additionalTeamGames, fetchedProspectInfo]);

  const handleSelectTeam = useCallback((team: string) => {
    setViewMode('team');
    setSelectedTeam(team);
    setSelectedProspect(null);
    const params = new URLSearchParams(window.location.search);
    params.set('team', team);
    params.delete('prospect');
    window.history.pushState({}, '', `?${params.toString()}`);
  }, []);

  const handleSelectProspect = useCallback((prospectId: string) => {
    setViewMode('prospect');
    setSelectedProspect(prospectId);
    setSelectedTeam(null);
    const params = new URLSearchParams(window.location.search);
    params.set('prospect', prospectId);
    params.delete('team');
    window.history.pushState({}, '', `?${params.toString()}`);
  }, []);

  const handleBackToCalendar = useCallback(() => {
    setViewMode('day');
    setSelectedTeam(null);
    setSelectedProspect(null);
    window.history.pushState({}, '', window.location.pathname);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen]);

  const teamGames = selectedTeam ? teamIndex.get(selectedTeam) || [] : [];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }} ref={mainContentRef}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center justify-between">
            <h1 
              className="text-2xl font-bold text-[var(--text-primary)] cursor-pointer hover:opacity-80 transition-opacity" 
              onClick={handleBackToCalendar}
            >
              boxdout
            </h1>
            {/* Mobile user button */}
            <div className="sm:hidden">
              {isSignedIn ? (
                <UserButton afterSignOutUrl="/" />
              ) : (
                <SignInButton mode="modal">
                  <button className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Sign In
                  </button>
                </SignInButton>
              )}
            </div>
          </div>
          <nav className="flex items-center flex-wrap gap-x-4 gap-y-2 sm:gap-x-6 text-sm sm:text-base">
            <Link href="/rankings" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap">
              My Rankings
            </Link>
            <Link href="/notes" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap">
              My Notes
            </Link>
            <Link href="/network" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap">
              My Network
            </Link>
            {isSignedIn ? (
              <>
                <Link href="/profile" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap">
                  Profile
                </Link>
                <div className="hidden sm:block">
                  <UserButton afterSignOutUrl="/" />
                </div>
              </>
            ) : (
              <div className="hidden sm:flex items-center gap-4">
                <SignInButton mode="modal">
                  <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap">
                    Sign Up
                  </button>
                </SignUpButton>
              </div>
            )}
          </nav>
        </header>

        {/* Date Picker and Search */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <WeekDatePicker 
            selectedDate={selectedDate} 
            onSelectDate={setSelectedDate}
          />
          <SearchBox 
            allGamesFull={allGames}
            onPickTeam={(t) => handleSelectTeam(t.label)}
            onPickProspect={(p) => handleSelectProspect(p.canon)}
          />
        </div>

        {/* Main Content */}
        {error ? (
          <div className="text-red-500 p-4 text-center">
            Error loading schedules: {error}
          </div>
        ) : loading && Object.keys(games).length === 0 ? (
          <LoadingSkeleton message={loadingMessage} />
        ) : viewMode === 'team' && selectedTeam ? (
          <div>
            <button
              onClick={handleBackToCalendar}
              className="mb-4 text-sm text-[var(--accent)] hover:underline"
            >
              ← Back to Calendar
            </button>
            <TeamSchedule
              team={selectedTeam}
              gamesByDate={games}
              parseLocalYMD={parseLocalYMD}
              DayTable={DayTable}
              rankingSource={rankingSource}
              gameStatuses={gameStatuses}
            />
          </div>
        ) : viewMode === 'prospect' && selectedProspect && prospectScheduleData ? (
          <div>
            <button
              onClick={handleBackToCalendar}
              className="mb-4 text-sm text-[var(--accent)] hover:underline"
            >
              ← Back to Calendar
            </button>
            <h2 className="text-xl font-bold mb-4">
              {prospectScheduleData.prospect.playerName} Schedule
            </h2>
            <div className="space-y-4">
              {prospectScheduleData.games.map((game) => (
                <DayTable
                  key={game.id}
                  date={parseLocalYMD(game.dateKey || game.date.substring(0, 10))}
                  games={[game]}
                  rankingSource={rankingSource}
                  gameStatuses={gameStatuses}
                />
              ))}
            </div>
          </div>
        ) : (
          <Calendar
            games={games}
            selectedDate={selectedDate}
            rankingSource={rankingSource}
            gameStatuses={gameStatuses}
          />
        )}

        {/* Search Overlay */}
        {searchOpen && (
          <SearchOverlay
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            gamesByDate={games}
            onGoTeam={handleSelectTeam}
            onGoProspect={handleSelectProspect}
          />
        )}

        {/* Debug Panel */}
        <DebugPanel
          games={games}
          loading={loading}
          error={error}
          dateRange={dateRange}
        />
      </div>
    </div>
  );
}

