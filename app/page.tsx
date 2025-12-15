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
} from './utils/dateKey';

// Helper to sort games by time properly (not alphabetically by tipoff string)
// CRITICAL: Use date field first (it's an ISO timestamp in consistent timezone)
// sortTimestamp is in ET minutes from midnight and tipoff might be in various timezones
const sortGamesByTime = (a: GameWithProspects, b: GameWithProspects): number => {
  // Priority 1: Parse time from date field (ISO format) - most reliable
  // The date field should be in a consistent format across all games
  const aDate = a.date ? new Date(a.date).getTime() : 0;
  const bDate = b.date ? new Date(b.date).getTime() : 0;
  if (aDate !== 0 && bDate !== 0 && aDate !== bDate) {
    return aDate - bDate;
  }
  
  // Priority 2: Use sortTimestamp if both games have it (fallback for games without date)
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

type ViewMode = 'day' | 'team' | 'prospect';

export default function Home() {
  const { isSignedIn } = useUser();
  // Track if we've determined the source from localStorage
  const [sourceReady, setSourceReady] = useState(false);
  const [rankingSource, setRankingSource] = useState<RankingSource>('espn');
  const [mounted, setMounted] = useState(false);
  
  // Read ranking source from localStorage on mount - this determines the actual source
  // CRITICAL: This must complete before useGames starts fetching to avoid double-fetch
  useEffect(() => {
    setMounted(true);
    const useMyBoard = localStorage.getItem('useMyBoard');
    const actualSource = useMyBoard === 'true' ? 'myboard' : 'espn';
    setRankingSource(actualSource);
    setSourceReady(true);
  }, []);

  // Toggle ranking source
  const handleToggleRankingSource = () => {
    const newSource: RankingSource = rankingSource === 'espn' ? 'myboard' : 'espn';
    setRankingSource(newSource);
    localStorage.setItem('useMyBoard', newSource === 'myboard' ? 'true' : 'false');
  };
  
  const { games, loading, error, loadingMessage, updating, fetchGames, refresh, updateProspectRanks } = useGames({ source: rankingSource, ready: sourceReady });
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => toLocalMidnight(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notesPanelGame, setNotesPanelGame] = useState<GameWithProspects | null>(null);
  const [gameStatuses, setGameStatuses] = useState<Map<string, { watched: boolean; hasNote: boolean }>>(new Map());
  const dateRangeRef = useRef<{ start: string; end: string } | null>(null);
  
  // Additional games fetched from database for watchlist players
  const [additionalTeamGames, setAdditionalTeamGames] = useState<Record<string, GameWithProspects[]>>({});
  const fetchedTeamIdsRef = useRef<Set<string>>(new Set());
  
  // Fetched prospect info for the currently viewed prospect (used when prospect isn't in cached games yet)
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
    // Sort each team's list by date/time once (using proper time comparison, not string)
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const aDateKey = a.dateKey || a.date.substring(0, 10);
        const bDateKey = b.dateKey || b.date.substring(0, 10);
        // Sort by date first, then by time within the same date
        const dateComparison = aDateKey.localeCompare(bDateKey);
        if (dateComparison !== 0) return dateComparison;
        return sortGamesByTime(a, b);
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


  // Get watchlist and myBoard prospects from games to build tracked map
  const { watchlistProspects, myBoardProspects } = useMemo(() => {
    const watchlist: Prospect[] = [];
    const myBoard: Prospect[] = [];
    const seen = new Set<string>();

    // Extract prospects from all games
    for (const arr of Object.values(games)) {
      for (const g of arr) {
        // Extract from tracked players (already decorated)
        for (const tracked of [...(g.homeTrackedPlayers || []), ...(g.awayTrackedPlayers || [])]) {
          const key = `${tracked.playerName}|${tracked.team}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const prospect: Prospect = {
            id: tracked.playerId,
            name: tracked.playerName,
            team: tracked.team,
            teamDisplay: tracked.teamDisplay,
            teamId: tracked.teamId,
            rank: tracked.rank,
            isWatchlist: tracked.type === 'watchlist',
          };

          if (tracked.type === 'watchlist') {
            watchlist.push(prospect);
          } else {
            myBoard.push(prospect);
          }
        }

        // Also extract from old system (prospects arrays)
        for (const p of [...(g.prospects || []), ...(g.homeProspects || []), ...(g.awayProspects || [])]) {
          const key = `${p.name}|${p.team || p.teamDisplay || ''}`;
          if (seen.has(key)) continue;
          seen.add(key);

          // Only add if not already in tracked players
          const alreadyTracked = [...(g.homeTrackedPlayers || []), ...(g.awayTrackedPlayers || [])]
            .some(t => t.playerName === p.name && (t.team === p.team || t.team === p.teamDisplay));
          
          if (!alreadyTracked) {
            if (p.isWatchlist) {
              watchlist.push(p);
            } else {
              myBoard.push(p);
            }
          }
        }
      }
    }

    return { watchlistProspects: watchlist, myBoardProspects: myBoard };
  }, [games]);

  // Build tracked map that includes the current prospect if they're on watchlist
  const trackedByPlayerId = useMemo(() => {
    const map: Record<string, TrackedPlayerInfo> = {};

    // Add myBoard prospects
    for (const p of myBoardProspects) {
      if (!p.name) continue;
      const playerId = createCanonicalPlayerId(p.name, p.team, p.teamDisplay);
      map[playerId] = {
        playerId,
        playerName: p.name,
        team: p.team || '',
        teamDisplay: p.teamDisplay,
        teamId: p.teamId,
        type: 'myBoard',
        rank: p.rank,
        isWatchlist: false,
      };
    }

    // Add watchlist prospects (don't override myBoard)
    for (const p of watchlistProspects) {
      if (!p.name) continue;
      const playerId = createCanonicalPlayerId(p.name, p.team, p.teamDisplay);
      const existing = map[playerId];
      if (existing && existing.type === 'myBoard') continue; // Don't override myBoard

      map[playerId] = {
        playerId,
        playerName: p.name,
        team: p.team || '',
        teamDisplay: p.teamDisplay,
        teamId: p.teamId,
        type: 'watchlist',
        isWatchlist: true,
      };
    }

    // Ensure the current prospect is included as watchlist if they're viewing their page
    // This ensures they show up on their own game cards even if not in the tracked map yet
    if (selectedProspect) {
      // Find the prospect in games to get their team info
      let prospectTeam: string | undefined;
      let prospectTeamDisplay: string | undefined;
      let prospectTeamId: string | undefined;

      for (const arr of Object.values(games)) {
        for (const g of arr) {
          // Check tracked players first
          const tracked = [...(g.homeTrackedPlayers || []), ...(g.awayTrackedPlayers || [])]
            .find(p => p.playerName.toLowerCase().trim() === selectedProspect.toLowerCase().trim());
          
          if (tracked) {
            prospectTeam = tracked.team;
            prospectTeamDisplay = tracked.teamDisplay;
            prospectTeamId = tracked.teamId;
            break;
          }

          // Check old system (prospects arrays)
          const prospect = [...(g.prospects || []), ...(g.homeProspects || []), ...(g.awayProspects || [])]
            .find(p => p.name.toLowerCase().trim() === selectedProspect.toLowerCase().trim());
          
          if (prospect) {
            prospectTeam = prospect.team;
            prospectTeamDisplay = prospect.teamDisplay;
            prospectTeamId = prospect.teamId;
            break;
          }

          // Also check team names - if prospect name matches and we can infer team from game
          // This handles cases where prospect is in game but not in prospects arrays
          const normalizedProspectName = selectedProspect.toLowerCase().trim();
          const homeTeamName = (g.homeTeam?.displayName || g.homeTeam?.name || '').toLowerCase();
          const awayTeamName = (g.awayTeam?.displayName || g.awayTeam?.name || '').toLowerCase();
          
          // Check if any tracked player on home/away team matches the prospect name
          const homeTrackedMatch = (g.homeTrackedPlayers || []).find(p => 
            p.playerName.toLowerCase().trim() === normalizedProspectName
          );
          const awayTrackedMatch = (g.awayTrackedPlayers || []).find(p => 
            p.playerName.toLowerCase().trim() === normalizedProspectName
          );
          
          if (homeTrackedMatch) {
            prospectTeam = homeTrackedMatch.team;
            prospectTeamDisplay = homeTrackedMatch.teamDisplay;
            prospectTeamId = homeTrackedMatch.teamId;
            break;
          }
          if (awayTrackedMatch) {
            prospectTeam = awayTrackedMatch.team;
            prospectTeamDisplay = awayTrackedMatch.teamDisplay;
            prospectTeamId = awayTrackedMatch.teamId;
            break;
          }
        }
        if (prospectTeam || prospectTeamDisplay) break;
      }

      // If we found team info, add the prospect to tracked map as watchlist
      // This ensures they show up on their game cards
      if (prospectTeam || prospectTeamDisplay) {
        const playerId = createCanonicalPlayerId(selectedProspect, prospectTeam, prospectTeamDisplay);
        const existing = map[playerId];
        
        // Only add if not already on myBoard (myBoard takes priority)
        if (!existing || existing.type !== 'myBoard') {
          map[playerId] = {
            playerId,
            playerName: selectedProspect,
            team: prospectTeam || '',
            teamDisplay: prospectTeamDisplay,
            teamId: prospectTeamId,
            type: 'watchlist',
            isWatchlist: true,
          };
        }
      }
    }

    return map;
  }, [myBoardProspects, watchlistProspects, selectedProspect, games]);

  // Fetch team games from database when viewing a prospect's matchups
  // This ensures we get ALL games for their team, not just ones with other prospects
  useEffect(() => {
    if (!selectedProspect) return;
    
    // Find the prospect's team ID from trackedByPlayerId
    const prospectInfo = Object.values(trackedByPlayerId).find(p => 
      p.playerName.toLowerCase().trim() === selectedProspect.toLowerCase().trim()
    );
    
    if (!prospectInfo) {
      console.log(`[TeamGames] No prospect info found for "${selectedProspect}"`);
      return;
    }
    
    // Get the team ID - try teamId first, then try to find from espn_team_id in the database
    let teamId = prospectInfo.teamId;
    const teamName = prospectInfo.teamDisplay || prospectInfo.team;
    
    if (!teamId && teamName) {
      // We'll try to look up the team ID from the game data
      // Search through games to find a game with this team and get the team ID
      for (const gamesForDate of Object.values(games)) {
        for (const game of gamesForDate) {
          const homeTeamName = game.homeTeam?.displayName || game.homeTeam?.name || '';
          const awayTeamName = game.awayTeam?.displayName || game.awayTeam?.name || '';
          
          if (homeTeamName.toLowerCase().includes(teamName.toLowerCase()) || 
              teamName.toLowerCase().includes(homeTeamName.toLowerCase())) {
            teamId = game.homeTeam?.id;
            break;
          }
          if (awayTeamName.toLowerCase().includes(teamName.toLowerCase()) || 
              teamName.toLowerCase().includes(awayTeamName.toLowerCase())) {
            teamId = game.awayTeam?.id;
            break;
          }
        }
        if (teamId) break;
      }
    }
    
    if (!teamId) {
      console.log(`[TeamGames] No team ID found for "${selectedProspect}" (team: "${teamName}")`);
      return;
    }
    
    // Don't fetch if we already have games for this team
    if (fetchedTeamIdsRef.current.has(teamId)) {
      console.log(`[TeamGames] Already fetched games for team ${teamId}`);
      return;
    }
    
    console.log(`[TeamGames] Fetching games for team ${teamId} (${teamName}) for prospect "${selectedProspect}"`);
    fetchedTeamIdsRef.current.add(teamId);
    
    // Fetch team games from database
    fetch(`/api/games/team/${teamId}`)
      .then(res => res.json())
      .then(data => {
        if (data.games && data.games.length > 0) {
          console.log(`[TeamGames] Loaded ${data.games.length} games for team ${teamId}`);
          setAdditionalTeamGames(prev => ({
            ...prev,
            [teamId]: data.games,
          }));
        } else {
          console.log(`[TeamGames] No games found in database for team ${teamId}`);
        }
      })
      .catch(err => {
        console.error(`[TeamGames] Error fetching games for team ${teamId}:`, err);
        // Remove from fetched set so we can retry
        fetchedTeamIdsRef.current.delete(teamId);
      });
  }, [selectedProspect, trackedByPlayerId, games]);
  
  // Fetch prospect info directly from API when viewing a prospect page and they're not in games data
  useEffect(() => {
    if (!selectedProspect) {
      setFetchedProspectInfo(null);
      return;
    }
    
    // Check if we already have info from games
    const normalizedName = selectedProspect.toLowerCase().trim();
    const existingInfo = Object.values(trackedByPlayerId).find(p => 
      p.playerName.toLowerCase().trim() === normalizedName
    );
    
    if (existingInfo) {
      setFetchedProspectInfo(null); // Clear - we don't need it
      return;
    }
    
    // Fetch from API
    console.log(`[FetchProspectInfo] Fetching info for "${selectedProspect}" from API`);
    fetch(`/api/prospects/search?q=${encodeURIComponent(selectedProspect)}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.prospects && data.prospects.length > 0) {
          // Find exact name match
          const match = data.prospects.find((p: { name: string }) => 
            p.name.toLowerCase().trim() === normalizedName
          );
          
          if (match) {
            console.log(`[FetchProspectInfo] Found prospect info:`, match);
            const info: TrackedPlayerInfo = {
              playerId: createCanonicalPlayerId(match.name, match.team, match.teamDisplay),
              playerName: match.name,
              team: match.team || '',
              teamDisplay: match.teamDisplay,
              teamId: match.teamId || match.team_id,
              type: 'watchlist',
              isWatchlist: true,
            };
            setFetchedProspectInfo(info);
          } else {
            console.log(`[FetchProspectInfo] No exact match found for "${selectedProspect}" in results`);
          }
        }
      })
      .catch(err => {
        console.error(`[FetchProspectInfo] Error fetching prospect info:`, err);
      });
  }, [selectedProspect, trackedByPlayerId]);

  // Re-decorate ALL games with the tracked players map
  // This ensures newly added watchlist prospects show up on all their games in calendar view
  const decoratedGames = useMemo(() => {
    // School qualifiers that indicate different schools when one name starts with another
    // e.g., "Alabama" vs "Alabama State" are different schools
    const SCHOOL_QUALIFIERS = ['state', 'tech', 'christian', 'a&m', 'southern', 'northern', 'western', 'eastern', 'central'];
    
    // Helper to normalize team names for comparison
    const normalizeTeamName = (name: string) => {
      return (name || '')
        .toLowerCase()
        .trim()
        .replace(/\s+(tigers|bulldogs|bears|lions|wildcats|eagles|hawks|owls|panthers|warriors|knights|pirates|raiders|cougars|hornets|jayhawks|tar heels|blue devils|crimson tide|fighting irish|wolverines|seminoles|golden gophers|cornhuskers|spartans|nittany lions|mountaineers|boilermakers|hoosiers|flyers|explorers|rams|colonials|revolutionaries|ramblers)$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Strict team name matching that prevents "Alabama" from matching "Alabama State"
    const teamsMatch = (team1: string, team2: string): boolean => {
      if (!team1 || !team2) return false;
      if (team1 === team2) return true;
      
      // Check if one starts with the other
      if (team1.startsWith(team2)) {
        const suffix = team1.substring(team2.length).trim();
        // If the suffix starts with a school qualifier, they're different schools
        if (suffix && SCHOOL_QUALIFIERS.some(q => suffix.startsWith(q))) {
          return false;
        }
        // If suffix is empty or just whitespace, exact match
        if (!suffix) return true;
        // Otherwise, substring match might be valid (e.g., "Duke" in "Duke Blue Devils")
        return true;
      }
      
      if (team2.startsWith(team1)) {
        const suffix = team2.substring(team1.length).trim();
        if (suffix && SCHOOL_QUALIFIERS.some(q => suffix.startsWith(q))) {
          return false;
        }
        if (!suffix) return true;
        return true;
      }
      
      return false;
    };

    const result: Record<string, GameWithProspects[]> = {};
    
    for (const [dateKey, gamesForDate] of Object.entries(games)) {
      result[dateKey] = gamesForDate.map(game => {
        // Start with existing tracked players
        const homeTracked = [...(game.homeTrackedPlayers || [])];
        const awayTracked = [...(game.awayTrackedPlayers || [])];
        const existingNames = new Set([
          ...homeTracked.map(p => p.playerName.toLowerCase()),
          ...awayTracked.map(p => p.playerName.toLowerCase()),
        ]);
        
        // Get normalized team names from the game
        const homeTeamName = normalizeTeamName(game.homeTeam?.displayName || game.homeTeam?.name || '');
        const awayTeamName = normalizeTeamName(game.awayTeam?.displayName || game.awayTeam?.name || '');
        
        // Check if any tracked players should be added to this game
        for (const tracked of Object.values(trackedByPlayerId)) {
          if (existingNames.has(tracked.playerName.toLowerCase())) continue;
          
          const trackedTeam = normalizeTeamName(tracked.teamDisplay || tracked.team);
          
          // Skip if tracked player has no team info (can't match)
          if (!trackedTeam) continue;
          
          // Use strict matching that respects school qualifiers
          const isHomeTeam = teamsMatch(trackedTeam, homeTeamName);
          const isAwayTeam = teamsMatch(trackedTeam, awayTeamName);
          
          // Prioritize away team match to avoid false positives
          if (isAwayTeam && !isHomeTeam) {
            awayTracked.push(tracked);
            existingNames.add(tracked.playerName.toLowerCase());
          } else if (isHomeTeam && !isAwayTeam) {
            homeTracked.push(tracked);
            existingNames.add(tracked.playerName.toLowerCase());
          } else if (isHomeTeam && isAwayTeam) {
            // Both match - use exact match to decide
            if (trackedTeam === awayTeamName) {
              awayTracked.push(tracked);
            } else {
              homeTracked.push(tracked);
            }
            existingNames.add(tracked.playerName.toLowerCase());
          }
        }
        
        // Only create a new object if we added new tracked players
        if (homeTracked.length !== (game.homeTrackedPlayers || []).length ||
            awayTracked.length !== (game.awayTrackedPlayers || []).length) {
          return {
            ...game,
            homeTrackedPlayers: homeTracked,
            awayTrackedPlayers: awayTracked,
          };
        }
        
        return game;
      });
    }
    
    return result;
  }, [games, trackedByPlayerId]);

  // Flatten all decorated games from all dates (for SearchBox catalog) - optimized
  // Uses decoratedGames to include newly added watchlist prospects
  const allGames = useMemo(() => {
    const flat: GameWithProspects[] = [];
    const gameLists = Object.values(decoratedGames);
    for (const gamesList of gameLists) {
      flat.push(...gamesList);
    }
    return flat;
  }, [decoratedGames]);

  // Create games by ID map for FriendActivity
  const allGamesById = useMemo(() => {
    const gamesMap: Record<string, GameWithProspects> = {};
    allGames.forEach(game => {
      gamesMap[game.id] = game;
    });
    return gamesMap;
  }, [allGames]);

  const gamesForProspect = useMemo(() => {
    if (!selectedProspect) return [];

    const out: GameWithProspects[] = [];
    // Use a composite key for deduplication (date + sorted team IDs or names)
    const seenGameKeys = new Set<string>();

    // Normalize prospect name for matching (same as trackedPlayers.ts)
    const normalizedSearchName = selectedProspect.toLowerCase().trim();
    
    // Get the current prospect's info from trackedByPlayerId to also match by team
    // Use fetchedProspectInfo as fallback for newly added watchlist players
    const currentProspectInfo = Object.values(trackedByPlayerId).find(p => 
      p.playerName.toLowerCase().trim() === normalizedSearchName
    ) || fetchedProspectInfo;
    
    // Helper to normalize team names (strip mascots, lowercase, remove non-alphanumeric)
    const normalizeTeamForMatch = (name: string) => {
      return (name || '')
        .toLowerCase()
        .trim()
        // Strip common mascots - must be comprehensive to avoid "Iowa Hawkeyes" vs "Iowa State Cyclones" issues
        .replace(/\s+(tigers|bulldogs|bears|lions|wildcats|eagles|hawks|hawkeyes|owls|panthers|warriors|knights|pirates|raiders|cougars|hornets|jayhawks|tar heels|blue devils|crimson tide|fighting irish|wolverines|seminoles|golden gophers|cornhuskers|spartans|monarchs|nittany lions|mountaineers|boilermakers|hoosiers|tribe|flames|wolfpack|gamecocks|bruins|cavaliers|gators|longhorns|sooners|huskies|badgers|buckeyes|razorbacks|hurricanes|yellow jackets|demon deacons|cardinals|sun devils|beavers|ducks|rebels|commodores|golden flashes|cyclones|aggies|red raiders|49ers|miners|49ers|lumberjacks|musketeers|friars|terriers|colonials|rockets|zips|flyers|explorers|redbirds|salukis|shockers|aztecs|toreros|waves|dons|gaels|pilots|coyotes|matadors|gauchos|highlanders|anteaters|tritons|beach|titans|bobcats|thunderbirds|redhawks|bearcats|penguins|vikings|rams|falcons|broncos|owls|49ers|chanticleers|monarchs|flames|hokies|wolfpack|terrapins|blue hens|tribe|spiders|keydets|retrievers|seawolves|great danes|catamounts|black bears|river hawks|huskies|bobcats|blue devils|demon deacons|orange|cardinals|yellow jackets|hokies)$/i, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
    };
    
    // Helper to create a unique game key for deduplication
    const getDedupeKey = (g: GameWithProspects): string => {
      const dateKey = g.dateKey || g.date?.substring(0, 10) || '';
      const homeId = g.homeTeam?.id || '';
      const awayId = g.awayTeam?.id || '';
      const homeName = normalizeTeamForMatch(g.homeTeam?.displayName || g.homeTeam?.name || '');
      const awayName = normalizeTeamForMatch(g.awayTeam?.displayName || g.awayTeam?.name || '');
      
      // Use team IDs if available, otherwise use normalized team names
      if (homeId && awayId) {
        return `${dateKey}|${[homeId, awayId].sort().join('|')}`;
      }
      return `${dateKey}|${[homeName, awayName].sort().join('|')}`;
    };
    
    const prospectTeam = currentProspectInfo 
      ? normalizeTeamForMatch(currentProspectInfo.teamDisplay || currentProspectInfo.team || '')
      : '';
    
    const prospectTeamId = currentProspectInfo?.teamId;
    
    // STRICT team matching to avoid "Alabama" matching "Alabama State"
    // School qualifiers that indicate DIFFERENT schools (not mascots)
    const SCHOOL_QUALIFIERS = ['state', 'tech', 'christian', 'am', 'southern', 'northern', 'eastern', 'western', 'central', 'atlantic', 'pacific', 'international', 'methodist', 'baptist', 'lutheran', 'coastal', 'poly'];
    
    const isTeamMatch = (teamName: string, gameTeamId?: string): boolean => {
      // Priority 1: Match by team ID if available (most reliable)
      if (prospectTeamId && gameTeamId && String(prospectTeamId) === String(gameTeamId)) {
        return true;
      }
      
      const normalized = normalizeTeamForMatch(teamName);
      if (!prospectTeam || prospectTeam.length < 3) return false;
      
      // Priority 2: Exact match after normalization
      if (normalized === prospectTeam) return true;
      
      // Priority 3: Strict substring matching with school qualifier check
      // Only proceed if names are very similar (one contains the other)
      let shorter = '', longer = '';
      if (normalized.startsWith(prospectTeam)) {
        shorter = prospectTeam;
        longer = normalized;
      } else if (prospectTeam.startsWith(normalized)) {
        shorter = normalized;
        longer = prospectTeam;
      } else {
        return false;
      }
      
      // Get the suffix (what's left after removing the shorter name)
      const suffix = longer.substring(shorter.length);
      
      // If suffix is empty, it's a match (one is exactly contained in the other)
      if (suffix.length === 0) return true;
      
      // If suffix starts with a school qualifier, it's a DIFFERENT school
      // e.g., "iowa" vs "iowastate" - suffix is "state" which is a qualifier
      for (const qualifier of SCHOOL_QUALIFIERS) {
        if (suffix.startsWith(qualifier)) {
          return false; // "iowa" should NOT match "iowastate"
        }
      }
      
      // Suffix is likely a mascot remnant - but be conservative
      // Only allow if suffix is very short (probably leftover from incomplete mascot stripping)
      if (suffix.length > 6) {
        return false; // Suffix too long to be just mascot remnant
      }
      
      return true;
    };

    // First, add games from the main games object
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
        
        // ALSO find games by team name for watchlist players (who might not be in tracked arrays yet)
        let hasProspectTeamPlaying = false;
        if (!hasProspectInTracked && !hasProspectInOldSystem && (prospectTeam || prospectTeamId)) {
          const homeTeam = g.homeTeam?.displayName || g.homeTeam?.name || '';
          const awayTeam = g.awayTeam?.displayName || g.awayTeam?.name || '';
          const homeTeamId = g.homeTeam?.id;
          const awayTeamId = g.awayTeam?.id;
          hasProspectTeamPlaying = isTeamMatch(homeTeam, homeTeamId) || isTeamMatch(awayTeam, awayTeamId);
        }
        
        const dedupeKey = getDedupeKey(g);
        if ((hasProspectInTracked || hasProspectInOldSystem || hasProspectTeamPlaying) && !seenGameKeys.has(dedupeKey)) {
          seenGameKeys.add(dedupeKey);
          out.push(g);
        }
      }
    }
    
    // ALSO add games from additionalTeamGames (fetched from database)
    // This ensures we get ALL games for the prospect's team, not just ones with other prospects
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
      const aDateKey = a.dateKey || a.date.substring(0, 10);
      const bDateKey = b.dateKey || b.date.substring(0, 10);
      // Sort by date first, then by time within the same date (using proper time comparison)
      const dateComparison = aDateKey.localeCompare(bDateKey);
      if (dateComparison !== 0) return dateComparison;
      return sortGamesByTime(a, b);
    });

    // Re-decorate games with tracked map that includes current prospect
    const decoratedGames = decorateGamesWithTrackedPlayers(out, trackedByPlayerId);
    
    // currentProspectInfo is already defined above
    
    // Merge decorated properties back into games, and ensure current prospect is added
    return out.map((game, idx) => {
      const baseHomeTracked = decoratedGames[idx]?.homeTrackedPlayers || game.homeTrackedPlayers || [];
      const baseAwayTracked = decoratedGames[idx]?.awayTrackedPlayers || game.awayTrackedPlayers || [];
      
      // Check if current prospect is already in tracked arrays
      const prospectName = selectedProspect?.toLowerCase().trim() || '';
      const alreadyInHome = baseHomeTracked.some(p => p.playerName.toLowerCase().trim() === prospectName);
      const alreadyInAway = baseAwayTracked.some(p => p.playerName.toLowerCase().trim() === prospectName);
      
      // If current prospect is not in tracked arrays, add them based on team match
      if (currentProspectInfo && !alreadyInHome && !alreadyInAway) {
        const prospectTeamNorm = normalizeTeamForMatch(currentProspectInfo.teamDisplay || currentProspectInfo.team || '');
        const homeTeamName = normalizeTeamForMatch(game.homeTeam?.displayName || game.homeTeam?.name || '');
        const awayTeamName = normalizeTeamForMatch(game.awayTeam?.displayName || game.awayTeam?.name || '');
        
        // Skip if prospect has no team info (can't match)
        if (!prospectTeamNorm || prospectTeamNorm.length < 4) {
          return {
            ...game,
            homeTrackedPlayers: baseHomeTracked,
            awayTrackedPlayers: baseAwayTracked,
          };
        }
        
        // Match by team name (handles "Jackson State" vs "Jackson State Tigers")
        const isHomeTeam = prospectTeamNorm === homeTeamName || 
                          (prospectTeamNorm.length >= 5 && homeTeamName.includes(prospectTeamNorm)) || 
                          (homeTeamName.length >= 5 && prospectTeamNorm.includes(homeTeamName));
        const isAwayTeam = prospectTeamNorm === awayTeamName || 
                          (prospectTeamNorm.length >= 5 && awayTeamName.includes(prospectTeamNorm)) || 
                          (awayTeamName.length >= 5 && prospectTeamNorm.includes(awayTeamName));
        
        // Prioritize exact matches and away team to avoid false positives
        if (isAwayTeam && !isHomeTeam) {
          return {
            ...game,
            homeTrackedPlayers: baseHomeTracked,
            awayTrackedPlayers: [...baseAwayTracked, currentProspectInfo],
          };
        } else if (isHomeTeam && !isAwayTeam) {
          return {
            ...game,
            homeTrackedPlayers: [...baseHomeTracked, currentProspectInfo],
            awayTrackedPlayers: baseAwayTracked,
          };
        } else if (isHomeTeam && isAwayTeam) {
          // Both match - use exact match
          if (prospectTeamNorm === awayTeamName) {
            return {
              ...game,
              homeTrackedPlayers: baseHomeTracked,
              awayTrackedPlayers: [...baseAwayTracked, currentProspectInfo],
            };
          } else {
            return {
              ...game,
              homeTrackedPlayers: [...baseHomeTracked, currentProspectInfo],
              awayTrackedPlayers: baseAwayTracked,
            };
          }
        }
      }
      
      return {
        ...game,
        homeTrackedPlayers: baseHomeTracked,
        awayTrackedPlayers: baseAwayTracked,
      };
    });
  }, [selectedProspect, games, trackedByPlayerId, additionalTeamGames, fetchedProspectInfo]);

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
                  games={decoratedGames} 
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
                        // Sort each date's games by time (using proper time comparison, not string)
                        for (const k in grouped) {
                          grouped[k].sort(sortGamesByTime);
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
