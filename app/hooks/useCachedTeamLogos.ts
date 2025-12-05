import { useEffect, useState } from 'react';

interface TeamLogoCache {
  [teamName: string]: string | null;
}

/**
 * Hook to fetch and cache team logos from the database
 * This is a fallback for games that don't have logos embedded
 * 
 * Usage:
 * const logos = useCachedTeamLogos([
 *   { name: 'Valencia Basket', id: null },
 *   { name: 'Real Madrid', id: null }
 * ]);
 */
export function useCachedTeamLogos(
  teams: Array<{ name: string; id?: number | null }>
): TeamLogoCache {
  const [logoCache, setLogoCache] = useState<TeamLogoCache>({});

  useEffect(() => {
    // Skip if no teams to fetch
    if (teams.length === 0) {
      return;
    }

    // Only fetch for teams we don't have cached yet
    const teamsToFetch = teams.filter(team => !(team.name in logoCache));
    
    if (teamsToFetch.length === 0) {
      return;
    }

    let cancelled = false;

    // Fetch logos from database
    async function fetchLogos() {
      try {
        // Note: This would require a new API endpoint to fetch logos by team name
        // For now, this is a placeholder for future enhancement
        // const response = await fetch('/api/team-logos/batch', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ teams: teamsToFetch }),
        // });
        // const data = await response.json();
        
        // For now, just mark as fetched with null
        if (!cancelled) {
          const newCache: TeamLogoCache = { ...logoCache };
          teamsToFetch.forEach(team => {
            newCache[team.name] = null; // Placeholder until API is implemented
          });
          setLogoCache(newCache);
        }
      } catch (error) {
        console.error('[useCachedTeamLogos] Error fetching logos:', error);
        // On error, mark as attempted (null)
        if (!cancelled) {
          const newCache: TeamLogoCache = { ...logoCache };
          teamsToFetch.forEach(team => {
            newCache[team.name] = null;
          });
          setLogoCache(newCache);
        }
      }
    }

    fetchLogos();

    return () => {
      cancelled = true;
    };
  }, [teams, logoCache]);

  return logoCache;
}

/**
 * Get cached logo for a single team
 * This is a simpler version for single team lookups
 */
export function getCachedTeamLogo(
  teamName: string,
  existingLogo?: string | null
): string | null {
  // If we already have a logo, use it
  if (existingLogo) {
    return existingLogo;
  }

  // Otherwise, return null (will show placeholder)
  // Future: Could do a sync lookup from a cache here
  return null;
}




