'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { clearCacheByKey, getCachedData, setCachedData, getStaleCachedData } from '../utils/browserCache';
import PageLayout from '../components/ui/PageLayout';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { BackToCalendarButton } from '../components/ui/BackToCalendarButton';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import AddCustomPlayerForm from '../components/AddCustomPlayerForm';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface Prospect {
  id: string; // Unified ID - use name for big board, prospects.id for watchlist
  rank?: number;
  watchlistRank?: number;
  name: string;
  position: string;
  team: string;
  teamDisplay?: string;
  class?: string;
  isWatchlist?: boolean;
  // For watchlist players, store original data for API calls
  originalProspectId?: string; // The database prospect_id (for watchlist players)
  source?: string;
  league?: string | null;
}

type ListName = 'bigBoard' | 'watchlist';

interface ImportedProspect {
  id: string;
  rank: number;
  prospect_id: string;
  source: string;
  prospects: {
    id: string;
    full_name: string;
    position: string | null;
    team_name: string | null;
    league: string | null;
    source: string;
  };
}

interface CustomPlayer {
  id: string;
  rank: number;
  name: string;
  position: string;
  team: string;
  height?: string | null;
  class?: string | null;
  jersey?: string | null;
  team_id?: string | null;
}

interface SortableItemProps {
  id: string;
  prospect: Prospect;
  index: number;
  onRemove: (prospect: Prospect) => void;
  onRankChange: (prospectId: string, newRank: number) => void;
  onMoveToWatchlist: (prospectId: string) => void;
  totalCount: number;
  disabled?: boolean;
}

function SortableItem({ id, prospect, index, onRemove, onRankChange, onMoveToWatchlist, totalCount, disabled = false }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const [showMenu, setShowMenu] = useState(false);
  const [rankInput, setRankInput] = useState(String(index + 1));

  // Update input when index changes (from drag or other reordering)
  useEffect(() => {
    setRankInput(String(index + 1));
  }, [index]);

  // Use only translate transform (no scale/rotation) to keep items horizontal during drag
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    touchAction: 'none',
    opacity: isDragging ? 0.5 : 1,
  };

  // Close menu when clicking outside
  useEffect(() => {
    if (showMenu) {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.menu-container')) {
          setShowMenu(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleRankInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRankInput(e.target.value);
  };

  const handleRankInputBlur = () => {
    const newRank = Number.parseInt(rankInput, 10);
    if (!Number.isNaN(newRank) && newRank >= 1 && newRank <= totalCount) {
      onRankChange(prospect.id, newRank);
    } else {
      // Reset to current rank if invalid
      setRankInput(String(index + 1));
    }
  };

  const handleRankInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rankings-row"
    >
      <div
        {...attributes}
        {...listeners}
        className="drag-handle"
        style={{ touchAction: 'none', color: 'var(--text-secondary)', cursor: 'grab' }}
        title="Drag to reorder"
      >
        <svg 
          width="20" 
          height="20" 
          viewBox="0 0 20 20" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            d="M3 5h14M3 10h14M3 15h14" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="rank-container">
        <input
          type="number"
          min={1}
          max={totalCount}
          value={rankInput}
          onChange={handleRankInputChange}
          onBlur={handleRankInputBlur}
          onKeyDown={handleRankInputKeyDown}
          disabled={disabled}
          className="rank-input"
          style={{
            fontSize: '18px',
            fontWeight: 'bold',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            backgroundColor: disabled ? 'var(--bg-secondary)' : 'var(--bg-card)',
            color: 'var(--text-primary)',
          }}
          title="Change rank"
        />
      </div>
      <div className="player-info">
        <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{prospect.name}</div>
        <div className="player-sub text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
          {prospect.position} • {prospect.team}
        </div>
      </div>
      <div className="flex-shrink-0 relative menu-container">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="flex items-center justify-center w-8 h-8"
          style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          title="More options"
        >
          <svg 
            width="20" 
            height="20" 
            viewBox="0 0 20 20" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="10" cy="5" r="1.5" fill="currentColor" />
            <circle cx="10" cy="10" r="1.5" fill="currentColor" />
            <circle cx="10" cy="15" r="1.5" fill="currentColor" />
          </svg>
        </button>
        {showMenu && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: '4px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              zIndex: 1000,
              minWidth: '120px',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveToWatchlist(id);
                setShowMenu(false);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                fontSize: '14px',
                color: 'var(--text-primary)',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(138, 43, 226, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Move to Watchlist
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(prospect);
                setShowMenu(false);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                fontSize: '14px',
                color: '#ef4444',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface BigBoardDropZoneProps {
  children: React.ReactNode;
}

function BigBoardDropZone({ children }: BigBoardDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'big-board-drop',
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: '200px',
        border: isOver ? '2px dashed var(--accent)' : 'none',
        borderRadius: '8px',
        padding: isOver ? '8px' : '0',
        backgroundColor: isOver ? 'rgba(138, 43, 226, 0.05)' : 'transparent',
        transition: 'all 0.2s',
      }}
    >
      {children}
    </div>
  );
}

interface WatchlistDropZoneProps {
  children: React.ReactNode;
}

function WatchlistDropZone({ children }: WatchlistDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'watchlist-drop',
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: '100px',
        border: isOver ? '2px dashed var(--accent)' : 'none',
        borderRadius: '8px',
        padding: isOver ? '8px' : '0',
        backgroundColor: isOver ? 'rgba(138, 43, 226, 0.05)' : 'transparent',
        transition: 'all 0.2s',
      }}
    >
      {children}
    </div>
  );
}

type Destination = 'watchlist' | 'bigBoard';

interface WatchlistItemProps {
  prospect: ImportedProspect;
  index: number;
  onRemove: (prospectId: string) => void;
  onWatchlistAction: (prospectId: string, destination: Destination, targetRank: number) => void;
  watchlistCount: number;
  bigBoardCount: number;
  disabled?: boolean;
}

