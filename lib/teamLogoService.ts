import { supabaseAdmin } from './supabase';

export interface TeamLogo {
  id: number;
  team_id: number;
  team_name: string;
  logo_url: string;
  source: 'api-basketball' | 'espn' | 'manual';
  league_id: number | null;
  league_name: string | null;
  last_updated: string;
}

const PLACEHOLDER_LOGO = '/basketball-placeholder.png';

/**
 * Get team logo from cache or fetch from APIs
 * Priority: cached DB → provided URL → placeholder
 * 
 * @param teamId - Team ID (API-Basketball or ESPN)
 * @param teamName - Team display name
 * @param providedLogoUrl - Logo URL from API response (optional)
 * @param source - Source of the logo ('api-basketball' or 'espn')
 * @returns Logo URL
 */
export async function getTeamLogo(
  teamId: number | null,
  teamName: string,
  providedLogoUrl?: string,
  source: 'api-basketball' | 'espn' = 'api-basketball'
): Promise<string> {
  try {
    // If we have a teamId, check cache first
    if (teamId) {
      const cached = await getCachedTeamLogo(teamId, source);
      if (cached && cached.logo_url) {
        return cached.logo_url;
      }
    }

    // If no cached logo but we have a provided URL, cache it and return
    if (providedLogoUrl && teamId) {
      await cacheTeamLogo(teamId, teamName, providedLogoUrl, source);
      return providedLogoUrl;
    }

    // Return provided URL if available (even without caching)
    if (providedLogoUrl) {
      return providedLogoUrl;
    }

    // Try to find by team name (case-insensitive)
    if (teamName) {
      const logoByName = await getTeamLogoByName(teamName);
      if (logoByName) {
        return logoByName.logo_url;
      }
    }

    // Fall back to placeholder
    return PLACEHOLDER_LOGO;
  } catch (error) {
    console.error('[TeamLogoService] Error getting team logo:', error);
    // On error, return provided URL or placeholder
    return providedLogoUrl || PLACEHOLDER_LOGO;
  }
}

/**
 * Get cached team logo from database by team ID
 */
async function getCachedTeamLogo(
  teamId: number,
  source: 'api-basketball' | 'espn'
): Promise<TeamLogo | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('team_logos')
      .select('*')
      .eq('team_id', teamId)
      .eq('source', source)
      .maybeSingle();

    if (error) {
      console.error('[TeamLogoService] Error fetching cached logo:', error);
      return null;
    }

    return data as TeamLogo | null;
  } catch (error) {
    console.error('[TeamLogoService] Exception fetching cached logo:', error);
    return null;
  }
}

/**
 * Get team logo by team name (case-insensitive search)
 */
async function getTeamLogoByName(teamName: string): Promise<TeamLogo | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('team_logos')
      .select('*')
      .ilike('team_name', teamName)
      .order('last_updated', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[TeamLogoService] Error fetching logo by name:', error);
      return null;
    }

    return data as TeamLogo | null;
  } catch (error) {
    console.error('[TeamLogoService] Exception fetching logo by name:', error);
    return null;
  }
}

/**
 * Cache team logo to database
 * 
 * @param teamId - Team ID
 * @param teamName - Team display name
 * @param logoUrl - Logo URL to cache
 * @param source - Source of the logo
 * @param leagueId - Optional league ID
 * @param leagueName - Optional league name
 * @returns Success status
 */
