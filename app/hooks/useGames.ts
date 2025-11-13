'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { GameWithProspects } from '../utils/gameMatching';

export type GamesByDate = Record<string, GameWithProspects[]>;
export type RankingSource = 'espn' | 'myboard';

interface UseGamesOptions {
  source?: RankingSource;
}

export function useGames(options: UseGamesOptions = {}) {
  const { source = 'espn' } = options;
  const [games, setGames] = useState<GamesByDate>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedSourceRef = useRef<RankingSource | null>(null);

  // Load data when source changes or on mount
  useEffect(() => {
    // If we've already loaded this source, skip
    if (loadedSourceRef.current === source && Object.keys(games).length > 0) {
      return;
    }
    
    let alive = true;
    
    (async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/games/all?source=${source}`);
        
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        const gamesByDate = (data.games ?? {}) as GamesByDate;
        
        if (alive) {
          setGames(gamesByDate);
          setLoading(false);
          loadedSourceRef.current = source;
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
  }, [source]);

  // Keep fetchGames for backward compatibility but it's now a no-op
  const fetchGames = useCallback(async (_startDate: string, _endDate: string) => {
    // Data is already loaded, no-op
  }, []);

  return { games, loading, error, fetchGames, source };
}