function WatchlistItem({ prospect, index, onRemove, onWatchlistAction, watchlistCount, bigBoardCount, disabled = false }: WatchlistItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `watchlist-${prospect.prospects.id}`,
    data: {
      type: 'watchlist',
      prospect: {
        name: prospect.prospects.full_name,
        position: prospect.prospects.position || '',
        team: prospect.prospects.team_name || '',
      },
      prospectId: prospect.prospects.id,
    },
  });

  const [rankInput, setRankInput] = useState<string>(String(index + 1));
  const [showMenu, setShowMenu] = useState(false);

  // Update input when index changes
  useEffect(() => {
    setRankInput(String(index + 1));
  }, [index]);

  // Use only translate transform (no scale/rotation) to keep items horizontal during drag
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    touchAction: 'none',
    opacity: isDragging ? 0.5 : 1,
  };

  // Close menu when clicking outside
  useEffect(() => {
    if (showMenu) {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.watchlist-menu-container')) {
          setShowMenu(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleRankInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow any input (including empty) for better UX when typing
    setRankInput(e.target.value);
  };

  const handleRankInputBlur = () => {
    const parsedRank = Number.parseInt(rankInput, 10);
    const clampedRank = Number.isNaN(parsedRank) 
      ? index + 1 
      : Math.min(Math.max(parsedRank, 1), watchlistCount);
    
    setRankInput(String(clampedRank));
    
    // Reorder within watchlist
    onWatchlistAction(prospect.prospects.id, 'watchlist', clampedRank);
  };

  const handleRankInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const moveToBigBoard = () => {
    const parsedRank = Number.parseInt(rankInput, 10);
    const targetRank = Number.isNaN(parsedRank) ? bigBoardCount + 1 : parsedRank;
    onWatchlistAction(prospect.prospects.id, 'bigBoard', targetRank);
    setShowMenu(false);
  };

  return (
    <li 
      ref={setNodeRef}
      style={style}
      className="rankings-row"
    >
      <div
        {...attributes}
        {...listeners}
        className="drag-handle"
        style={{ touchAction: 'none', color: 'var(--text-secondary)', cursor: 'grab' }}
        title="Drag to big board"
      >
        <svg 
          width="20" 
          height="20" 
          viewBox="0 0 20 20" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            d="M3 5h14M3 10h14M3 15h14" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="rank-container">
        <input
          type="number"
          min={1}
          max={watchlistCount}
          value={rankInput}
          onChange={handleRankInputChange}
          onBlur={handleRankInputBlur}
          onKeyDown={handleRankInputKeyDown}
          disabled={disabled}
          className="rank-input"
          style={{
            fontSize: '18px',
            fontWeight: 'bold',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            backgroundColor: disabled ? 'var(--bg-secondary)' : 'var(--bg-card)',
            color: 'var(--text-primary)',
          }}
          title="Rank (for reordering watchlist or target rank when moving to big board)"
        />
      </div>
      <div className="player-info">
        <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {prospect.prospects.full_name}
        </div>
        <div className="player-sub text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
          {[
            prospect.prospects.position,
            prospect.prospects.team_name,
            prospect.prospects.league
          ].filter(Boolean).join(' • ')}
        </div>
      </div>
      <div className="flex-shrink-0 relative watchlist-menu-container">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="flex items-center justify-center w-8 h-8"
          style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          title="More options"
          disabled={disabled}
        >
          <svg 
            width="20" 
            height="20" 
            viewBox="0 0 20 20" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="10" cy="5" r="1.5" fill="currentColor" />
            <circle cx="10" cy="10" r="1.5" fill="currentColor" />
            <circle cx="10" cy="15" r="1.5" fill="currentColor" />
          </svg>
        </button>
        {showMenu && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: '4px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              zIndex: 1000,
              minWidth: '160px',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveToBigBoard();
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                fontSize: '14px',
                color: 'var(--text-primary)',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(138, 43, 226, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Move to Big Board
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(prospect.prospects.id);
                setShowMenu(false);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                fontSize: '14px',
                color: '#ef4444',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Remove from Watchlist
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export default function RankingsPage() {
  const router = useRouter();
  const { isSignedIn } = useUser();
  // Two separate state variables
  const [bigBoardProspects, setBigBoardProspects] = useState<Prospect[]>([]);
  const [watchlistProspects, setWatchlistProspects] = useState<Prospect[]>([]);
  
  // Refs to track latest state for instant updates
  const bigBoardRef = useRef<Prospect[]>([]);
  const watchlistRef = useRef<Prospect[]>([]);
  
  // Keep refs in sync with state
  useEffect(() => {
    bigBoardRef.current = bigBoardProspects;
  }, [bigBoardProspects]);
  
  useEffect(() => {
    watchlistRef.current = watchlistProspects;
  }, [watchlistProspects]);

  const [customPlayers, setCustomPlayers] = useState<CustomPlayer[]>([]);
  const [userRankings, setUserRankings] = useState<Array<{ prospect_id: string }>>([]);
  const [importedProspects, setImportedProspects] = useState<ImportedProspect[]>([]);

  // Helper to convert ImportedProspect to unified Prospect format
  const importedProspectToProspect = (imp: ImportedProspect): Prospect => ({
    id: imp.prospects.id,
    name: imp.prospects.full_name,
    position: imp.prospects.position || '',
    team: imp.prospects.team_name || '',
    rank: imp.rank,
    watchlistRank: imp.rank,
    originalProspectId: imp.prospect_id,
    source: imp.prospects.source,
    league: imp.prospects.league,
    isWatchlist: true,
  });

  // Helper to convert Prospect back to ImportedProspect format (for watchlist)
  const prospectToImportedProspect = (p: Prospect): ImportedProspect => ({
    id: `watchlist-${p.id}`,
    rank: p.watchlistRank || 1,
    prospect_id: p.originalProspectId || p.id,
    source: p.source || 'my_board',
    prospects: {
      id: p.id,
      full_name: p.name,
      position: p.position,
      team_name: p.team,
      league: p.league || null,
      source: p.source || 'external',
    },
  });

  // Clamp helper
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  // Helper function to create canonical player ID (same as in lib/trackedPlayers.ts)
  const createCanonicalPlayerId = useCallback((name: string, team: string, teamDisplay?: string): string => {
    const normalizedName = (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const teamToUse = (teamDisplay || team || '').trim();
    let normalizedTeam = teamToUse
      .toLowerCase()
      .trim()
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s+(basket|basketball|club|bc)$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalizedTeam.includes('partizan') || normalizedTeam.includes('mozzart')) {
      normalizedTeam = 'partizan';
    }
    return `${normalizedName}|${normalizedTeam}`;
  }, []);

  // Big board → Watchlist (true move: remove from big board, add to watchlist)
  // Helper function to build rankings data and dispatch instant update
  // If newBigBoard/newWatchlist are provided, use those; otherwise use refs (latest state)
  const dispatchRankingsUpdate = useCallback((newBigBoard?: Prospect[], newWatchlist?: Prospect[]) => {
    const bigBoard = newBigBoard ?? bigBoardRef.current;
    const watchlist = newWatchlist ?? watchlistRef.current;
    // Build rankings from provided state (big board + watchlist)
    const updatedRankings: Array<{ name: string; team: string; teamDisplay: string; rank: number; position: string; isWatchlist: boolean }> = [];
    
    // Add big board prospects
    bigBoard.forEach((p, index) => {
      if (p) {
        updatedRankings.push({
          name: p.name?.trim() || '',
          team: p.team?.trim() || p.teamDisplay?.trim() || '',
          teamDisplay: p.teamDisplay?.trim() || p.team?.trim() || '',
          rank: index + 1,
          position: p.position || '',
          isWatchlist: false,
        });
      }
    });
    
    // Add watchlist prospects
    watchlist.forEach((p) => {
      if (p) {
        updatedRankings.push({
          name: p.name?.trim() || '',
          team: p.team?.trim() || p.teamDisplay?.trim() || '',
          teamDisplay: p.teamDisplay?.trim() || p.team?.trim() || '',
          rank: p.watchlistRank || 1,
          position: p.position || '',
          isWatchlist: true,
        });
      }
    });
    
    // Store in localStorage and dispatch event for instant update
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('rankingsUpdated', JSON.stringify({
          timestamp: Date.now(),
          source: 'myboard',
          rankings: updatedRankings,
        }));
        console.log('[dispatchRankingsUpdate] ✓ Stored rankings in localStorage for instant update');
      } catch (err) {
        console.warn('[dispatchRankingsUpdate] Failed to store in localStorage:', err);
      }
      
      window.dispatchEvent(new CustomEvent('rankingsUpdated', {
        detail: { 
          source: 'myboard',
          rankings: updatedRankings,
        }
      }));
      console.log('[dispatchRankingsUpdate] ✓ Event dispatched with', updatedRankings.length, 'rankings');
    }
  }, []);

  const moveToWatchlist = (prospect: Prospect, targetRank?: number) => {
    console.log('[moveToWatchlist] Moving prospect:', prospect.name, 'id:', prospect.id, 'targetRank:', targetRank);
    
    let newBigBoard: Prospect[] = [];
    let newWatchlist: Prospect[] = [];
    
    setBigBoardProspects((prevBig) => {
      newBigBoard = prevBig.filter((p) => p.id !== prospect.id);
      console.log('[moveToWatchlist] Big board after remove:', newBigBoard.length, 'prospects');
      return newBigBoard;
    });

    setWatchlistProspects((prevWatch) => {
      console.log('[moveToWatchlist] Current watchlist:', prevWatch.length, 'prospects');
      
      // avoid duplicates
      const exists = prevWatch.some((p) => p.id === prospect.id);
      if (exists) {
        console.log('[moveToWatchlist] Prospect already exists in watchlist, skipping');
        newWatchlist = prevWatch;
        return prevWatch;
      }

      // Ensure prospect has watchlist properties
      const watchlistProspect: Prospect = {
        ...prospect,
        watchlistRank: targetRank || prevWatch.length + 1,
        isWatchlist: true,
        originalProspectId: prospect.originalProspectId || prospect.id,
        source: prospect.source || 'my_board',
      };

      // Insert at target rank if specified, otherwise append
      if (targetRank !== undefined) {
        const insertIndex = clamp(targetRank - 1, 0, prevWatch.length);
        const updated = [...prevWatch];
        updated.splice(insertIndex, 0, watchlistProspect);
        newWatchlist = updated.map((p, i) => ({ ...p, watchlistRank: i + 1 }));
        console.log('[moveToWatchlist] Watchlist after insert at rank', targetRank, ':', newWatchlist.length, 'prospects', newWatchlist.map(p => p.name));
      } else {
        const updated = [...prevWatch, watchlistProspect];
        newWatchlist = updated.map((p, i) => ({ ...p, watchlistRank: i + 1 }));
        console.log('[moveToWatchlist] Watchlist after add:', newWatchlist.length, 'prospects', newWatchlist.map(p => p.name));
      }
      
      // Dispatch instant update with new state
      setTimeout(() => {
        dispatchRankingsUpdate(newBigBoard, newWatchlist);
        
        // INSTANT ADD: Dispatch event to add player's games to cache
        if (typeof window !== 'undefined') {
          const playerId = createCanonicalPlayerId(prospect.name, prospect.team || '', prospect.teamDisplay || '');
          window.dispatchEvent(new CustomEvent('playerAdded', {
            detail: { 
              playerId,
              playerName: prospect.name,
              playerTeam: prospect.team || prospect.teamDisplay || '',
              type: 'watchlist'
            }
          }));
        }
      }, 0);
      
      return newWatchlist;
    });
  };

  // Watchlist → Big board at given rank (true move: remove from watchlist, add to big board)
  const moveToBigBoard = (prospect: Prospect, targetRank?: number) => {
    let newWatchlist: Prospect[] = [];
    let newBigBoard: Prospect[] = [];
    
    setWatchlistProspects((prevWatch) => {
      newWatchlist = prevWatch.filter((p) => p.id !== prospect.id);
      return newWatchlist;
    });

    setBigBoardProspects((prevBig) => {
      const without = prevBig.filter((p) => p.id !== prospect.id);

      const insertIndex = clamp(
        (targetRank ?? without.length + 1) - 1,
        0,
        without.length
      );

      const updated = [...without];
      updated.splice(insertIndex, 0, prospect);

      newBigBoard = updated.map((p, i) => ({ ...p, rank: i + 1 }));
      
      // Dispatch instant update with new state
      setTimeout(() => {
        dispatchRankingsUpdate(newBigBoard, newWatchlist);
      }, 0);
      
      return newBigBoard;
    });
  };

  // Reorder within big board (using the rank input or drag-and-drop)
  const reorderBigBoard = (prospectId: string, newRank: number) => {
    setBigBoardProspects((prev) => {
      const currentIndex = prev.findIndex((p) => p.id === prospectId);
      if (currentIndex === -1) return prev;

      const targetIndex = clamp(newRank - 1, 0, prev.length - 1);
      if (currentIndex === targetIndex) return prev;

      const updated = [...prev];
      const [moved] = updated.splice(currentIndex, 1);
      updated.splice(targetIndex, 0, moved);

      const newBigBoard = updated.map((p, i) => ({ ...p, rank: i + 1 }));
      
      // Dispatch instant update with new state
      // Use setTimeout to ensure state updates have been applied
      setTimeout(() => {
        dispatchRankingsUpdate(newBigBoard);
      }, 0);
      
      return newBigBoard;
    });
  };

  // Reorder within watchlist
  const reorderWatchlist = (prospect: Prospect, newRank: number) => {
    setWatchlistProspects((prev) => {
      const currentIndex = prev.findIndex((p) => p.id === prospect.id);
      if (currentIndex === -1) return prev;

      const targetIndex = clamp(newRank - 1, 0, prev.length - 1);
      if (currentIndex === targetIndex) return prev;

      const updated = [...prev];
      const [moved] = updated.splice(currentIndex, 1);
      updated.splice(targetIndex, 0, moved);

      const newWatchlist = updated.map((p, i) => ({ ...p, watchlistRank: i + 1 }));
      
      // Dispatch instant update with new state
      // Use setTimeout to ensure state updates have been applied
      setTimeout(() => {
        dispatchRankingsUpdate(undefined, newWatchlist);
      }, 0);
      
      return newWatchlist;
    });
  };

  // Convenience getter for backward compatibility
  const prospects = bigBoardProspects;
  
  // Memoize big board IDs for DnD (must be at top level, not in JSX)
  const bigBoardIds = useMemo(
    () => bigBoardProspects.map((p) => p.id),
    [bigBoardProspects]
  );
  
  // Memoize watchlist IDs for DnD
  const watchlistIds = useMemo(
    () => watchlistProspects.map((p) => `watchlist-${p.id}`),
    [watchlistProspects]
  );
  
  const [loading, setLoading] = useState(true); // Start with loading until we determine the source
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [useMyBoard, setUseMyBoard] = useState(false);
  const [sourceReady, setSourceReady] = useState(false); // Wait until we know the correct source
  const [showAddForm, setShowAddForm] = useState(false);
  const [fetchingGames, setFetchingGames] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false); // For background refresh indicator
  const initialLoadDoneRef = useRef(false);

  // Load toggle state from localStorage on mount AND load cached data immediately
  // CRITICAL: Set sourceReady=true AFTER determining the correct source to prevent ESPN flash
  useEffect(() => {
    const saved = localStorage.getItem('useMyBoard');
    const shouldUseMyBoard = saved === 'true';
    
    // Set the correct source BEFORE setting sourceReady
    setUseMyBoard(shouldUseMyBoard);
    
    // Try to load cached data immediately for instant display
    const source = shouldUseMyBoard ? 'myboard' : 'espn';
    const cacheKey = `rankings_${source}`;
    const cachedRankings = getStaleCachedData<Prospect[]>(cacheKey);
    
    if (cachedRankings && cachedRankings.length > 0) {
      console.log(`[Rankings] Using cached ${source} rankings: ${cachedRankings.length} prospects`);
      setBigBoardProspects(cachedRankings);
      setLoading(false); // Don't show loading if we have cached data
    }
    
    // Also load cached watchlist
    const cachedWatchlist = getStaleCachedData<Prospect[]>('rankings_watchlist');
    if (cachedWatchlist && cachedWatchlist.length > 0) {
      console.log(`[Rankings] Using cached watchlist: ${cachedWatchlist.length} prospects`);
      setWatchlistProspects(cachedWatchlist);
    }
    
    // Now we're ready to load - source is correctly set
    setSourceReady(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    // Don't load until we know the correct source (prevents ESPN flash when user is in myboard mode)
    if (!sourceReady) {
      console.log('[Rankings] Waiting for source to be determined...');
      return;
    }
    
    console.log(`[Rankings] Source ready, loading with useMyBoard=${useMyBoard}`);
    loadRankings();
    if (isSignedIn) {
      loadCustomPlayers();
      loadUserRankings();
    }
  }, [isSignedIn, useMyBoard, sourceReady]); // Reload when useMyBoard changes, but only after sourceReady

  const loadRankings = async () => {
    const source = useMyBoard ? 'myboard' : 'espn';
    const cacheKey = `rankings_${source}`;
    
    console.log(`[Rankings] loadRankings called with source=${source}, useMyBoard=${useMyBoard}`);
    
    // Check if we already have data (from cache or previous load)
    const hasExistingData = bigBoardProspects.length > 0;
    
    // INSTANT LOAD: Try to use cached data first
    if (!hasExistingData) {
      const cached = getCachedData<Prospect[]>(cacheKey) || getStaleCachedData<Prospect[]>(cacheKey);
      if (cached && cached.length > 0) {
        console.log(`[Rankings] INSTANT: Using cached ${source} rankings: ${cached.length} prospects, top 3:`, cached.slice(0, 3).map(p => p.name));
        setBigBoardProspects(cached);
        setLoading(false);
        // Do background refresh
        setUpdating(true);
      } else {
        console.log(`[Rankings] No cached data for ${source}, will fetch from API`);
        setLoading(true);
      }
    } else {
      console.log(`[Rankings] Already have ${bigBoardProspects.length} prospects, showing updating indicator`);
      setUpdating(true); // Show subtle updating indicator
    }
    setError(null);
    
    try {
      // Use the correct source based on useMyBoard state
      // Exclude watchlist players - they should only appear in the watchlist sidebar
      const response = await fetch(`/api/my-rankings?source=${source}&excludeWatchlist=true`, {
        cache: 'no-store', // Ensure fresh data
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Failed to load rankings: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      
      // Check if API returned an error in the response body
      if (data.error) {
        throw new Error(data.error);
      }
      
      const loadedProspects = Array.isArray(data.prospects) ? data.prospects : [];
      // Ensure all prospects have an id field (use name as id for big board)
      // This id is used for React keys and local state, not database IDs
      const processedProspects = loadedProspects.map((p: Prospect) => ({
        ...p,
        id: p.id || p.name, // Use name as id for ESPN prospects
      }));
      
      console.log(`[Rankings] API returned ${source} rankings: ${processedProspects.length} prospects, top 3:`, processedProspects.slice(0, 3).map((p: Prospect) => p.name));
      
      setBigBoardProspects(processedProspects);
      
      // Cache the data for future visits (5 minute TTL)
      setCachedData(cacheKey, processedProspects, 5 * 60 * 1000);
      console.log(`[Rankings] Cached ${source} rankings: ${processedProspects.length} prospects`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load rankings. Please try again.';
      // Only show error if we have no data to display
      if (bigBoardProspects.length === 0) {
        setError(errorMessage);
      }
      console.error('Error loading rankings:', err);
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  };

  const loadCustomPlayers = async () => {
    try {
      const response = await fetch('/api/custom-players');
      if (!response.ok) {
        let body: any = {};
        try {
          body = await response.json();
        } catch {
          // ignore
        }
        // Only log error if it's not a "table doesn't exist" issue (500 errors are expected during initial setup)
        if (response.status !== 500) {
          console.error('custom-players API failed', response.status, body);
        }
        setCustomPlayers([]);
        return;
      }
      const data = await response.json();
      setCustomPlayers(data.players || []);
    } catch (err) {
      // Silently fail - custom players feature might not be set up yet
      setCustomPlayers([]);
    }
  };

  const loadUserRankings = async () => {
    try {
      const response = await fetch('/api/draft-prospects/user-rankings');
      if (!response.ok) {
        let body: any = {};
        try {
          body = await response.json();
        } catch {
          // ignore
        }
        console.error('user-rankings API failed', response.status, body);
        setUserRankings([]);
        setImportedProspects([]);
        // Don't clear watchlistProspects on error - preserve local state
        return;
      }
      const data = await response.json();
      setUserRankings(data.rankings || []);
      
      // Extract imported prospects with full details
      // Imported prospects have source: 'external', 'espn', or 'international-roster' (not 'internal')
      const imported = (data.rankings || [])
        .filter((r: any) => r.prospects && (r.prospects.source === 'external' || r.prospects.source === 'espn' || r.prospects.source === 'international-roster'))
        .map((r: any) => ({
          id: r.prospect_id,
          rank: r.rank,
          prospect_id: r.prospect_id,
          source: r.source,
          prospects: r.prospects,
        }));
      setImportedProspects(imported);
      // Merge database watchlist with local watchlist (preserve locally moved prospects)
      setWatchlistProspects((prevWatchlist) => {
        const dbProspects = imported.map(importedProspectToProspect);
        const dbIds = new Set(dbProspects.map((p: Prospect) => p.id));
        
        console.log('[loadUserRankings] DB prospects:', dbProspects.length, dbProspects.map((p: Prospect) => p.name));
        console.log('[loadUserRankings] Previous watchlist:', prevWatchlist.length, prevWatchlist.map((p: Prospect) => p.name));
        
        // Keep locally moved prospects that aren't in database yet
        const localOnly = prevWatchlist.filter((p: Prospect) => !dbIds.has(p.id));
        
        console.log('[loadUserRankings] Local-only prospects:', localOnly.length, localOnly.map((p: Prospect) => p.name));
        
        // Combine: database prospects + local-only prospects
        const merged = [...dbProspects, ...localOnly];
        const result = merged.map((p: Prospect, i: number) => ({ ...p, watchlistRank: i + 1 }));
        console.log('[loadUserRankings] Merged watchlist:', result.length, result.map((p: Prospect) => p.name));
        
        // Cache the watchlist for instant loading on next visit
        setCachedData('rankings_watchlist', result, 5 * 60 * 1000);
        
        return result;
      });
    } catch (err) {
      console.error('Error loading user rankings:', err);
      setUserRankings([]);
      setImportedProspects([]);
      // Only clear watchlist if we have no cached data
      const cachedWatchlist = getStaleCachedData<Prospect[]>('rankings_watchlist');
      if (!cachedWatchlist) {
        setWatchlistProspects([]);
      }
    }
  };

  const handleFetchGames = async (playerId: string) => {
    setFetchingGames(playerId);
    try {
      const response = await fetch(`/api/custom-players/${playerId}/fetch-games`, {
        method: 'POST',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch games');
      }
      const data = await response.json();
      setSuccessMessage(`Successfully fetched ${data.gamesCount} games for this player!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch games');
      setTimeout(() => setError(null), 5000);
    } finally {
      setFetchingGames(null);
    }
  };

  const handleDeleteCustomPlayer = async (playerId: string) => {
    if (!confirm('Are you sure you want to delete this custom player? This will also delete all their games.')) {
      return;
    }

    try {
      const response = await fetch(`/api/custom-players/${playerId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete player');
      }
      await loadCustomPlayers();
      setSuccessMessage('Player deleted successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError('Failed to delete player. Please try again.');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleDeleteWatchlistPlayer = async (prospectId: string) => {
    if (!confirm('Are you sure you want to remove this player from your watchlist?')) {
      return;
    }

    try {
      const response = await fetch(`/api/draft-prospects/user-rankings?prospectId=${encodeURIComponent(prospectId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to delete player');
      }
      
      // Find the prospect to get name/team for playerId
      const prospect = watchlistProspects.find(p => p.id === prospectId || p.originalProspectId === prospectId);
      
      // INSTANT REMOVAL: Dispatch event to remove player's games from cache
      if (typeof window !== 'undefined' && prospect) {
        const playerId = createCanonicalPlayerId(prospect.name, prospect.team || '', prospect.teamDisplay || '');
        
        // Store in localStorage for cross-page/cross-tab communication
        localStorage.setItem('playerRemoved', JSON.stringify({
          playerId,
          playerName: prospect.name,
          type: 'watchlist',
          timestamp: Date.now()
        }));
        
        window.dispatchEvent(new CustomEvent('playerRemoved', {
          detail: { 
            playerId,
            playerName: prospect.name,
            type: 'watchlist'
          }
        }));
      }
      
      await loadUserRankings(); // Reload watchlist state
      setSuccessMessage('Player removed from watchlist!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError('Failed to remove player. Please try again.');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleBigBoardRankChange = (prospectId: string, newRank: number) => {
    reorderBigBoard(prospectId, newRank);
  };

  const handleMoveToWatchlist = (prospectId: string) => {
    const prospect = bigBoardProspects.find((p) => p.id === prospectId);
    if (prospect) {
      moveToWatchlist(prospect);
    }
  };

  const handleWatchlistAction = (
    prospectId: string,
    destination: Destination,
    targetRank: number
  ) => {
    const prospect = watchlistProspects.find((p) => p.id === prospectId);
    if (!prospect) return;

    if (destination === 'bigBoard') {
      moveToBigBoard(prospect, targetRank);
    } else {
      reorderWatchlist(prospect, targetRank);
    }
  };


  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) {
      return;
    }

    // Handle drag from watchlist
    if (typeof active.id === 'string' && active.id.startsWith('watchlist-')) {
      const activeData = active.data.current;
      if (activeData?.type === 'watchlist') {
        const prospectId = activeData.prospectId as string;
        const prospect = watchlistProspects.find((p) => p.id === prospectId);
        if (!prospect) return;
        
        const overId = over.id as string;
        const isBigBoardDrop = overId === 'big-board-drop';
        const overIndex = bigBoardProspects.findIndex((item) => item.id === overId);
        
        // Check if dropped on big board
        if (isBigBoardDrop || overIndex !== -1) {
          const targetRank = isBigBoardDrop ? bigBoardProspects.length + 1 : overIndex + 1;
          moveToBigBoard(prospect, targetRank);
          return;
        }
        
        // Check if dropped on another watchlist item (reordering within watchlist)
        if (overId.startsWith('watchlist-')) {
          const overProspectId = overId.replace('watchlist-', '');
          const overIndex = watchlistProspects.findIndex((p) => p.id === overProspectId);
          if (overIndex !== -1) {
            reorderWatchlist(prospect, overIndex + 1);
          }
          return;
        }
      }
    }

    // Handle drag from big board
    const activeId = active.id as string;
    const overId = over.id as string;
    
    // Check if dragging from big board to watchlist
    const activeProspect = bigBoardProspects.find((p) => p.id === activeId);
    if (activeProspect) {
      const isWatchlistDrop = overId === 'watchlist-drop';
      const isWatchlistItem = overId.startsWith('watchlist-');
      
      if (isWatchlistDrop || isWatchlistItem) {
        // Move from big board to watchlist
        const targetRank = isWatchlistDrop 
          ? watchlistProspects.length + 1 
          : (() => {
              const overProspectId = overId.replace('watchlist-', '');
              const overIndex = watchlistProspects.findIndex((p) => p.id === overProspectId);
              return overIndex !== -1 ? overIndex + 1 : watchlistProspects.length + 1;
            })();
        
        moveToWatchlist(activeProspect, targetRank);
        return;
      }
    }

    // Handle reordering within big board
    if (active.id === over.id) {
      return;
    }

    // Check if both are big board items
    const activeIndex = bigBoardProspects.findIndex((item) => item.id === activeId);
    const overIndex = bigBoardProspects.findIndex((item) => item.id === overId);

    if (activeIndex === -1 || overIndex === -1) {
      return;
    }

    // Use reorderBigBoard helper for reordering within big board
    reorderBigBoard(activeId, overIndex + 1);
  };

  const handleRemoveFromBigBoard = async (prospect: Prospect) => {
    if (!confirm(`Are you sure you want to remove ${prospect.name} from the big board?`)) {
      return;
    }

    try {
      let updatedBigBoard: Prospect[] = [];
      
      setBigBoardProspects((items) => {
        const filtered = items.filter((item) => item.id !== prospect.id);
        // Update ranks
        updatedBigBoard = filtered.map((item, index) => ({
          ...item,
          rank: index + 1,
        }));
        return updatedBigBoard;
      });
      
      // INSTANT UPDATE: Dispatch rankings update so other players' ranks update immediately
      setTimeout(() => {
        dispatchRankingsUpdate(updatedBigBoard);
      }, 0);
      
      // INSTANT REMOVAL: Dispatch event to remove player's games from cache
      if (typeof window !== 'undefined') {
        const playerId = createCanonicalPlayerId(prospect.name, prospect.team || '', prospect.teamDisplay || '');
        
        // Store in localStorage for cross-page/cross-tab communication
        localStorage.setItem('playerRemoved', JSON.stringify({
          playerId,
          playerName: prospect.name,
          type: 'bigBoard',
          timestamp: Date.now()
        }));
        
        window.dispatchEvent(new CustomEvent('playerRemoved', {
          detail: { 
            playerId,
            playerName: prospect.name,
            type: 'bigBoard'
          }
        }));
      }
      
      setSuccessMessage(`Removed ${prospect.name} from big board!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError('Failed to remove player. Please try again.');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      // Save big board
      const bigBoardPayload = {
        prospects: bigBoardProspects
          .filter(Boolean)
          .map((p, index) => ({
            id: p.id,
            name: p.name,
            position: p.position,
            team: p.team,
            rank: index + 1,
          })),
      };

      console.log(`[handleSave] Saving ${bigBoardPayload.prospects.length} big board prospects, top 3:`, 
        bigBoardPayload.prospects.slice(0, 3).map(p => `${p.rank}. ${p.name}`));

      const bigBoardResponse = await fetch('/api/my-rankings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bigBoardPayload),
      });

      if (!bigBoardResponse.ok) {
        const text = await bigBoardResponse.text();
        console.error('Save big board failed:', bigBoardResponse.status, text);
        throw new Error('Failed to save big board rankings');
      }

      // Save watchlist (only if user is signed in)
      // CRITICAL: Always save watchlist to handle removals (e.g., moving to big board)
      // Even if watchlist is now empty, we need to clear the old entries
      if (isSignedIn) {
        const watchlistPayload = {
          watchlist: watchlistProspects
            .filter(Boolean)
            .map((p) => ({
              id: p.id || p.name, // Use name as id if no id exists (for ESPN prospects)
              name: p.name,
              position: p.position,
              team: p.team,
              watchlistRank: p.watchlistRank || 1,
            })),
        };

        console.log('[handleSave] Saving watchlist:', watchlistPayload.watchlist.length, 'prospects', watchlistPayload.watchlist.map(p => p.name));

        const watchlistResponse = await fetch('/api/draft-prospects/user-rankings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(watchlistPayload),
        });

        if (!watchlistResponse.ok) {
          const text = await watchlistResponse.text();
          console.error('Save watchlist failed:', watchlistResponse.status, text);
          // Don't throw - big board was saved successfully
          console.warn('Watchlist save failed, but big board was saved');
        } else {
          console.log('[handleSave] Watchlist saved successfully, reloading...');
          // Reload watchlist to get updated data from database
          await loadUserRankings();
        }
      }

      setSuccessMessage('Rankings saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
      
      // DON'T clear games cache - we'll update ranks in-place instead
      // This keeps gamecards visible and only updates rankings instantly
      console.log('[handleSave] Rankings saved, updating ranks in-place (not clearing games cache)');
      
      // Build the updated rankings data to pass directly (for instant update)
      // Include both team and teamDisplay for better matching
      const updatedRankings = bigBoardProspects
        .filter(Boolean)
        .map((p, index) => ({
          name: p.name?.trim() || '',
          team: p.team?.trim() || p.teamDisplay?.trim() || '',
          teamDisplay: p.teamDisplay?.trim() || p.team?.trim() || '', // Include both for matching
          rank: index + 1,
          position: p.position || '',
          isWatchlist: false,
        }));
      
      // Add watchlist prospects if any
      if (isSignedIn && watchlistProspects.length > 0) {
        watchlistProspects.forEach((p) => {
          if (p) {
            updatedRankings.push({
              name: p.name?.trim() || '',
              team: p.team?.trim() || p.teamDisplay?.trim() || '',
              teamDisplay: p.teamDisplay?.trim() || p.team?.trim() || '',
              rank: p.watchlistRank || 1,
              position: p.position || '',
              isWatchlist: true,
            });
          }
        });
      }
      
      console.log('[handleSave] Built rankings for instant update:', updatedRankings.length, 'prospects');
      // Debug: Log Dash Daniels specifically
      const dashDaniels = updatedRankings.find(r => r.name.toLowerCase().includes('dash'));
      if (dashDaniels) {
        console.log('[handleSave] Dash Daniels in rankings:', dashDaniels);
      }
      
      // Store rankings in localStorage for cross-route instant updates
      // Also dispatch event as backup
      if (typeof window !== 'undefined') {
        // CRITICAL: Update the rankings page cache with the saved data
        // This ensures returning to the rankings page shows the correct saved data
        setCachedData('rankings_myboard', bigBoardProspects, 5 * 60 * 1000);
        console.log('[handleSave] ✓ Updated rankings_myboard cache with saved data');
        
        // Also update watchlist cache if we have watchlist data
        // Always update watchlist cache (even if empty, to clear old entries)
        setCachedData('rankings_watchlist', watchlistProspects, 5 * 60 * 1000);
        console.log('[handleSave] ✓ Updated rankings_watchlist cache:', watchlistProspects.length, 'prospects');
        
        // Store in localStorage (works across routes/pages)
        try {
          localStorage.setItem('rankingsUpdated', JSON.stringify({
            timestamp: Date.now(),
            source: 'myboard',
            rankings: updatedRankings,
          }));
          console.log('[handleSave] ✓ Stored rankings in localStorage for instant update');
        } catch (err) {
          console.warn('[handleSave] Failed to store in localStorage:', err);
        }
        
        // Also dispatch event (for same-page updates)
        console.log('[handleSave] Dispatching rankingsUpdated event with', updatedRankings.length, 'rankings');
        
        window.dispatchEvent(new CustomEvent('rankingsUpdated', {
          detail: { 
            source: 'myboard',
            rankings: updatedRankings,
          }
        }));
        console.log('[handleSave] ✓ Event dispatched');
      }
    } catch (err) {
      setError('Failed to save rankings. Please try again.');
      console.error('Error saving rankings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToESPN = async () => {
    if (!confirm('Are you sure you want to reset your rankings to ESPN rankings? This cannot be undone.')) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch('/api/my-rankings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resetToESPN: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to reset rankings');
      }

      setSuccessMessage('Rankings reset to ESPN rankings!');
      setTimeout(() => setSuccessMessage(null), 3000);
      
      // Clear local watchlist state immediately
      setWatchlistProspects([]);
      setImportedProspects([]);
      setUserRankings([]);
      
      // DON'T clear games cache - we'll update ranks in-place instead
      // This keeps gamecards visible and only updates rankings instantly
      console.log('[handleResetToESPN] Rankings reset, updating ranks in-place (not clearing games cache)');
      
      // Dispatch event to notify other pages (e.g., calendar) to update ranks in-place
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('rankingsUpdated', {
          detail: { source: 'myboard' }
        }));
        console.log('[handleResetToESPN] Dispatched rankingsUpdated event for in-place rank update');
      }
      
      // Reload rankings and watchlist
      await loadRankings();
      if (isSignedIn) {
        await loadUserRankings();
      }
    } catch (err) {
      setError('Failed to reset rankings. Please try again.');
      console.error('Error resetting rankings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner label="Loading rankings…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageLayout>
        {/* Header */}
        <div className="page-header">
          <h1 className="page-title">Rankings Editor</h1>
          <BackToCalendarButton />
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Drag and drop prospects to reorder your personal 2026 draft board. Add players from the watchlist by dragging them to the big board.
        </p>

        {/* Error/Success Messages */}
        {error && (
          <Alert type="error" message={error} />
        )}
        {successMessage && (
          <Alert type="success" message={successMessage} />
        )}

        {/* Action Buttons */}
        <div className="rankings-actions">
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="primary"
            className="px-6 py-2 font-medium"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button
            onClick={handleResetToESPN}
            disabled={saving}
            className="px-6 py-2 font-medium"
          >
            Reset to Default
          </Button>
          {isSignedIn && (
            <Button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-6 py-2 font-medium"
            >
              {showAddForm ? 'Cancel Add Player' : 'Add Custom Player'}
            </Button>
          )}
        </div>

        {/* Add Custom Player Form */}
        {isSignedIn && showAddForm && (
          <AddCustomPlayerForm
            onPlayerAdded={() => {
              loadCustomPlayers();
              loadUserRankings();
              loadRankings();
              setShowAddForm(false);
            }}
            onCancel={() => setShowAddForm(false)}
            existingRankings={userRankings}
          />
        )}

        {/* Custom Players List */}
        {isSignedIn && customPlayers.length > 0 && (
          <Card className="mb-8">
            <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              Custom Players ({customPlayers.length})
            </h2>
            <div className="space-y-2">
              {customPlayers.map((player) => (
                <div
                  key={player.id}
                  className="rankings-row"
                  style={{ borderLeft: '4px solid #3b82f6', paddingLeft: '12px' }}
                >
                  <div className="flex-shrink-0 w-12 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {player.rank}.
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {player.name}
                      <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>
                        (Custom)
                      </span>
                    </div>
                    <div className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                      {player.position} • {player.team}
                      {player.height && ` • ${player.height}`}
                      {player.class && ` • ${player.class}`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleFetchGames(player.id)}
                      disabled={fetchingGames === player.id}
                      className="px-3 py-1 text-sm"
                    >
                      {fetchingGames === player.id ? 'Fetching...' : 'Fetch Games'}
                    </Button>
                    <Button
                      onClick={() => handleDeleteCustomPlayer(player.id)}
                      className="px-3 py-1 text-sm"
                      style={{ backgroundColor: '#ef4444', color: 'white' }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Two-Column Layout: Big Board (left) and Watchlist (right) */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="rankings-layout">
            {/* Left Column: Main Big Board */}
            <div className="rankings-left">
              {/* Sortable List */}
              <Card className="mb-8" noInner>
                <BigBoardDropZone>
                  <SortableContext
                    items={bigBoardIds}
                    strategy={verticalListSortingStrategy}
                  >
                    <div>
                      {bigBoardProspects.map((prospect, index) => (
                        <SortableItem
                          key={prospect.id}
                          id={prospect.id}
                          prospect={prospect}
                          index={index}
                          onRemove={handleRemoveFromBigBoard}
                          onRankChange={handleBigBoardRankChange}
                          onMoveToWatchlist={handleMoveToWatchlist}
                          totalCount={bigBoardProspects.length}
                          disabled={saving}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </BigBoardDropZone>
              </Card>

            {/* Combined List Info */}
            {customPlayers.length > 0 && (
              <div className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Total: {bigBoardProspects.length} ranked players + {customPlayers.length} custom players = {bigBoardProspects.length + customPlayers.length} total
              </div>
            )}

          </div>

          {/* Right Column: Watchlist */}
          <div className="rankings-right">
            <WatchlistDropZone>
              <div 
                className="watchlist-card"
                style={{
                  background: 'var(--bg-card)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  padding: '14px 16px',
                  position: 'sticky',
                  top: '20px',
                }}
              >
                <div 
                  className="watchlist-header"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                  }}
                >
                  <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
                    Watchlist ({watchlistProspects.length})
                  </h2>
                </div>

                {watchlistProspects.length === 0 ? (
                  <p 
                    className="watchlist-empty"
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      margin: 0,
                      lineHeight: '1.5',
                    }}
                  >
                    Use <span style={{ color: 'var(--accent)', fontWeight: '500' }}>Search &amp; Import</span> to add players
                    beyond the top 100 to your watchlist, or drag players from the big board here.
                  </p>
                ) : (
                  <SortableContext
                    items={watchlistIds}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul 
                      className="watchlist-list"
                      style={{
                        listStyle: 'none',
                        margin: 0,
                        padding: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {watchlistProspects
                        .sort((a, b) => (a.watchlistRank || 0) - (b.watchlistRank || 0))
                        .map((prospect, index) => {
                          // Convert back to ImportedProspect for WatchlistItem component
                          const importedProspect = prospectToImportedProspect(prospect);
                          return (
                            <WatchlistItem
                              key={prospect.id}
                              prospect={importedProspect}
                              index={index}
                              onRemove={handleDeleteWatchlistPlayer}
                              onWatchlistAction={handleWatchlistAction}
                              watchlistCount={watchlistProspects.length}
                              bigBoardCount={bigBoardProspects.length}
                              disabled={saving}
                            />
                          );
                        })}
                    </ul>
                  </SortableContext>
                )}
              </div>
            </WatchlistDropZone>
          </div>
        </div>
        <DragOverlay>
          {activeId ? (
            (() => {
              // Check if it's a watchlist item
              if (typeof activeId === 'string' && activeId.startsWith('watchlist-')) {
                const prospectId = activeId.replace('watchlist-', '');
                const watchlistItem = watchlistProspects.find(p => p.id === prospectId);
                if (watchlistItem) {
                  return (
                    <div className="rankings-row" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                      <div className="flex-shrink-0 flex items-center justify-center w-10 h-10" style={{ color: 'var(--text-secondary)' }}>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                      <div className="flex-shrink-0 w-12 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        {(watchlistItem?.watchlistRank || 0)}.
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {watchlistItem?.name}
                        </div>
                        <div className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                          {[watchlistItem?.position, watchlistItem?.team, watchlistItem?.league].filter(Boolean).join(' • ')}
                        </div>
                      </div>
                    </div>
                  );
                }
              } else {
                // Big board item
                const prospect = bigBoardProspects.find(p => p.id === activeId);
                if (prospect) {
                  const index = bigBoardProspects.findIndex(p => p.id === activeId);
                  return (
                    <div className="rankings-row" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                      <div className="flex-shrink-0 flex items-center justify-center w-10 h-10" style={{ color: 'var(--text-secondary)' }}>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                      <div className="flex-shrink-0 w-12 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        {index + 1}.
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{prospect.name}</div>
                        <div className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                          {prospect.position} • {prospect.team}
                        </div>
                      </div>
                    </div>
                  );
                }
              }
              return null;
            })()
          ) : null}
        </DragOverlay>
        </DndContext>
      </PageLayout>
    </div>
  );
}

