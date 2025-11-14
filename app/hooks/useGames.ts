'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { GameWithProspects } from '../utils/gameMatching';
import { getCachedData, setCachedData, clearExpiredCache } from '../utils/browserCache';

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
  const [loadingMessage, setLoadingMessage] = useState<string>('Loading schedules...');
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
        console.time('[useGames] Total load time');
        setLoading(true);
        setLoadingMessage('Checking cache...');
        
        // Clear expired cache entries on mount (async, non-blocking)
        setTimeout(() => clearExpiredCache(), 0);
        
        // Try to get from cache first
        const cacheKey = `games_all_${source}`;
        const cached = getCachedData<GamesByDate>(cacheKey);
        
        if (cached && alive) {
          console.log('[useGames] Loaded from cache');
          setLoadingMessage('Loaded from cache ✓');
          setGames(cached);
          setLoading(false);
          loadedSourceRef.current = source;
          console.timeEnd('[useGames] Total load time');
          
          // Revalidate in background (fetch fresh data silently)
          fetch(`/api/games/all?source=${source}`)
            .then(response => response.json())
            .then(data => {
              const gamesByDate = (data.games ?? {}) as GamesByDate;
              setCachedData(cacheKey, gamesByDate, 5 * 60 * 1000); // Cache for 5 minutes
              if (alive) {
                setGames(gamesByDate);
              }
            })
            .catch(err => console.warn('[useGames] Background revalidation failed:', err));
          
          return;
        }
        
        // No cache, fetch from API
        setLoadingMessage('Loading schedules from server...');
        console.time('[useGames] API fetch time');
        const response = await fetch(`/api/games/all?source=${source}`);
        console.timeEnd('[useGames] API fetch time');
        
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        
        setLoadingMessage('Processing game data...');
        console.time('[useGames] JSON parse time');
        const data = await response.json();
        console.timeEnd('[useGames] JSON parse time');
        const gamesByDate = (data.games ?? {}) as GamesByDate;
        
        if (alive) {
          setGames(gamesByDate);
          setLoading(false);
          setLoadingMessage('Loaded successfully ✓');
          loadedSourceRef.current = source;
          
          // Store in cache for next time
          setCachedData(cacheKey, gamesByDate, 5 * 60 * 1000); // Cache for 5 minutes
        }
        
        console.timeEnd('[useGames] Total load time');
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

  return { games, loading, error, loadingMessage, fetchGames, source };
}
