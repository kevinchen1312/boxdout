'use client';

import { useState, memo, useEffect } from 'react';
import { GameWithProspects } from '../utils/gameMatching';
import { format, parseISO } from 'date-fns';
import { convertTipoffToLocal } from '../utils/timezone';
import { useUser } from '@clerk/nextjs';

export type RankingSource = 'espn' | 'myboard';

interface GameCardProps {
  game: GameWithProspects;
  compact?: boolean;
  rankingSource?: RankingSource;
  onOpenNotes?: (game: GameWithProspects) => void;
}

const deriveTipoff = (game: GameWithProspects) => {
  if (game.tipoff) {
    // Convert ET times to local timezone
    return convertTipoffToLocal(game.tipoff, game.date);
  }

  if (!game.date) {
    return '';
  }

  try {
    // Format from ISO date in local timezone
    return format(parseISO(game.date), 'h:mm a');
  } catch {
    return '';
  }
};

const buildMatchupLabel = (game: GameWithProspects) => {
  const awayName = game.awayTeam.displayName || game.awayTeam.name;
  const homeName = game.homeTeam.displayName || game.homeTeam.name;
  return `${awayName} at ${homeName}`;
};

const getHighlightLabel = (game: GameWithProspects) => {
  if (game.highlight) {
    return game.highlight;
  }
  if (game.prospects.length > 0) {
    const top = [...game.prospects].sort((a, b) => a.rank - b.rank)[0];
    return `#${top.rank} ${top.name}`;
  }
  return '';
};

const formatGameDate = (game: GameWithProspects) => {
  if (!game.date) return '';
  try {
    return format(parseISO(game.date), 'EEEE, MMM d, yyyy');
  } catch {
    return '';
  }
};

