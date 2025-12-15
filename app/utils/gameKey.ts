'use client';

/**
 * Normalizes team name for consistent game key generation
 * This matches the server-side normalizeTeamNameForKey function
 */
export function normalizeTeamNameForKey(name: string): string {
  let normalized = name
    .replace(/\s+(spartans|bears|lions|tigers|wildcats|bulldogs|eagles|hawks|owls|panthers|warriors|knights|pirates|raiders|cougars|hornets|jayhawks|tar heels|blue devils|crimson tide|fighting irish|wolverines|seminoles|crimson|tide|fighting|irish)$/i, '')
    .trim();
  
  // Normalize international team name variations
  normalized = normalized
    .replace(/\s*(basket|basketball|club|cb|bc)$/i, '') // Remove common suffixes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return normalized;
}

/**
 * Sanitizes a string for use in a key (removes special characters, lowercases)
 */
function sanitizeKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Builds a game key from game data
 * This matches the server-side buildGameKey function
 */
export function buildGameKey(
  dateKey: string,
  timeKey: string,
  teamA: string,
  teamB: string,
  venue?: string,
  leagueOrSource?: string
): string {
  // Normalize team names before sanitizing to ensure consistent keys
  const normalizedA = normalizeTeamNameForKey(teamA);
  const normalizedB = normalizeTeamNameForKey(teamB);
  const teams = [sanitizeKey(normalizedA), sanitizeKey(normalizedB)]
    .sort()
    .join('__');
  const venueKey = venue ? sanitizeKey(venue) : 'no-venue';
  const tipoffKey = timeKey || 'tbd';
  
  // Include league/source to prevent merging games from different leagues with same team names
  const leagueKey = leagueOrSource ? sanitizeKey(leagueOrSource) : '';
  
  return leagueKey 
    ? `${dateKey}__${tipoffKey}__${teams}__${venueKey}__${leagueKey}`
    : `${dateKey}__${tipoffKey}__${teams}__${venueKey}`;
}

/**
 * Builds a game key from a GameWithProspects object
 * This should match the server-side buildGameKey format exactly
 */
export function getGameKey(game: {
  dateKey?: string;
  date?: string;
  tipoff?: string;
  homeTeam: { name: string; displayName?: string; id?: string };
  awayTeam: { name: string; displayName?: string; id?: string };
  venue?: string;
  gameKey?: string; // If already computed, use it
}): string {
  // If gameKey is already set, use it (from API)
  if (game.gameKey) {
    return game.gameKey;
  }
  
  const dateKey = game.dateKey || game.date || '';
  
  // Extract time from tipoff or use 'tbd'
  let timeKey = 'tbd';
  if (game.tipoff) {
    // Convert "3:30 PM" format to "15:30:00" format
    const timeMatch = game.tipoff.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      let [, hour, minute, ampm] = timeMatch;
      let hourNum = parseInt(hour, 10);
      if (ampm.toUpperCase() === 'PM' && hourNum !== 12) {
        hourNum += 12;
      } else if (ampm.toUpperCase() === 'AM' && hourNum === 12) {
        hourNum = 0;
      }
      timeKey = `${hourNum.toString().padStart(2, '0')}:${minute}:00`;
    } else {
      // Try ISO format "15:30:00"
      const isoMatch = game.tipoff.match(/(\d{2}):(\d{2}):(\d{2})/);
      if (isoMatch) {
        timeKey = game.tipoff;
      }
    }
  }
  
  const homeName = game.homeTeam.displayName || game.homeTeam.name;
  const awayName = game.awayTeam.displayName || game.awayTeam.name;
  const venue = game.venue;
  
  // Determine league/source from team IDs or names
  // NCAA teams typically have numeric ESPN IDs, international teams have UUIDs
  const homeId = game.homeTeam.id || '';
  const awayId = game.awayTeam.id || '';
  
  let leagueOrSource = '';
  // Check if IDs look like ESPN IDs (numeric) vs UUIDs
  if (homeId && /^\d+$/.test(homeId)) {
    leagueOrSource = 'ncaa'; // Assume NCAA if numeric ID
  } else if (homeId && homeId.includes('-') && homeId.length > 20) {
    leagueOrSource = 'intl'; // Assume international if UUID-like
  }
  
  // If we can't determine from IDs, try to infer from team names
  // This is a fallback - ideally the API should provide this
  if (!leagueOrSource) {
    // Check for known NBL teams or other indicators
    // For now, default to 'ncaa' for US teams
    leagueOrSource = 'ncaa';
  }
  
  return buildGameKey(dateKey, timeKey, homeName, awayName, venue, leagueOrSource);
}

