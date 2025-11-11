'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { GameWithProspects } from '../utils/gameMatching';

export type GamesByDate = Record<string, GameWithProspects[]>;

export function useGames() {
  const [games, setGames] = useState<GamesByDate>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  // One-time data load on mount
  useEffect(() => {
    if (loadedRef.current) return;
    
    let alive = true;
    
    (async () => {
      try {
        const response = await fetch('/api/games/all');
        
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        const gamesByDate = (data.games ?? {}) as GamesByDate;
        
        if (alive) {
          setGames(gamesByDate);
          setLoading(false);
          loadedRef.current = true;
        }
      } catch (err) {
        console.error('Error loading schedule:', err);
        if (alive) {
          setError('Failed to load prospect schedules.');
          setGames({});
          setLoading(false);
        }
      }
    })();
    
    return () => {
      alive = false;
    };
  }, []);

  // Keep fetchGames for backward compatibility but it's now a no-op
  const fetchGames = useCallback(async (_startDate: string, _endDate: string) => {
    // Data is already loaded, no-op
  }, []);

  return { games, loading, error, fetchGames };
}