export async function cacheTeamLogo(
  teamId: number,
  teamName: string,
  logoUrl: string,
  source: 'api-basketball' | 'espn' | 'manual',
  leagueId?: number | null,
  leagueName?: string | null
): Promise<boolean> {
  try {
    // Skip caching if no logo URL provided
    if (!logoUrl || logoUrl === PLACEHOLDER_LOGO) {
      return false;
    }

    // Skip caching if teamId is invalid
    if (!teamId || teamId <= 0) {
      console.warn('[TeamLogoService] Invalid team ID, skipping cache');
      return false;
    }

    const { error } = await supabaseAdmin
      .from('team_logos')
      .upsert(
        {
          team_id: teamId,
          team_name: teamName,
          logo_url: logoUrl,
          source,
          league_id: leagueId || null,
          league_name: leagueName || null,
          last_updated: new Date().toISOString(),
        },
        {
          onConflict: 'team_id,source',
          ignoreDuplicates: false, // Update if exists
        }
      );

    if (error) {
      console.error('[TeamLogoService] Error caching logo:', error);
      return false;
    }

    console.log(`[TeamLogoService] ✓ Cached logo for ${teamName} (ID: ${teamId}, source: ${source})`);
    return true;
  } catch (error) {
    console.error('[TeamLogoService] Exception caching logo:', error);
    return false;
  }
}

/**
 * Bulk cache team logos (for batch operations)
 * 
 * @param logos - Array of team logo data
 * @returns Number of successfully cached logos
 */
export async function bulkCacheTeamLogos(
  logos: Array<{
    teamId: number;
    teamName: string;
    logoUrl: string;
    source: 'api-basketball' | 'espn' | 'manual';
    leagueId?: number | null;
    leagueName?: string | null;
  }>
): Promise<number> {
  try {
    // Filter out invalid entries
    const validLogos = logos.filter(
      (logo) => logo.teamId > 0 && logo.logoUrl && logo.logoUrl !== PLACEHOLDER_LOGO
    );

    if (validLogos.length === 0) {
      return 0;
    }

    const { error } = await supabaseAdmin
      .from('team_logos')
      .upsert(
        validLogos.map((logo) => ({
          team_id: logo.teamId,
          team_name: logo.teamName,
          logo_url: logo.logoUrl,
          source: logo.source,
          league_id: logo.leagueId || null,
          league_name: logo.leagueName || null,
          last_updated: new Date().toISOString(),
        })),
        {
          onConflict: 'team_id,source',
          ignoreDuplicates: false,
        }
      );

    if (error) {
      console.error('[TeamLogoService] Error bulk caching logos:', error);
      return 0;
    }

    console.log(`[TeamLogoService] ✓ Bulk cached ${validLogos.length} team logos`);
    return validLogos.length;
  } catch (error) {
    console.error('[TeamLogoService] Exception bulk caching logos:', error);
    return 0;
  }
}

/**
 * Fetch logo from API-Basketball teams endpoint
 * Note: This requires a separate API call and should be used sparingly
 * 
 * @param teamId - API-Basketball team ID
 * @returns Logo URL or null
 */
export async function fetchLogoFromApiBasketball(teamId: number): Promise<string | null> {
  try {
    const apiKey = process.env.API_BASKETBALL_KEY;
    if (!apiKey) {
      console.warn('[TeamLogoService] API_BASKETBALL_KEY not configured');
      return null;
    }

    const url = `https://v1.basketball.api-sports.io/teams?id=${teamId}`;
    const response = await fetch(url, {
      headers: {
        'x-apisports-key': apiKey,
      },
    });

    if (!response.ok) {
      console.error('[TeamLogoService] API-Basketball request failed:', response.status);
      return null;
    }

    const data = await response.json();
    const team = data?.response?.[0];
    
    if (team?.logo) {
      return team.logo;
    }

    return null;
  } catch (error) {
    console.error('[TeamLogoService] Error fetching logo from API-Basketball:', error);
    return null;
  }
}

/**
 * Get all cached logos (for admin/debugging)
 */
export async function getAllCachedLogos(limit: number = 100): Promise<TeamLogo[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('team_logos')
      .select('*')
      .order('last_updated', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[TeamLogoService] Error fetching all logos:', error);
      return [];
    }

    return (data as TeamLogo[]) || [];
  } catch (error) {
    console.error('[TeamLogoService] Exception fetching all logos:', error);
    return [];
  }
}




