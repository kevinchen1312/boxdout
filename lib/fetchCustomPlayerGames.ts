import { supabaseAdmin } from './supabase';
import { format, parseISO } from 'date-fns';
import type { TeamDirectoryEntry } from './loadSchedules';

interface CustomPlayer {
  id: string;
  name: string;
  team: string;
  team_id: string | null;
}

interface GameData {
  game_id: string;
  date: string;
  date_key: string;
  home_team: string;
  away_team: string;
  tipoff?: string | null;
  tv?: string | null;
  venue?: string | null;
  location_type: 'home' | 'away' | 'neutral' | null;
  source: string;
}

const TEAM_DIRECTORY_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?groups=50&limit=500';

let teamDirectoryCache: Map<string, TeamDirectoryEntry> | null = null;

const normalizeForLookup = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const getTeamDirectory = async (): Promise<Map<string, TeamDirectoryEntry>> => {
  if (teamDirectoryCache) {
    return teamDirectoryCache;
  }

  const response = await fetch(TEAM_DIRECTORY_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to load team directory (${response.status})`);
  }

  const data = await response.json();
  const teams: Array<{ team?: any }> =
    data?.sports?.[0]?.leagues?.[0]?.teams ?? [];

  const directory = new Map<string, TeamDirectoryEntry>();

  for (const item of teams) {
    const team = item?.team ?? item;
    if (!team?.id) continue;

    let logoUrl: string | undefined;
    if (team.logos && team.logos.length > 0) {
      logoUrl = team.logos[0].href;
    } else if (team.logo) {
      logoUrl = team.logo;
    } else {
      logoUrl = `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.id}.png`;
    }

    const entry: TeamDirectoryEntry = {
      id: String(team.id),
      displayName: team.displayName ?? '',
      shortDisplayName: team.shortDisplayName ?? '',
      name: team.name ?? '',
      nickname: team.nickname ?? '',
      location: team.location ?? '',
      slug: team.slug ?? '',
      logo: logoUrl,
    };

    const normalized = normalizeForLookup(entry.displayName);
    if (!directory.has(normalized)) {
      directory.set(normalized, entry);
    }
  }

  teamDirectoryCache = directory;
  return directory;
};

const findTeamEntry = async (teamName: string): Promise<TeamDirectoryEntry | null> => {
  const directory = await getTeamDirectory();
  const normalized = normalizeForLookup(teamName);
  
  // Try exact match first
  if (directory.has(normalized)) {
    return directory.get(normalized)!;
  }
  
  // Try partial matches
  for (const [key, entry] of directory.entries()) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return entry;
    }
  }
  
  return null;
};

const fetchGamesFromESPN = async (teamId: string): Promise<GameData[]> => {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}/schedule`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`ESPN API returned ${response.status}`);
    }

    const data = await response.json();
    const events = data.events || [];
    const games: GameData[] = [];

    for (const event of events) {
      const comp = event.competitions?.[0];
      if (!comp || comp.status?.type?.state !== 'pre') continue;

      const competitors = comp.competitors || [];
      const home = competitors.find((c: any) => c.homeAway === 'home');
      const away = competitors.find((c: any) => c.homeAway === 'away');

      if (!home || !away) continue;

      const eventDate = event.date || comp.date || comp.startDate;
      if (!eventDate) continue;

      const date = parseISO(eventDate);
      const dateKey = format(date, 'yyyy-MM-dd');

      // Format tipoff time
      let tipoff: string | null = null;
      if (eventDate) {
        try {
          const tipoffDate = new Date(eventDate);
          const hours = tipoffDate.getHours();
          const minutes = tipoffDate.getMinutes();
          const period = hours >= 12 ? 'PM' : 'AM';
          const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
          tipoff = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period} ET`;
        } catch (e) {
          // Ignore date parsing errors
        }
      }

      // Get TV info
      let tv: string | null = null;
      const broadcasts = comp.broadcasts || [];
      if (broadcasts.length > 0) {
        const networkNames = broadcasts
          .map((b: any) => b.names?.[0] || b.shortName)
          .filter(Boolean);
        if (networkNames.length > 0) {
          tv = networkNames.join(' / ');
        }
      }

      // Get venue
      const venue = comp.venue?.fullName || null;

      // Determine location type (simplified - would need more logic for neutral games)
      const locationType: 'home' | 'away' | 'neutral' | null = null; // Could be enhanced

      const homeTeamName = home.team?.displayName || home.team?.location || '';
      const awayTeamName = away.team?.displayName || away.team?.location || '';

      const gameId = `${dateKey}-${homeTeamName}-vs-${awayTeamName}`;

      games.push({
        game_id: gameId,
        date: dateKey,
        date_key: dateKey,
        home_team: homeTeamName,
        away_team: awayTeamName,
        tipoff,
        tv,
        venue,
        location_type: locationType,
        source: 'espn',
      });
    }

    return games;
  } catch (error) {
    console.error(`Error fetching games from ESPN for team ${teamId}:`, error);
    throw error;
  }
};

const tryAlternativeSources = async (teamName: string): Promise<GameData[]> => {
  // Placeholder for alternative sources
  // Could implement web scraping or other APIs here
  console.log(`Trying alternative sources for team: ${teamName}`);
  
  // For now, return empty array
  // TODO: Implement web scraping or other API integrations
  return [];
};

export async function fetchCustomPlayerGames(
  playerId: string,
  player: CustomPlayer
): Promise<{ success: boolean; gamesCount: number; error?: string }> {
  try {
    // Try ESPN API first
    let teamId = player.team_id;
    let games: GameData[] = [];

    if (!teamId) {
      // Try to find team in directory
      const teamEntry = await findTeamEntry(player.team);
      if (teamEntry) {
        teamId = teamEntry.id;
        // Update player's team_id in database
        await supabaseAdmin
          .from('custom_players')
          .update({ team_id: teamId })
          .eq('id', playerId);
      }
    }

    if (teamId) {
      try {
        games = await fetchGamesFromESPN(teamId);
      } catch (error) {
        console.error(`ESPN API failed for team ${teamId}, trying alternatives...`);
        // Try alternative sources
        games = await tryAlternativeSources(player.team);
      }
    } else {
      // No team ID found, try alternative sources
      games = await tryAlternativeSources(player.team);
    }

    if (games.length === 0) {
      return {
        success: false,
        gamesCount: 0,
        error: 'No games found from any source',
      };
    }

    // Store games in database
    const gamesToInsert = games.map(game => ({
      custom_player_id: playerId,
      ...game,
    }));

    // Use upsert to avoid duplicates
    const { error: insertError } = await supabaseAdmin
      .from('custom_player_games')
      .upsert(gamesToInsert, {
        onConflict: 'custom_player_id,game_id',
      });

    if (insertError) {
      console.error('Error storing games:', insertError);
      return {
        success: false,
        gamesCount: 0,
        error: 'Failed to store games in database',
      };
    }

    return {
      success: true,
      gamesCount: games.length,
    };
  } catch (error) {
    console.error('Error fetching custom player games:', error);
    return {
      success: false,
      gamesCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}





