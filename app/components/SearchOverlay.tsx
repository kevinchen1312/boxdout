'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameWithProspects } from '../utils/gameMatching';
import { buildTeamCatalog } from '@/lib/search/catalog';
import { resolveTeams } from '@/lib/search/resolve';
import { runProspectSearch } from '../search/runProspectSearch';
import type { TeamItem } from '@/lib/search/tokens';
import { plain } from '@/lib/search/tokens';

type ProspectEntry = { key: string; label: string; type: 'prospect'; team?: string };
type Entry = TeamItem | ProspectEntry;

export default function SearchOverlay({
  open,
  onClose,
  gamesByDate,
  onGoTeam,
  onGoProspect,
}: {
  open: boolean;
  onClose: () => void;
  gamesByDate: Record<string, GameWithProspects[]>;
  onGoTeam: (team: string) => void;
  onGoProspect: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) {
      // Reset query when closing
      setQ('');
      setDebounced('');
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Flatten all games from all dates
  const allGames = useMemo(() => {
    const flat: GameWithProspects[] = [];
    for (const games of Object.values(gamesByDate)) {
      flat.push(...games);
    }
    return flat;
  }, [gamesByDate]);

  // Transform games for catalog (with home/away/homeKey/awayKey)
  const allGamesForCatalog = useMemo(() => {
    return allGames.map(g => {
      const home = g.homeTeam.displayName || g.homeTeam.name || '';
      const away = g.awayTeam.displayName || g.awayTeam.name || '';
      return {
        home,
        away,
        homeKey: plain(home),
        awayKey: plain(away),
      };
    });
  }, [allGames]);

  // Build team catalog once (memoized)
  const catalog = useMemo(() => buildTeamCatalog(allGamesForCatalog), [allGamesForCatalog]);

  // Extract prospect names with team information
  const prospectMap = useMemo(() => {
    const map = new Map<string, { name: string; team?: string }>();
    for (const g of allGames) {
      // Check all prospect arrays
      const allProspects = [
        ...(g.prospects || []),
        ...(g.homeProspects || []),
        ...(g.awayProspects || []),
      ];
      for (const p of allProspects) {
        if (p.name) {
          // Store prospect with team info (use teamDisplay or team)
          const existing = map.get(p.name);
          const team = p.teamDisplay || p.team || '';
          // If we already have this prospect, keep the team info if we don't have it yet
          if (!existing || (!existing.team && team)) {
            map.set(p.name, { name: p.name, team });
          }
        }
      }
    }
    return map;
  }, [allGames]);
  
  const prospectNames = useMemo(() => Array.from(prospectMap.keys()), [prospectMap]);

  // Resolve teams using deterministic resolver (no substring matching)
  const teamResults = useMemo(() => resolveTeams(debounced, catalog), [debounced, catalog]);

  // Run prospect search
  const prospectResults = useMemo(
    () => runProspectSearch(debounced, prospectNames),
    [debounced, prospectNames]
  );

  // Combine results (teams first, then prospects)
  const results: Entry[] = useMemo(() => {
    const entries: Entry[] = [];

    // Add team results
    for (const team of teamResults) {
      entries.push(team);
    }

    // Add prospect results with team information
    for (const name of prospectResults) {
      const prospectInfo = prospectMap.get(name);
      entries.push({
        key: `p:${name}`,
        label: name,
        type: 'prospect',
        team: prospectInfo?.team,
      } as ProspectEntry);
    }

    return entries.slice(0, 30);
  }, [teamResults, prospectResults]);

  function onConfirm(e?: React.KeyboardEvent | React.MouseEvent) {
    e?.preventDefault?.();

    // Use deterministic resolver for teams
    const resolvedTeams = resolveTeams(q.trim(), catalog);

    if (resolvedTeams.length === 1) {
      // Single match - go directly
      onPickTeam(resolvedTeams[0]);
      return;
    }

    if (resolvedTeams.length > 1) {
      // Multiple matches - use active selection or first
      const selected = resolvedTeams[active] || resolvedTeams[0];
      onPickTeam(selected);
      return;
    }

    // No team match - try prospect or selected result
    if (results[active] && 'type' in results[active] && results[active].type === 'prospect') {
      onGoProspect(results[active].label);
      onClose();
      return;
    }

    // No result found - do nothing (don't reuse stale state)
  }

  function onPickTeam(team: TeamItem) {
    // Clear stale state first
    onGoTeam(team.label);
    onClose();
  }

  function choose(entry: Entry) {
    if ('type' in entry && entry.type === 'prospect') {
      onGoProspect(entry.label);
    } else {
      // It's a TeamItem
      onPickTeam(entry as TeamItem);
    }
  }

  if (!open) return null;

  // Only render portal on client
  if (typeof window === 'undefined') return null;

  const hasTeamResults = teamResults.length > 0;
  const showDisambiguation = debounced.trim() && teamResults.length > 1;
  const showNoMatch = debounced.trim() && teamResults.length === 0 && prospectResults.length === 0;

  return createPortal(
    <div className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="absolute left-1/2 -translate-x-1/2 top-10 w-[min(90vw,800px)]">
        <div className="rounded-lg bg-white shadow-lg border border-neutral-300 overflow-hidden">
          <div className="p-3 border-b flex items-center gap-2">
            <input
              autoFocus
              className="w-full border border-neutral-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-400"
              placeholder="Search teams or prospects…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, Math.max(0, results.length - 1)));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter') {
                  // Use deterministic resolver - never reuses stale ?team= value
                  onConfirm(e);
                }
              }}
            />
            <button
              className="px-2 py-1 border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            {showNoMatch && (
              <div className="p-4 text-sm text-neutral-600">
                No team match. Try the official name (e.g., "Kansas State") or a known alias (e.g.,
                "KU", "UNC").
              </div>
            )}
            {showDisambiguation && (
              <div className="p-2 border-b bg-neutral-50">
                <div className="text-xs font-semibold text-neutral-600 mb-1">
                  Multiple matches — select one:
                </div>
                {teamResults.slice(0, 8).map((team, i) => (
                  <button
                    key={team.canon}
                    className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-white transition-colors ${
                      i === active ? 'bg-white font-medium' : ''
                    }`}
                    onClick={() => {
                      onPickTeam(team);
                    }}
                  >
                    {team.label}
                  </button>
                ))}
              </div>
            )}
            {results.length > 0 && !showDisambiguation && (
              <div>
                {results.map((r, i) => {
                  const isTeam = !('type' in r);
                  const label = isTeam ? (r as TeamItem).label : (r as ProspectEntry).label;
                  const key = isTeam ? `t:${(r as TeamItem).canon}` : (r as ProspectEntry).key;

                  return (
                    <button
                      key={key}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 transition-colors ${
                        i === active ? 'bg-neutral-100' : ''
                      }`}
                      onClick={() => choose(r)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{label}</div>
                          {!isTeam && (r as ProspectEntry).team && (
                            <div className="text-xs text-neutral-500 mt-0.5">
                              {(r as ProspectEntry).team}
                            </div>
                          )}
                        </div>
                        <div className="text-neutral-500 text-xs">
                          {isTeam ? 'Team' : 'Prospect'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
