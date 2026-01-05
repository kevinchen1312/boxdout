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
  watched?: boolean;
  hasNote?: boolean;
  hideEyeIcon?: boolean;
}

const deriveTipoff = (game: GameWithProspects) => {
  if (game.tipoff) {
    // Validate tipoff format - reject values that look like dates (e.g., "1/4", "12/25")
    // Valid tipoff formats: "7:00 PM", "7:00 PM ET", "12:30 AM", etc.
    const isValidTipoff = /^\d{1,2}:\d{2}\s*(AM|PM)/i.test(game.tipoff) || 
                          /^TBD$/i.test(game.tipoff) ||
                          /^TBA$/i.test(game.tipoff);
    
    if (!isValidTipoff) {
      // Invalid tipoff (likely a date like "1/4") - try to extract from date field instead
      console.warn(`[GameCard] Invalid tipoff format detected: "${game.tipoff}" for game ${game.id}`);
    } else {
      // Convert ET times to local timezone
      return convertTipoffToLocal(game.tipoff, game.date);
    }
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

const GameCard = memo(function GameCard({ game, compact = false, rankingSource = 'espn', watched: initialWatched = false, hasNote: initialHasNote = false, hideEyeIcon = false }: GameCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [watched, setWatched] = useState(initialWatched);
  const [hasNote, setHasNote] = useState(initialHasNote);
  const [isTogglingWatch, setIsTogglingWatch] = useState(false);
  const { isSignedIn } = useUser();
  const sourceLabel = rankingSource === 'myboard' ? 'myBoard' : 'ESPN';

  // Determine if game is completed (has scores)
  const isCompleted = (game.homeTeam.score || game.awayTeam.score) && 
                      (game.status === 'COMPLETED' || game.status === 'FINAL' || game.status === 'final' || game.status === 'post');
  
  // Determine if game is live (in progress)
  const isLive = game.status === 'LIVE' || game.status === 'in';
  
  // For completed or live games with scores, show score with status detail
  let displayText: string;
  let statusText: string | undefined;
  
  if ((isCompleted || isLive) && game.awayTeam.score && game.homeTeam.score) {
    displayText = `${game.awayTeam.score}-${game.homeTeam.score}`;
    // Add status detail like "Halftime", "9:54 - 2nd", "Final"
    if (game.statusDetail) {
      statusText = game.statusDetail;
    } else if (isLive && game.clock && game.period) {
      // Format like ESPN: "9:54 - 2nd" or "9:54 - 1st"
      const half = game.period === 1 ? '1st' : '2nd';
      statusText = `${game.clock} - ${half}`;
    } else if (isLive) {
      statusText = 'Live';
    } else if (isCompleted) {
      statusText = 'Final';
    }
  } else if (isLive && !game.awayTeam.score && !game.homeTeam.score) {
    // Live game but no scores yet - show LIVE indicator
    displayText = 'LIVE';
    statusText = 'In Progress';
  } else {
    displayText = deriveTipoff(game) || 'TBD';
  }
  
  const tipoffText = displayText;
  const matchupLabel = buildMatchupLabel(game);
  const highlightLabel = getHighlightLabel(game);
  
  // Debug: Log scores if present
  if (process.env.NODE_ENV === 'development' && (game.homeTeam.score || game.awayTeam.score)) {
    console.log(`[GameCard] Scores for ${game.awayTeam.displayName} @ ${game.homeTeam.displayName}: ${game.awayTeam.score || 'N/A'} - ${game.homeTeam.score || 'N/A'}`);
  }

  // Update local state when props change
  useEffect(() => {
    setWatched(initialWatched);
  }, [initialWatched]);

  useEffect(() => {
    setHasNote(initialHasNote);
  }, [initialHasNote]);

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
          gameDate: game.dateKey || game.date?.substring(0, 10) || '',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Watch toggle successful:', data);
        // Confirm with server response
        setWatched(data.watched);
        // Note: Parent component will refresh statuses on next render if needed
      } else {
        // Revert on error - try to parse error message
        let errorMessage = 'Unknown error';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || JSON.stringify(errorData);
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        console.error('Error toggling watch:', errorMessage);
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

  // CRITICAL FIX: Create explicit display team objects that tie logos, names, and tracked players together
  // This ensures logos always match the team names and players, even if team objects are swapped in the data
  
  // Helper to extract ESPN team ID from logo URL
  // ESPN logo URLs are like: https://a.espncdn.com/i/teamlogos/ncaa/500/41.png
  const extractTeamIdFromLogo = (logoUrl: string | null | undefined): string | undefined => {
    if (!logoUrl) return undefined;
    // Match pattern: /500/41.png or /500-dark/41.png
    const match = logoUrl.match(/\/(\d+)\/(\d+)\.png/);
    return match ? match[2] : undefined; // Return the team ID (second number)
  };
  
  // Left side = Away Team
  const leftTeam = game.awayTeam;
  const leftTeamName = leftTeam.displayName || leftTeam.name;
  const leftTrackedPlayers = game.awayTrackedPlayers || [];
  // Extract team ID from logo URL if id is not set (fallback for swapped teams)
  const leftGameTeamId = game.awayTeam.id || extractTeamIdFromLogo(game.awayTeam.logo);
  
  // Right side = Home Team
  const rightTeam = game.homeTeam;
  const rightTeamName = rightTeam.displayName || rightTeam.name;
  const rightTrackedPlayers = game.homeTrackedPlayers || [];
  // Extract team ID from logo URL if id is not set (fallback for swapped teams)
  const rightGameTeamId = game.homeTeam.id || extractTeamIdFromLogo(game.homeTeam.logo);
  
  // Debug logging for Dayton vs Virginia game
  const isDaytonVirginia = (leftTeamName.toLowerCase().includes('dayton') && rightTeamName.toLowerCase().includes('virginia')) ||
                           (leftTeamName.toLowerCase().includes('virginia') && rightTeamName.toLowerCase().includes('dayton'));
  if (isDaytonVirginia && game.dateKey === '2025-12-06') {
    console.log('[GameCard DEBUG] Dayton vs Virginia on 12/6:', {
      gameId: game.id,
      dateKey: game.dateKey,
      rawGameData: {
        awayTeam: {
          name: game.awayTeam.name,
          displayName: game.awayTeam.displayName,
          id: game.awayTeam.id,
          logo: game.awayTeam.logo,
        },
        homeTeam: {
          name: game.homeTeam.name,
          displayName: game.homeTeam.displayName,
          id: game.homeTeam.id,
          logo: game.homeTeam.logo,
        },
        awayProspects: game.awayProspects?.map(p => ({ name: p.name, team: p.team, teamId: p.teamId })),
        homeProspects: game.homeProspects?.map(p => ({ name: p.name, team: p.team, teamId: p.teamId })),
      },
      leftTeam: {
        name: leftTeamName,
        id: leftTeam.id,
        logo: leftTeam.logo,
        extractedId: extractTeamIdFromLogo(leftTeam.logo),
        gameTeamId: leftGameTeamId,
        trackedPlayers: leftTrackedPlayers.map(p => ({ name: p.playerName, teamId: p.teamId })),
      },
      rightTeam: {
        name: rightTeamName,
        id: rightTeam.id,
        logo: rightTeam.logo,
        extractedId: extractTeamIdFromLogo(rightTeam.logo),
        gameTeamId: rightGameTeamId,
        trackedPlayers: rightTrackedPlayers.map(p => ({ name: p.playerName, teamId: p.teamId })),
      },
    });
  }
  
  // Create display team objects that explicitly tie logo, name, and tracked players together
  type DisplayTeam = {
    id?: string;
    name: string;
    logo: string | null;
    trackedPlayers: typeof leftTrackedPlayers;
  };
  
  // Helper to get correct logo using tracked players' teamIds as source of truth
  // CRITICAL: Tracked players are already correctly matched to team names, so prefer their teamIds for logos
  // This prevents logo swaps by constructing logos from tracked players' teamIds when available
  const getVerifiedLogo = (
    team: GameWithProspects['awayTeam'], 
    teamId: string | undefined,
    trackedPlayers: typeof leftTrackedPlayers,
    gameTeamId: string | undefined,
    teamName: string,
    otherTeamLogo: string | undefined,
    otherTeamName: string
  ): string | null => {
    // CRITICAL: For NBL and international teams, trust the original logo URL
    // NBL team IDs (1-10) overlap with NCAA team IDs, so we can't construct logos from IDs
    // e.g., NBL ID 8 = South East Melbourne Phoenix, NCAA ID 8 = Arkansas
    // Similarly, API Basketball teams have IDs that might collide with ESPN NCAA IDs
    const isNBLLogo = team.logo && team.logo.includes('/nbl/');
    const isAPIBasketballLogo = team.logo && team.logo.includes('api-sports.io');
    const isInternationalLogo = team.logo && (
      team.logo.includes('/international/') ||
      team.logo.includes('mega-superbet') ||
      team.logo.includes('paris') ||
      team.logo.includes('valencia') ||
      team.logo.includes('partizan') ||
      team.logo.includes('euroleague')
    );
    
    // For NBL, API Basketball, and international teams, use the original logo directly
    if (isNBLLogo || isAPIBasketballLogo || isInternationalLogo) {
      return team.logo || null;
    }
    
    // Get team ID from tracked players (most reliable - already matched correctly to team names)
    const trackedTeamIds = trackedPlayers
      .map(p => p.teamId)
      .filter(Boolean)
      .filter((id, index, arr) => arr.indexOf(id) === index); // unique
    
    // Debug logging for Dayton/Virginia
    const isDebugGame = isDaytonVirginia && game.dateKey === '2025-12-06';
    
    // Priority 1: Tracked players' teamId (most reliable - already matched to team names)
    if (trackedTeamIds.length > 0) {
      const logoTeamId = trackedTeamIds[0];
      const constructedLogo = `https://a.espncdn.com/i/teamlogos/ncaa/500/${logoTeamId}.png`;
      
      // Check if team.logo EXACTLY matches this logoTeamId (not just contains it as substring)
      // e.g., "2" should not match "/2509.png" - only "/2.png"
      const exactLogoMatch = team.logo && (
        team.logo.includes(`/${logoTeamId}.png`) || 
        team.logo.includes(`/${logoTeamId}.svg`) ||
        team.logo.endsWith(`/${logoTeamId}`)
      );
      
      if (isDebugGame) {
        console.log(`[getVerifiedLogo] ${teamName}: Using Priority 1 (tracked players' teamId)`, {
          logoTeamId,
          constructedLogo,
          teamLogo: team.logo,
          exactLogoMatch,
        });
      }
      
      // If team.logo EXACTLY matches logoTeamId, use it (might be higher quality)
      if (exactLogoMatch) {
        return team.logo || null;
      }
      
      return constructedLogo;
    }
    
    // Priority 2: Game's team ID (from game.awayTeam.id or game.homeTeam.id - should be correct if set)
    // CRITICAL: Always construct logo from gameTeamId, don't trust team.logo which might be swapped
    if (gameTeamId) {
      const constructedLogo = `https://a.espncdn.com/i/teamlogos/ncaa/500/${gameTeamId}.png`;
      
      // Check if team.logo EXACTLY matches this gameTeamId (not just contains it as substring)
      // e.g., "2" should not match "/2509.png" - only "/2.png"
      const exactLogoMatch = team.logo && (
        team.logo.includes(`/${gameTeamId}.png`) || 
        team.logo.includes(`/${gameTeamId}.svg`) ||
        team.logo.endsWith(`/${gameTeamId}`)
      );
      
      if (isDebugGame) {
        console.log(`[getVerifiedLogo] ${teamName}: Using Priority 2 (gameTeamId)`, {
          gameTeamId,
          constructedLogo,
          teamLogo: team.logo,
          exactLogoMatch,
        });
      }
      
      // Only use team.logo if it EXACTLY matches gameTeamId
      if (exactLogoMatch) {
        return team.logo || null;
      }
      // Always use constructed logo from gameTeamId (most reliable source)
      return constructedLogo;
    }
    
    // Priority 3: If logos are swapped, try the other team's logo
    // Heuristic: If this team has tracked players but no teamId, and the other team's logo
    // might actually belong to this team, try swapping
    const thisLogoTeamId = extractTeamIdFromLogo(team.logo);
    const otherLogoTeamId = extractTeamIdFromLogo(otherTeamLogo);
    
    if (isDebugGame) {
      console.log(`[getVerifiedLogo] ${teamName}: Using Priority 3/4 (extract from logo URL)`, {
        thisLogoTeamId,
        otherLogoTeamId,
        teamLogo: team.logo,
      });
    }
    
    // If we have both logo IDs and they're different, check if they're swapped
    // This is a heuristic: if this side has no tracked players with teamId but the other side does,
    // and the logos don't match the expected teams, they might be swapped
    if (thisLogoTeamId && otherLogoTeamId && thisLogoTeamId !== otherLogoTeamId) {
      // If this team has tracked players but no teamId, and other team has no tracked players,
      // try using the other team's logo (might be swapped)
      if (trackedPlayers.length > 0 && leftTrackedPlayers.length === 0 && rightTrackedPlayers.length === 0) {
        // Both sides have no tracked players with teamId - can't determine swap
        // Fall through to use this team's logo
      } else {
        // Use this team's logo (might be correct or swapped, but we have no better info)
        const constructedLogo = `https://a.espncdn.com/i/teamlogos/ncaa/500/${thisLogoTeamId}.png`;
        return constructedLogo;
      }
    }
    
    // Priority 4: Extract team ID from team.logo URL (fallback - might be swapped)
    if (thisLogoTeamId) {
      const constructedLogo = `https://a.espncdn.com/i/teamlogos/ncaa/500/${thisLogoTeamId}.png`;
      return constructedLogo;
    }
    
    // Final fallback: use team.logo if it exists
    if (isDebugGame) {
      console.log(`[getVerifiedLogo] ${teamName}: Using Final fallback (team.logo)`, {
        teamLogo: team.logo,
      });
    }
    return team.logo || null;
  };
  
const leftDisplayTeam: DisplayTeam = {
    id: leftTeam.id,
    name: leftTeamName,
    logo: getVerifiedLogo(leftTeam, leftTeam.id, leftTrackedPlayers, leftGameTeamId, leftTeamName, rightTeam.logo === null ? undefined : rightTeam.logo, rightTeamName) || null,
    trackedPlayers: leftTrackedPlayers,
  };

  const rightDisplayTeam: DisplayTeam = {
    id: rightTeam.id,
    name: rightTeamName,
    logo: getVerifiedLogo(rightTeam, rightTeam.id, rightTrackedPlayers, rightGameTeamId, rightTeamName, leftTeam.logo === null ? undefined : leftTeam.logo, leftTeamName) || null,
    trackedPlayers: rightTrackedPlayers,
  };
  
  
  // Separate myBoard and watchlist players for each side
  const leftMyBoard = leftDisplayTeam.trackedPlayers.filter(p => p.type === 'myBoard');
  const leftWatchlist = leftDisplayTeam.trackedPlayers.filter(p => p.type === 'watchlist');
  const rightMyBoard = rightDisplayTeam.trackedPlayers.filter(p => p.type === 'myBoard');
  const rightWatchlist = rightDisplayTeam.trackedPlayers.filter(p => p.type === 'watchlist');
  
  // Fallback to old system: If tracked players arrays are empty but prospects arrays have players,
  // use prospects arrays as fallback. This handles cases where decoration didn't find matches.
  const leftProspects = (leftTrackedPlayers.length > 0 || rightTrackedPlayers.length > 0) ? [] : (game.awayProspects || []);
  const rightProspects = (leftTrackedPlayers.length > 0 || rightTrackedPlayers.length > 0) ? [] : (game.homeProspects || []);

  return (
    <div id={`game-${game.id}`} className="game-card game-row game-card-inner w-full">
      {/* Time/Score, Watch button, and Network - top row */}
      <div className="flex items-center justify-between pt-0 pb-1 gap-2">
        <div className="flex flex-col items-start min-w-[70px]">
          <span className={`game-card-time text-left max-w-[100px] truncate ${isCompleted ? 'font-bold' : ''}`}>
            {tipoffText}
          </span>
          {statusText && (
            <span className="text-[10px] text-gray-600 font-medium">
              {statusText}
            </span>
          )}
        </div>
        {/* Eye icon for watched status - centered (hidden when using GameCardWithPanel) */}
        {isSignedIn && !hideEyeIcon && (
          <button
            onClick={handleToggleWatch}
            disabled={isTogglingWatch}
            className="icon-button"
            title={watched ? 'Mark as unwatched' : 'Mark as watched'}
            aria-label={watched ? 'Mark as unwatched' : 'Mark as watched'}
          >
            <svg 
              width="18" 
              height="18" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke={watched ? '#c2410c' : '#9ca3af'}
              strokeWidth={watched ? '2.5' : '1.5'}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
        )}
        {/* Spacer when eye icon is hidden */}
        {hideEyeIcon && <div className="w-[18px]"></div>}
        <div className="min-w-[70px] text-right">
          {game.tv && game.tv !== 'TBA' && (
            <span className="game-card-network max-w-[100px] truncate">
              {game.tv}
            </span>
          )}
        </div>
      </div>

      {/* School logos side-by-side, centered */}
      {/* CRITICAL: Use leftDisplayTeam and rightDisplayTeam for ALL rendering (logo, name, players) */}
      {/* This ensures logos, names, and players are always aligned */}
      <div className="flex items-center justify-center gap-2 pb-2">
        {/* Left Team (Away) */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {leftDisplayTeam.logo ? (
            <img
              src={leftDisplayTeam.logo}
              alt={leftDisplayTeam.name}
              className={`team-logo mb-2 ${leftDisplayTeam.logo.includes('mega-superbet') ? 'logo-enhanced' : ''}`}
              width={70}
              height={70}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              style={leftDisplayTeam.logo.includes('mega-superbet') ? {
                filter: 'invert(1) drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                backgroundColor: 'transparent'
              } : undefined}
              onError={(e) => {
                // Hide broken images
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="w-[70px] h-[70px] flex items-center justify-center bg-gray-100 rounded mb-2">
              <span className="text-2xl">🏀</span>
            </div>
          )}
          <div className="team-name font-medium mb-1 leading-tight px-1">
            {leftDisplayTeam.name}
          </div>
          <div className="prospects w-full space-y-0.5">
            {/* Render myBoard players */}
            {leftMyBoard.length > 0 &&
              leftMyBoard.map((tracked) => (
                <div
                  key={`left-myboard-${tracked.playerId}`}
                  className="prospect-line text-xs leading-snug"
                >
                  {sourceLabel} {tracked.rank}: {tracked.playerName}
                </div>
              ))}
            {/* Render watchlist players */}
            {leftWatchlist.length > 0 && (
              <div className="prospect-line text-xs leading-snug">
                Watchlist: {leftWatchlist.map(p => p.playerName).join(', ')}
              </div>
            )}
            {/* Fallback to old system if tracked players not available */}
            {leftDisplayTeam.trackedPlayers.length === 0 && leftProspects.length > 0 &&
              leftProspects.map((prospect) => (
                <div
                  key={`left-${prospect.rank}-${prospect.name}`}
                  className="prospect-line text-xs leading-snug"
                >
                  {prospect.isWatchlist ? (
                    <>
                      Watchlist: {prospect.name}{prospect.jersey ? `, #${prospect.jersey}` : ''}
                      {prospect.injuryStatus === 'OUT' && (
                        <span className="ml-2 text-red-600 font-bold text-sm" title="Out - Injured" style={{ color: '#dc2626' }}>O</span>
                      )}
                    </>
                  ) : (
                    <>
                      {sourceLabel} {prospect.rank}: {prospect.name}{prospect.jersey ? `, #${prospect.jersey}` : ''}
                      {prospect.injuryStatus === 'OUT' && (
                        <span className="ml-2 text-red-600 font-bold text-sm" title="Out - Injured" style={{ color: '#dc2626' }}>O</span>
                      )}
                    </>
                  )}
                </div>
              ))}
          </div>
        </div>

        {/* Right Team (Home) */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {rightDisplayTeam.logo ? (
            <img
              src={rightDisplayTeam.logo}
              alt={rightDisplayTeam.name}
              className={`team-logo mb-2 ${rightDisplayTeam.logo.includes('mega-superbet') ? 'logo-enhanced' : ''}`}
              width={70}
              height={70}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              style={rightDisplayTeam.logo.includes('mega-superbet') ? {
                filter: 'invert(1) drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                backgroundColor: 'transparent'
              } : undefined}
              onError={(e) => {
                // Hide broken images
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="w-[70px] h-[70px] flex items-center justify-center bg-gray-100 rounded mb-2">
              <span className="text-2xl">🏀</span>
            </div>
          )}
          <div className="team-name font-medium mb-1 leading-tight px-1">
            {rightDisplayTeam.name}
          </div>
          <div className="prospects w-full space-y-0.5">
            {/* Render myBoard players */}
            {rightMyBoard.length > 0 &&
              rightMyBoard.map((tracked) => (
                <div
                  key={`right-myboard-${tracked.playerId}`}
                  className="prospect-line text-xs leading-snug"
                >
                  {sourceLabel} {tracked.rank}: {tracked.playerName}
                </div>
              ))}
            {/* Render watchlist players */}
            {rightWatchlist.length > 0 && (
              <div className="prospect-line text-xs leading-snug">
                Watchlist: {rightWatchlist.map(p => p.playerName).join(', ')}
              </div>
            )}
            {/* Fallback to old system if tracked players not available */}
            {rightDisplayTeam.trackedPlayers.length === 0 && rightProspects.length > 0 &&
              rightProspects.map((prospect) => (
                <div
                  key={`right-${prospect.rank}-${prospect.name}`}
                  className="prospect-line text-xs leading-snug"
                >
                  {prospect.isWatchlist ? (
                    <>
                      Watchlist: {prospect.name}{prospect.jersey ? `, #${prospect.jersey}` : ''}
                      {prospect.injuryStatus === 'OUT' && (
                        <span className="ml-2 text-red-600 font-bold text-sm" title="Out - Injured" style={{ color: '#dc2626' }}>O</span>
                      )}
                    </>
                  ) : (
                    <>
                      {sourceLabel} {prospect.rank}: {prospect.name}{prospect.jersey ? `, #${prospect.jersey}` : ''}
                      {prospect.injuryStatus === 'OUT' && (
                        <span className="ml-2 text-red-600 font-bold text-sm" title="Out - Injured" style={{ color: '#dc2626' }}>O</span>
                      )}
                    </>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
});

export default GameCard;
