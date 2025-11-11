'use client';

import React, { useMemo, useState, useEffect } from 'react';
import type { GameWithProspects } from '../utils/gameMatching';

type Props = {
  gamesByDate: Record<string, GameWithProspects[]>;
  onSelectDate: (d: Date) => void;
  parseLocalYMD: (s: string) => Date;
  onSelectGame?: (gameId: string) => void;
  onSelectTeam?: (teamName: string) => void;
};

const norm = (s: string) =>
  (s || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export default function SearchSchedules({
  gamesByDate,
  onSelectDate,
  parseLocalYMD,
  onSelectGame,
  onSelectTeam,
}: Props) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const idx = useMemo(() => {
    // Flatten once for simple scanning
    const rows: Array<{
      key: string;
      game: GameWithProspects;
      hay: string;
      matchProspects: string[];
    }> = [];

    for (const [dateKey, games] of Object.entries(gamesByDate)) {
      for (const g of games) {
        const pNames = (g.prospects || []).map((p) => p.name).filter(Boolean);
        const homeName = g.homeTeam.displayName || g.homeTeam.name || '';
        const awayName = g.awayTeam.displayName || g.awayTeam.name || '';
        const hay = norm([homeName, awayName, ...pNames].join(' '));

        rows.push({
          key: `${dateKey}:${g.id}`,
          game: g,
          hay,
          matchProspects: pNames,
        });
      }
    }

    return rows;
  }, [gamesByDate]);

  const results = useMemo(() => {
    if (!debounced.trim()) return [];

    const n = norm(debounced);
    const out: typeof idx = [];

    for (const r of idx) {
      if (r.hay.includes(n)) out.push(r);
      if (out.length >= 20) break; // cap
    }

    return out;
  }, [debounced, idx]);

  return (
    <div
      className="search-wrap"
      style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 320 }}
    >
      <input
        type="search"
        placeholder="Search by school or prospect…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            // Extract team name from first result and select it (no date navigation)
            const r = results[active];
            const homeName = r.game.homeTeam.displayName || r.game.homeTeam.name || '';
            const awayName = r.game.awayTeam.displayName || r.game.awayTeam.name || '';
            // Try to match query to team name
            const queryLower = debounced.toLowerCase();
            if (homeName.toLowerCase().includes(queryLower)) {
              onSelectTeam?.(homeName);
            } else if (awayName.toLowerCase().includes(queryLower)) {
              onSelectTeam?.(awayName);
            } else if (homeName) {
              onSelectTeam?.(homeName);
            } else if (awayName) {
              onSelectTeam?.(awayName);
            }
          }
        }}
        aria-label="Search schedules"
        className="border border-neutral-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-400"
      />

      {false && debounced && (
        <div className="results border border-neutral-300 rounded-md max-h-80 overflow-auto bg-white shadow-lg">
          {results.length === 0 && (
            <div className="px-3 py-2 text-sm text-neutral-500">No matches</div>
          )}
          {results.map((r, i) => {
            const homeName = r.game.homeTeam.displayName || r.game.homeTeam.name;
            const awayName = r.game.awayTeam.displayName || r.game.awayTeam.name;
            const dateKey = r.game.dateKey || r.game.date.substring(0, 10);

            return (
              <button
                key={r.key}
                onClick={() => {
                  // On click, select team instead of navigating to date
                  const homeName = r.game.homeTeam.displayName || r.game.homeTeam.name || '';
                  const awayName = r.game.awayTeam.displayName || r.game.awayTeam.name || '';
                  const queryLower = debounced.toLowerCase();
                  if (homeName.toLowerCase().includes(queryLower)) {
                    onSelectTeam?.(homeName);
                  } else if (awayName.toLowerCase().includes(queryLower)) {
                    onSelectTeam?.(awayName);
                  } else if (homeName) {
                    onSelectTeam?.(homeName);
                  } else if (awayName) {
                    onSelectTeam?.(awayName);
                  }
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 transition-colors ${
                  i === active ? 'bg-neutral-100' : ''
                }`}
              >
                <div className="font-medium">
                  <button
                    className="underline hover:no-underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTeam?.(awayName);
                    }}
                  >
                    {awayName}
                  </button>
                  {' @ '}
                  <button
                    className="underline hover:no-underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTeam?.(homeName);
                    }}
                  >
                    {homeName}
                  </button>
                </div>
                <div className="text-neutral-600">
                  {dateKey}
                  {r.game.tipoff ? ` • ${r.game.tipoff}` : ''}
                  {r.game.tv ? ` • ${r.game.tv}` : ''}
                </div>
                {r.matchProspects?.length ? (
                  <div className="text-neutral-500 truncate">
                    Prospects: {r.matchProspects.join(', ')}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