const GameCard = memo(function GameCard({ game, compact = false, rankingSource = 'espn', onOpenNotes }: GameCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [watched, setWatched] = useState(false);
  const [hasNote, setHasNote] = useState(false);
  const [isTogglingWatch, setIsTogglingWatch] = useState(false);
  const { isSignedIn } = useUser();
  const sourceLabel = rankingSource === 'myboard' ? 'myBoard' : 'ESPN';

  const tipoffText = deriveTipoff(game) || 'TBD';
  const matchupLabel = buildMatchupLabel(game);
  const highlightLabel = getHighlightLabel(game);

  // Load watched status on mount
  useEffect(() => {
    if (!isSignedIn) return;
    
    fetch('/api/watched/list')
      .then(res => res.json())
      .then(data => {
        if (data.watchedGames) {
          const isWatched = data.watchedGames.some((w: any) => w.game_id === game.id);
          setWatched(isWatched);
        }
      })
      .catch(err => console.error('Error loading watched status:', err));
  }, [isSignedIn, game.id]);

  // Load note status
  useEffect(() => {
    if (!isSignedIn) return;
    
    fetch(`/api/notes/get?gameId=${game.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.notes && data.notes.length > 0) {
          const userNote = data.notes.find((n: any) => n.isOwn);
          setHasNote(!!userNote);
        }
      })
      .catch(err => console.error('Error loading note status:', err));
  }, [isSignedIn, game.id]);

  const handleToggleWatch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSignedIn || isTogglingWatch) return;
    
    setIsTogglingWatch(true);
    
    // Optimistically update the UI
    const newWatchedState = !watched;
    setWatched(newWatchedState);
    
    try {
      const response = await fetch('/api/watched/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          gameDate: game.dateKey || game.date.substring(0, 10),
        }),
      });

      const data = await response.json();
      if (response.ok) {
        // Confirm with server response
        setWatched(data.watched);
      } else {
        // Revert on error
        console.error('Error toggling watch:', data);
        setWatched(!newWatchedState);
      }
    } catch (err) {
      console.error('Error toggling watch:', err);
      // Revert on error
      setWatched(!newWatchedState);
    } finally {
      setIsTogglingWatch(false);
    }
  };

  const handleOpenNotes = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenNotes) {
      onOpenNotes(game);
    }
  };

  if (compact) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] leading-tight text-orange-800 shadow-sm hover:bg-orange-100 transition-colors">
          <div className="font-semibold">{tipoffText}</div>
          <div className="text-[10px] text-gray-700">{matchupLabel}</div>
        </div>

        {showTooltip && highlightLabel && (
          <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max -translate-x-1/2">
            <div className="relative flex flex-col items-center">
              <div className="absolute -top-2 h-3 w-3 rotate-45 rounded-sm bg-orange-400"></div>
              <div className="relative rounded-2xl border-2 border-orange-400 bg-white/95 px-3 py-2 shadow-xl backdrop-blur">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-sm text-orange-600">
                    🏀
                  </div>
                  <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-orange-900">
                    {highlightLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const awayTeamName = game.awayTeam.displayName || game.awayTeam.name;
  const homeTeamName = game.homeTeam.displayName || game.homeTeam.name;
  // Prospects are already pre-sorted from server, no need to sort again
  const awayProspects = game.awayProspects;
  const homeProspects = game.homeProspects;

  // Get team logos - use ESPN CDN or fallback to provided logo
  const getTeamLogo = (team: GameWithProspects['awayTeam']) => {
    if (team.logo) {
      return team.logo;
    }
    // If no logo provided, return null to show placeholder
    return null;
  };

  const awayLogo = getTeamLogo(game.awayTeam);
  const homeLogo = getTeamLogo(game.homeTeam);

  return (
    <div id={`game-${game.id}`} className="game-row w-full bg-white" style={{ position: 'relative' }}>
      {/* Time and Network - top left and top right */}
      <div className="flex items-center justify-between px-[10px] pt-3 pb-2 gap-2">
        <span className="text-sm font-medium text-gray-900 text-left max-w-[120px] truncate">{tipoffText}</span>
        {game.tv && game.tv !== 'TBA' && (
          <span className="text-sm font-medium text-gray-700 text-right max-w-[120px] truncate">
            {game.tv}
          </span>
        )}
      </div>

      {/* School logos side-by-side, centered */}
      <div className="flex items-center justify-center gap-3 px-4 pb-12">
        {/* Away Team */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {awayLogo ? (
            <img
              src={awayLogo}
              alt={awayTeamName}
              className={`team-logo mb-2 ${awayLogo.includes('mega-superbet') ? 'logo-enhanced' : ''}`}
              width={100}
              height={100}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              style={awayLogo.includes('mega-superbet') ? {
                filter: 'invert(1) drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                backgroundColor: 'transparent'
              } : undefined}
              onError={(e) => {
                // Hide broken images
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="max-w-[100px] w-auto h-auto flex items-center justify-center bg-gray-100 rounded mb-2">
              <span className="text-[8px]">🏀</span>
            </div>
          )}
          <div className="font-semibold text-sm text-gray-800 mb-2 leading-tight px-1">
            {awayTeamName}
          </div>
          <div className="prospects w-full space-y-0.5">
            {awayProspects.length > 0 &&
              awayProspects.map((prospect) => (
                <div
                  key={`away-${prospect.rank}-${prospect.name}`}
                  className="text-xs text-gray-700 leading-snug"
                >
                  {sourceLabel} {prospect.rank}: {prospect.name}
                  {prospect.jersey ? `, #${prospect.jersey}` : ''}
                </div>
              ))}
          </div>
        </div>

        {/* Home Team */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {homeLogo ? (
            <img
              src={homeLogo}
              alt={homeTeamName}
              className={`team-logo mb-2 ${homeLogo.includes('mega-superbet') ? 'logo-enhanced' : ''}`}
              width={100}
              height={100}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              style={homeLogo.includes('mega-superbet') ? {
                filter: 'invert(1) drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                backgroundColor: 'transparent'
              } : undefined}
              onError={(e) => {
                // Hide broken images
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="max-w-[100px] w-auto h-auto flex items-center justify-center bg-gray-100 rounded mb-2">
              <span className="text-[8px]">🏀</span>
            </div>
          )}
          <div className="font-semibold text-sm text-gray-800 mb-2 leading-tight px-1">
            {homeTeamName}
          </div>
          <div className="prospects w-full space-y-0.5">
            {homeProspects.length > 0 &&
              homeProspects.map((prospect) => (
                <div
                  key={`home-${prospect.rank}-${prospect.name}`}
                  className="text-xs text-gray-700 leading-snug"
                >
                  {sourceLabel} {prospect.rank}: {prospect.name}
                  {prospect.jersey ? `, #${prospect.jersey}` : ''}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Action buttons - bottom right */}
      {isSignedIn && (
        <div 
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            display: 'flex',
            gap: '6px',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            padding: '4px',
            borderRadius: '6px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            zIndex: 10,
          }}
        >
          {/* Eye icon for watched status */}
          <button
            onClick={handleToggleWatch}
            disabled={isTogglingWatch}
            style={{
              padding: '4px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={watched ? 'Mark as unwatched' : 'Mark as watched'}
            aria-label={watched ? 'Mark as unwatched' : 'Mark as watched'}
          >
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke={watched ? '#16a34a' : '#6b7280'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          {/* Compose icon for notes */}
          <button
            onClick={handleOpenNotes}
            style={{
              padding: '4px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: hasNote ? '#ea580c' : '#6b7280',
            }}
            title={hasNote ? 'Edit note' : 'Add note'}
            aria-label={hasNote ? 'Edit note' : 'Add note'}
          >
            ✏️
          </button>
        </div>
      )}
    </div>
  );
});

export default GameCard;
