'use client';

import React from 'react';
import type { GameWithProspects } from '../utils/gameMatching';
import { convertTipoffToLocal } from '../utils/timezone';

type Prospect = { name: string; rank?: number; jersey?: string };

const renderPros = (list?: Prospect[]) =>
  !list?.length
    ? null
    : (
      <div className="text-sm leading-tight">
        {list.map((p, i) => (
          <div key={i} className="text-xs text-gray-700 leading-snug">
            {`ESPN ${p.rank ?? '—'}: ${p.name}${p.jersey ? `, #${p.jersey}` : ''}`}
          </div>
        ))}
      </div>
    );

export default function GameRow({ game }: { game: GameWithProspects }) {
  const awayTeamName = game.awayTeam.displayName || game.awayTeam.name || '';
  const homeTeamName = game.homeTeam.displayName || game.homeTeam.name || '';
  const awayLogo = game.awayTeam.logo;
  const homeLogo = game.homeTeam.logo;
  
  // Get time from tipoff field, converted to local timezone
  const timeLocal = convertTipoffToLocal(game.tipoff, game.date) || '';
  const network = game.tv || 'TBA';

  return (
    <div id={`game-${game.id}`} className="game-row game-entry w-full bg-white">
      <div className="matchup-header">
        <span className="time">{timeLocal || 'TBD'}</span>
        <span className="net">{network}</span>
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
          {renderPros(game.awayProspects)}
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
          {renderPros(game.homeProspects)}
        </div>
      </div>
    </div>
  );
}

