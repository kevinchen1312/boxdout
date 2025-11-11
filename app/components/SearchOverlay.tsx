'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameWithProspects } from '../utils/gameMatching';
import { canonTeam, canonTeamInput, plain } from '../utils/normalize';

type TeamEntry = { key: string; label: string; canon: string; type: 'team' };
type ProspectEntry = { key: string; label: string; type: 'prospect' };
type Entry = TeamEntry | ProspectEntry;

const norm = (s: string) =>
  (s || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

// Split into words for whole-word checks (keeps letters/numbers only)
const words = (s: string) => norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);

// Scoring function for teams that prioritizes Kansas over Kansas State over Arkansas
function scoreTeam(qRaw: string, label: string, canonKey: string): readonly number[] {
  const q = norm(qRaw);
  const L = norm(label);
  const w = words(label);

  const exact = Number(L === q);
  const starts = Number(L.startsWith(q));
  const whole = Number(w.includes(q));
  const substr = Number(L.includes(q));
  const len = -Math.abs(L.length - q.length);

  // Anti-Arkansas penalty when searching "kansas"
  const antiArk = (q === 'kansas' && /arkansas/.test(L)) ? -100 : 0;

  // Direct boost if alias resolution matches "kansas"
  const qCanon = canonTeamInput(qRaw);
  const canonBoost = Number(qCanon === plain('Kansas') && canonKey === plain('Kansas'));

  return [canonBoost, exact, starts, whole, substr, antiArk, len] as const;
}

// Scoring function for prospects
function scoreProspect(qRaw: string, label: string): readonly number[] {
  const q = norm(qRaw);
  const L = norm(label);
  const w = words(label);

  const exact = Number(L === q);
  const starts = Number(L.startsWith(q));
  const wholeWord = Number(w.includes(q));
  const substr = L.includes(q) ? 1 : 0;
  const lenPenalty = -Math.abs(L.length - q.length);

  return [exact, starts, wholeWord, substr, lenPenalty] as const;
}

// Scoring function that prioritizes whole-word matches
function scoreEntry(qRaw: string, entry: Entry): readonly number[] {
  if (entry.type === 'team') {
    return scoreTeam(qRaw, entry.label, entry.canon);
  } else {
    const prospectScore = scoreProspect(qRaw, entry.label);
    // Add type boost for teams (0 for prospects)
    return [0, ...prospectScore] as const;
  }
}

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
    const t = setTimeout(() => setDebounced(q), 150);
    return () => clearTimeout(t);
  }, [q]);

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

  // Build team prospects index from games (extract teams that have prospects)
  const teamProsIndex = useMemo(() => {
    const map = new Map<string, Array<{ name: string; rank?: number; jersey?: string; team: string }>>();
    
    for (const g of allGames) {
      const home = g.homeTeam.displayName || g.homeTeam.name || '';
      const away = g.awayTeam.displayName || g.awayTeam.name || '';
      const homeKey = canonTeam(home);
      const awayKey = canonTeam(away);
      const homePros = g.homeProspects || [];
      const awayPros = g.awayProspects || [];
      
      // Add home prospects
      for (const hp of homePros) {
        if (!map.has(homeKey)) map.set(homeKey, []);
        const existing = map.get(homeKey)!;
        if (!existing.some(ep => ep.name === hp.name)) {
          existing.push({ name: hp.name, rank: hp.rank, jersey: hp.jersey, team: home });
        }
      }
      
      // Add away prospects
      for (const ap of awayPros) {
        if (!map.has(awayKey)) map.set(awayKey, []);
        const existing = map.get(awayKey)!;
        if (!existing.some(ep => ep.name === ap.name)) {
          existing.push({ name: ap.name, rank: ap.rank, jersey: ap.jersey, team: away });
        }
      }
    }
    
    return map;
  }, [allGames]);

  // Build index from ALL annotated data
  const index: Entry[] = useMemo(() => {
    if (!open) return [];

    const rows: Entry[] = [];
    const teamSet = new Set<string>();
    const teamLabelByCanon = new Map<string, string>();

    // 1) teams from your canonical TEAM→Prospects map
    for (const [canonKey, plist] of teamProsIndex.entries()) {
      const label = plist?.[0]?.team ?? canonKey; // best label we have
      teamSet.add(canonKey);
      if (!teamLabelByCanon.has(canonKey)) teamLabelByCanon.set(canonKey, label);
    }

    // 2) teams from ALL games (not just the current week)
    for (const g of allGames) {
      const home = g.homeTeam.displayName || g.homeTeam.name || '';
      const away = g.awayTeam.displayName || g.awayTeam.name || '';
      const homeKey = canonTeam(home);
      const awayKey = canonTeam(away);
      
      teamSet.add(homeKey);
      teamSet.add(awayKey);
      
      if (!teamLabelByCanon.has(homeKey)) teamLabelByCanon.set(homeKey, home);
      if (!teamLabelByCanon.has(awayKey)) teamLabelByCanon.set(awayKey, away);
    }

    // materialize team entries
    for (const canonKey of teamSet) {
      const label = teamLabelByCanon.get(canonKey) ?? canonKey;
      rows.push({ key: `t:${canonKey}`, label, canon: canonKey, type: 'team' });
    }

    // prospects (optional, keep if you support prospect view)
    const prospectNames = new Set<string>();
    for (const g of allGames) {
      for (const p of g.prospects || []) {
        if (p.name) prospectNames.add(p.name);
      }
    }
    for (const name of prospectNames) {
      rows.push({ key: `p:${name}`, label: name, type: 'prospect' });
    }

    return rows;
  }, [open, allGames, teamProsIndex]);

  const results = useMemo(() => {
    if (!debounced.trim()) return [];

    const scored = index
      .map((e) => ({ e, s: scoreEntry(debounced, e) }))
      .filter((x) => {
        // For teams: check canonBoost, exact, starts, whole, substr (indices 0-4)
        // For prospects: check exact, starts, wholeWord, substr (indices 1-4)
        if (x.e.type === 'team') {
          return x.s[0] || x.s[1] || x.s[2] || x.s[3] || x.s[4]; // any match
        } else {
          return x.s[1] || x.s[2] || x.s[3] || x.s[4]; // any match (skip canonBoost)
        }
      })
      .sort((a, b) => {
        // sort by tuple, descending
        for (let i = 0; i < a.s.length; i++) {
          const d = b.s[i] - a.s[i];
          if (d) return d;
        }
        // tie-breaker: alphabetical
        return a.e.label.localeCompare(b.e.label);
      })
      .slice(0, 30)
      .map((x) => x.e);

    return scored;
  }, [debounced, index]);

  if (!open) return null;

  // Only render portal on client
  if (typeof window === 'undefined') return null;

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
                } else if (e.key === 'Enter' && results[active]) {
                  const r = results[active];
                  // IMPORTANT: do NOT jump to "next game".
                  // Switch to Team/Prospect view that replaces daily list.
                  if (r.type === 'team') {
                    onGoTeam(r.label);
                  } else {
                    onGoProspect(r.label);
                  }
                  onClose();
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
            {results.length === 0 ? (
              <div className="p-4 text-sm text-neutral-600">No matches</div>
            ) : (
              results.map((r, i) => (
                <button
                  key={r.key}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 transition-colors ${
                    i === active ? 'bg-neutral-100' : ''
                  }`}
                  onClick={() => {
                    if (r.type === 'team') {
                      onGoTeam(r.label);
                    } else {
                      onGoProspect(r.label);
                    }
                    onClose();
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{r.label}</div>
                    <div className="text-neutral-500 text-xs">
                      {r.type === 'team' ? 'Team' : 'Prospect'}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
