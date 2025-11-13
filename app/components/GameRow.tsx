'use client';

import React from 'react';
import type { GameWithProspects } from '../utils/gameMatching';
import { convertTipoffToLocal } from '../utils/timezone';

export type RankingSource = 'espn' | 'myboard';

type Prospect = { name: string; rank?: number; jersey?: string };

const renderPros = (list?: Prospect[], sourceLabel?: string) =>
  !list?.length
    ? null
    : (
      <div className="text-sm leading-tight">
        {list.map((p, i) => (
          <div key={i} className="text-xs text-gray-700 leading-snug">
            {`${sourceLabel || 'ESPN'} ${p.rank ?? '—'}: ${p.name}${p.jersey ? `, #${p.jersey}` : ''}`}
          </div>
        ))}
      </div>
    );

export default function GameRow({ game, rankingSource = 'espn' }: { game: GameWithProspects; rankingSource?: RankingSource }) {
  const sourceLabel = rankingSource === 'myboard' ? 'myBoard' : 'ESPN';
  const awayTeamName = game.awayTeam.displayName || game.awayTeam.name || '';
  const homeTeamName = game.homeTeam.displayName || game.homeTeam.name || '';
  const awayLogo = game.awayTeam.logo;
  const homeLogo = game.homeTeam.logo;
  
  // Get time from tipoff field, converted to local timezone
  const timeLocal = convertTipoffToLocal(game.tipoff, game.date) || '';
  const network = game.tv || '';
  
  // Only show network if it's not TBA/TBD
  const shouldShowNetwork = network && !/^(TBA|TBD)$/i.test(network.trim());

  return (
    <div id={`game-${game.id}`} className="game-row game-entry w-full bg-white">
      <div className="matchup-header">
        <span className="time">{timeLocal || 'TBD'}</span>
        {shouldShowNetwork && <span className="net">{network}</span>}
      </div>

      <div className="matchup-body">
        {/* LEFT COLUMN = AWAY */}
        <div className="team-col">
          {awayLogo ? (
            <img
              className="team-logo"
              src={awayLogo}
              alt={awayTeamName}
              width={100}
              height={100}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="team-logo-placeholder">
              <span>🏀</span>
            </div>
          )}
          <div className="team-name">{awayTeamName}</div>
          {renderPros(game.awayProspects, sourceLabel)}
        </div>

        {/* RIGHT COLUMN = HOME */}
        <div className="team-col">
          {homeLogo ? (
            <img
              className="team-logo"
              src={homeLogo}
              alt={homeTeamName}
              width={100}
              height={100}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="team-logo-placeholder">
              <span>🏀</span>
            </div>
          )}
          <div className="team-name">{homeTeamName}</div>
          {renderPros(game.homeProspects, sourceLabel)}
        </div>
      </div>
    </div>
  );
}

