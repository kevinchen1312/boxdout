// components/SearchBox.tsx

'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { resolveTeams } from '@/lib/search/resolve';
import { resolveProspects } from '@/lib/search/resolveProspects';
import { tokenize, plain } from '@/lib/search/tokens';
import type { TeamItem } from '@/lib/search/tokens';
import type { ProspectItem } from '@/lib/search/prospectCatalog';
import type { GameWithProspects } from '../utils/gameMatching';

type SearchResult = 
  | { type: 'team'; item: TeamItem }
  | { type: 'prospect'; item: ProspectItem };

export default function SearchBox({
  allGamesFull,               // FULL annotated season list (array of ALL games)
  onPickTeam,                 // (t: TeamItem) => void
  onPickProspect,              // (p: ProspectItem) => void
}: {
  allGamesFull: GameWithProspects[];
  onPickTeam: (t: TeamItem) => void;
  onPickProspect: (p: ProspectItem) => void;
}) {
  // Build team catalog from games - optimized to avoid unnecessary string operations
  const teamCatalog = useMemo(() => {
    const m = new Map<string, string>(); // canon -> label
    for (const g of allGamesFull) {
      const home = g.homeTeam.displayName || g.homeTeam.name || '';
      const away = g.awayTeam.displayName || g.awayTeam.name || '';
      if (home) {
        const homeKey = home.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (!m.has(homeKey)) m.set(homeKey, home);
      }
      if (away) {
        const awayKey = away.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (!m.has(awayKey)) m.set(awayKey, away);
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
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  
  useEffect(() => { 
    const t = setTimeout(() => setDQ(q), 200); 
    return () => clearTimeout(t); 
  }, [q]);

  // Combine team and prospect results - optimized to avoid unnecessary sorting
  const results = useMemo(() => {
    if (!dq.trim()) return [];
    
    const teamResults = resolveTeams(dq, teamCatalog);
    const prospectResults = resolveProspects(dq, prospectCatalog);
    
    // Pre-allocate array with known size
    const combined: SearchResult[] = new Array(teamResults.length + prospectResults.length);
    let idx = 0;
    
    // Add teams first (already sorted by resolveTeams)
    for (let i = 0; i < teamResults.length; i++) {
      combined[idx++] = { type: 'team' as const, item: teamResults[i] };
    }
    
    // Add prospects (already sorted by resolveProspects)
    for (let i = 0; i < prospectResults.length; i++) {
      combined[idx++] = { type: 'prospect' as const, item: prospectResults[i] };
    }
    
    return combined;
  }, [dq, teamCatalog, prospectCatalog]);

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
    const key = `${result.type}-${result.item.canon}`;
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
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        aria-expanded={open}
          aria-controls="search-suggestions"
        aria-autocomplete="list"
        role="combobox"
        placeholder="Search school or player (e.g., Kansas, Dybantsa)…"
        className="border rounded-md px-3 py-1.5"
          aria-label="Search by school or player"
      />
      {open && results.length > 0 && (
        <div
          id="search-suggestions"
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 w-[320px] max-h-72 overflow-auto bg-white border rounded-md shadow"
        >
          {results.slice(0, 10).map((r, i) => {
            const isActive = i === active;
            const key = `${r.type}-${r.item.canon}`;
            return (
              <button
                key={key}
                ref={(el) => (itemRefs.current[key] = el)}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()} // prevent input blur before click
                onClick={() => {
                  if (r.type === 'team') {
                    onPickTeam(r.item);
                  } else {
                    onPickProspect(r.item);
                  }
                  setOpen(false);
                  setQ('');
                }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 ${
                  isActive 
                    ? 'bg-blue-100 border-l-4 border-blue-500 font-semibold' 
                    : 'hover:bg-neutral-50'
                }`}
                style={isActive ? { backgroundColor: '#dbeafe', borderLeft: '4px solid #3b82f6' } : undefined}
              >
                <span>{r.item.label}</span>
                {r.type === 'prospect' && r.item.rank && (
                  <span className="text-xs text-gray-500 ml-auto">#{r.item.rank}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {open && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-[320px] bg-white border rounded-md shadow px-3 py-2 text-sm text-neutral-600">
          No match found. Try a team name (Kansas, KU) or player name (Dybantsa).
        </div>
      )}
    </div>
  );
}
