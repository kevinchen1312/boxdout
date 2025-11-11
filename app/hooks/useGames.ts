'use client';

import { useState, useCallback } from 'react';
import type { GameWithProspects } from '../utils/gameMatching';

export function useGames() {
  const [games, setGames] = useState<Record<string, GameWithProspects[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGames = useCallback(async (startDate: string, endDate: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/games/range?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      const gamesByDate = (data.games ?? {}) as Record<string, GameWithProspects[]>;

      setGames(gamesByDate);
    } catch (err) {
      console.error('Error loading schedule:', err);
      setError('Failed to load prospect schedules.');
      setGames({});
    } finally {
      setLoading(false);
    }
  }, []);

  return { games, loading, error, fetchGames };
}
