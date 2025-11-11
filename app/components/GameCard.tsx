'use client';

import { useState, memo } from 'react';
import { GameWithProspects } from '../utils/gameMatching';
import { format, parseISO } from 'date-fns';

interface GameCardProps {
  game: GameWithProspects;
  compact?: boolean;
}

const deriveTipoff = (game: GameWithProspects) => {
  if (game.tipoff) {
    return game.tipoff;
  }

  if (!game.date) {
    return '';
  }

  try {
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

const GameCard = memo(function GameCard({ game, compact = false }: GameCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const tipoffText = deriveTipoff(game) || 'TBD';
  const matchupLabel = buildMatchupLabel(game);
  const highlightLabel = getHighlightLabel(game);

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
    <div id={`game-${game.id}`} className="game-row w-full bg-white">
      {/* Time and Network - top left and top right */}
      <div className="flex items-center justify-between px-[10px] pt-3 pb-2">
        <span className="text-sm font-medium text-gray-900 text-left">{tipoffText}</span>
        <span className="text-sm font-medium text-gray-700 text-right">
          {game.tv || 'TBA'}
        </span>
      </div>

      {/* School logos side-by-side, centered */}
      <div className="flex items-center justify-center gap-3 px-4 pb-3">
        {/* Away Team */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {awayLogo ? (
            <img
              src={awayLogo}
              alt={awayTeamName}
              className="team-logo mb-2"
              width={100}
              height={100}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
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
                  ESPN {prospect.rank}: {prospect.name}
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
              className="team-logo mb-2"
              width={100}
              height={100}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
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
                  ESPN {prospect.rank}: {prospect.name}
                  {prospect.jersey ? `, #${prospect.jersey}` : ''}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
});

export default GameCard;
