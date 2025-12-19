// components/SearchBox.tsx

'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { resolveTeams } from '@/lib/search/resolve';
import { resolveProspects } from '@/lib/search/resolveProspects';
import { tokenize, plain } from '@/lib/search/tokens';
import type { TeamItem } from '@/lib/search/tokens';
import type { ProspectItem } from '@/lib/search/prospectCatalog';
import type { GameWithProspects } from '../utils/gameMatching';

type WatchlistPlayer = {
  id: string;
  name: string;
  subtitle: string;
  team?: string;
  league?: string;
  rank?: number;
};

type SearchResult = 
  | { type: 'team'; item: TeamItem }
  | { type: 'prospect'; item: ProspectItem }
  | { type: 'watchlist_player'; item: WatchlistPlayer };

export default function SearchBox({
  allGamesFull,               // FULL annotated season list (array of ALL games)
  onPickTeam,                 // (t: TeamItem) => void
  onPickProspect,              // (p: ProspectItem) => void
}: {
  allGamesFull: GameWithProspects[];
  onPickTeam: (t: TeamItem) => void;
  onPickProspect: (p: ProspectItem) => void;
}) {
  // Build team catalog from games - normalized to handle mascot variations
  const teamCatalog = useMemo(() => {
    // Helper to normalize team name (strip mascot names)
    const normalizeTeamKey = (name: string) => {
      return name
        .toLowerCase()
        .replace(/\s+(tigers|bulldogs|bears|lions|wildcats|eagles|hawks|owls|panthers|warriors|knights|pirates|raiders|cougars|hornets|jayhawks|tar heels|blue devils|crimson tide|fighting irish|wolverines|seminoles|golden gophers|cornhuskers|spartans|nittany lions|mountaineers|boilermakers|hoosiers|flyers|explorers|rams|colonials|revolutionaries|ramblers|monarchs|tribe|shock|royals|cowboys|dragons|dukes|miners|ragin' cajuns|cajuns)$/i, '')
        .replace(/[^a-z0-9]+/g, '')
        .trim();
    };
    
    const m = new Map<string, string>(); // normalized canon -> label (prefer longer/more complete name)
    for (const g of allGamesFull) {
      const home = g.homeTeam.displayName || g.homeTeam.name || '';
      const away = g.awayTeam.displayName || g.awayTeam.name || '';
      if (home) {
        const homeKey = normalizeTeamKey(home);
        // Prefer longer/more complete team names (e.g., "Norfolk State Spartans" over "Norfolk State")
        if (!m.has(homeKey) || home.length > (m.get(homeKey)?.length || 0)) {
          m.set(homeKey, home);
        }
      }
      if (away) {
        const awayKey = normalizeTeamKey(away);
        if (!m.has(awayKey) || away.length > (m.get(awayKey)?.length || 0)) {
          m.set(awayKey, away);
        }
      }
    }
    return [...m.entries()].map(([canon, label]) => ({ 
      canon, 
      label, 
      tokens: tokenize(label) 
    }));
  }, [allGamesFull]);
  
  // Build prospect catalog - optimized single pass without array spreads
  const prospectCatalog = useMemo(() => {
    const m = new Map<string, { name: string; rank?: number }>();
    for (const g of allGamesFull) {
      // Process prospects arrays directly without creating intermediate arrays
      const prospects = g.prospects || [];
      const homeProspects = g.homeProspects || [];
      const awayProspects = g.awayProspects || [];
      
      for (let i = 0; i < prospects.length; i++) {
        const p = prospects[i];
        const canon = plain(p.name);
        if (!m.has(canon) || (p.rank && (!m.get(canon)?.rank || p.rank < m.get(canon)!.rank!))) {
          m.set(canon, { name: p.name, rank: p.rank });
        }
      }
      for (let i = 0; i < homeProspects.length; i++) {
        const p = homeProspects[i];
        const canon = plain(p.name);
        if (!m.has(canon) || (p.rank && (!m.get(canon)?.rank || p.rank < m.get(canon)!.rank!))) {
          m.set(canon, { name: p.name, rank: p.rank });
        }
      }
      for (let i = 0; i < awayProspects.length; i++) {
        const p = awayProspects[i];
        const canon = plain(p.name);
        if (!m.has(canon) || (p.rank && (!m.get(canon)?.rank || p.rank < m.get(canon)!.rank!))) {
          m.set(canon, { name: p.name, rank: p.rank });
        }
      }
    }
    const entries = Array.from(m.entries());
    return entries.map(([canon, { name, rank }]) => ({
      canon,
      label: name,
      tokens: tokenize(name),
      rank,
    }));
  }, [allGamesFull]);
  
  const [q, setQ] = useState('');
  const [dq, setDQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // -1 = none
  const [watchlistResults, setWatchlistResults] = useState<WatchlistPlayer[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  
  useEffect(() => { 
    const t = setTimeout(() => setDQ(q), 200); 
    return () => clearTimeout(t); 
  }, [q]);

  // Fetch watchlist players when query changes
  useEffect(() => {
    if (!dq.trim() || dq.length < 2) {
      setWatchlistResults([]);
      return;
    }

    let cancelled = false;
    const fetchWatchlist = async () => {
      try {
        const res = await fetch(`/api/search/watchlist?q=${encodeURIComponent(dq)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setWatchlistResults(data.results || []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch watchlist players:', err);
          setWatchlistResults([]);
        }
      }
    };

    fetchWatchlist();
    return () => {
      cancelled = true;
    };
  }, [dq]);

  // Combine team, prospect, and watchlist results - deduplicate by name
  const results = useMemo(() => {
    if (!dq.trim()) return [];
    
    const teamResults = resolveTeams(dq, teamCatalog);
    const prospectResults = resolveProspects(dq, prospectCatalog);
    
    const combined: SearchResult[] = [];
    const seenNames = new Set<string>();
    
    // Add teams first (already sorted by resolveTeams)
    for (let i = 0; i < teamResults.length; i++) {
      combined.push({ type: 'team' as const, item: teamResults[i] });
    }
    
    // Add watchlist players first (they have the Watchlist badge, more informative)
    for (let i = 0; i < watchlistResults.length; i++) {
      const name = watchlistResults[i].name.toLowerCase().trim();
      if (!seenNames.has(name)) {
        seenNames.add(name);
        combined.push({ type: 'watchlist_player' as const, item: watchlistResults[i] });
      }
    }
    
    // Add non-watchlist prospects (skip if already added as watchlist player)
    for (let i = 0; i < prospectResults.length; i++) {
      const name = prospectResults[i].label.toLowerCase().trim();
      if (!seenNames.has(name)) {
        seenNames.add(name);
        combined.push({ type: 'prospect' as const, item: prospectResults[i] });
      }
    }
    
    return combined;
  }, [dq, teamCatalog, prospectCatalog, watchlistResults]);

  // Open/close logic
  useEffect(() => {
    const shouldOpen = Boolean(dq);
    setOpen(shouldOpen);
    // Only reset active if we're opening or if results changed significantly
    if (shouldOpen && results.length > 0) {
      // Only reset to 0 if active is invalid (negative or out of bounds)
      setActive((current) => {
        if (current < 0 || current >= results.length) {
          return 0;
        }
        return current; // Keep current active index if still valid
      });
    } else {
      setActive(-1);
    }
  }, [dq, results.length]);

  // Close on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!listRef.current || !inputRef.current) return;
      if (!(e.target instanceof Node)) return;
      // Don't close if clicking on the input or the dropdown
      if (inputRef.current.contains(e.target) || listRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Keep the active item visible
  useEffect(() => {
    if (active < 0) return;
    const result = results[active];
    if (!result) return;
    const itemKey = result.type === 'watchlist_player' ? result.item.id : result.item.canon;
    const key = `${result.type}-${itemKey}`;
    const cur = itemRefs.current[key];
    cur?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    console.log('onKeyDown called:', e.key, 'open:', open, 'results.length:', results.length, 'active:', active);
    
    // Handle Tab keys - redirect to arrow key behavior when dropdown is open
    if (e.key === 'Tab') {
      if (open && results.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          // Shift+Tab = ArrowUp
          setActive((i) => {
            const newIndex = Math.max(i - 1, 0);
            console.log('Tab (Shift):', i, '->', newIndex);
            return newIndex;
          });
        } else {
          // Tab = ArrowDown
          setActive((i) => {
            const newIndex = Math.min(i + 1, results.length - 1);
            console.log('Tab:', i, '->', newIndex);
            return newIndex;
          });
        }
        // Keep input focused
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      // If dropdown is closed, let Tab work normally (don't preventDefault)
      return;
    }
    
    // Handle arrow keys and other navigation when dropdown is open
    if (!open || !results.length) {
      // Allow other keys to work normally when dropdown is closed
      return;
    }
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setActive((i) => {
        const newIndex = Math.min(i + 1, results.length - 1);
        console.log('ArrowDown:', i, '->', newIndex, 'results.length:', results.length);
        return newIndex;
      });
      // Keep input focused
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setActive((i) => {
        const newIndex = Math.max(i - 1, 0);
        console.log('ArrowUp:', i, '->', newIndex, 'results.length:', results.length);
        return newIndex;
      });
      // Keep input focused
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (e.key === 'Enter') {
      if (active >= 0 && active < results.length) {
        e.preventDefault();
        e.stopPropagation();
        const selected = results[active];
        if (selected.type === 'team') {
          onPickTeam(selected.item);
        } else if (selected.type === 'watchlist_player') {
          // Navigate to prospect view (like regular prospects)
          onPickProspect({ 
            canon: plain(selected.item.name), 
            label: selected.item.name, 
            tokens: tokenize(selected.item.name), 
            rank: selected.item.rank 
          });
        } else {
          onPickProspect(selected.item);
        }
        setOpen(false);
        setQ('');
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  const confirm = (e?: React.FormEvent) => {
    e?.preventDefault?.();
    if (!results.length) return;
    const pick = active >= 0 ? results[active] : (results.length === 1 ? results[0] : null);
    if (pick) {
      if (pick.type === 'team') {
        onPickTeam(pick.item);
      } else if (pick.type === 'watchlist_player') {
        // Navigate to prospect view (like regular prospects)
        onPickProspect({ 
          canon: plain(pick.item.name), 
          label: pick.item.name, 
          tokens: tokenize(pick.item.name), 
          rank: pick.item.rank 
        });
      } else {
        onPickProspect(pick.item);
      }
      setOpen(false);
      setQ('');
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        aria-expanded={open}
          aria-controls="search-suggestions"
        aria-autocomplete="list"
        role="combobox"
        placeholder="Search school or player (e.g., Kansas, Dybantsa)…"
        className="planner-search-input"
          aria-label="Search by school or player"
      />
      {open && results.length > 0 && (
        <div
          id="search-suggestions"
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 w-[320px] max-h-72 overflow-auto"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-small)', boxShadow: 'var(--shadow-soft)' }}
        >
          {results.slice(0, 10).map((r, i) => {
            const isActive = i === active;
            const key = r.type === 'watchlist_player' 
              ? `watchlist-${r.item.id}` 
              : `${r.type}-${r.item.canon}`;
            return (
              <button
                key={key}
                ref={(el) => { itemRefs.current[key] = el; }}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => e.preventDefault()} // prevent input blur before click
                onClick={() => {
                  if (r.type === 'team') {
                    onPickTeam(r.item);
                  } else if (r.type === 'watchlist_player') {
                    // Navigate to prospect view (like regular prospects)
                    onPickProspect({ 
                      canon: plain(r.item.name), 
                      label: r.item.name, 
                      tokens: tokenize(r.item.name), 
                      rank: r.item.rank 
                    });
                  } else {
                    onPickProspect(r.item);
                  }
                  setOpen(false);
                  setQ('');
                }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 ${
                  isActive 
                    ? 'font-semibold' 
                    : ''
                }`}
                style={isActive ? { backgroundColor: 'rgba(138, 43, 226, 0.1)', borderLeft: '3px solid var(--accent)' } : { backgroundColor: 'transparent' }}
                onMouseEnter={(e) => {
                  setActive(i);
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'rgba(148, 163, 184, 0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate">{r.type === 'watchlist_player' ? r.item.name : r.item.label}</span>
                    {r.type === 'watchlist_player' && (
                      <span 
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ 
                          backgroundColor: 'rgba(138, 43, 226, 0.1)', 
                          color: 'var(--accent)',
                          border: '1px solid rgba(138, 43, 226, 0.2)',
                          fontSize: '10px',
                          fontWeight: '500',
                          flexShrink: 0,
                        }}
                      >
                        Watchlist
                      </span>
                    )}
                  </div>
                  {r.type === 'watchlist_player' && r.item.subtitle && (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {r.item.subtitle}
                    </div>
                  )}
                </div>
                {(r.type === 'prospect' && r.item.rank) && (
                  <span className="meta-text text-xs ml-auto flex-shrink-0">#{r.item.rank}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {open && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-[320px] px-3 py-2 text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-small)', boxShadow: 'var(--shadow-soft)', color: 'var(--text-meta)' }}>
          No match found. Try a team name (Kansas, KU) or player name (Dybantsa).
        </div>
      )}
    </div>
  );
}
