/**
 * Sync functions to fetch schedules from ESPN API and store in database
 * Supports both NCAA and NBL teams
 */

import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

interface ESPNEvent {
  id: string;
  date: string;
  competitions?: Array<{
    id: string;
    date: string;
    status: {
      type: {
        id: string;
        name: string;
        state: string;
        completed: boolean;
        description: string;
        detail: string;
        shortDetail: string;
      };
    };
    competitors?: Array<{
      id: string;
      uid: string;
      homeAway: 'home' | 'away';
      score?: string | number | { displayValue: string };
      winner?: boolean;
      team: {
        id: string;
        uid: string;
        location: string;
        name: string;
        displayName: string;
        shortDisplayName: string;
        abbreviation: string;
        logos?: Array<{ href: string }>;
      };
    }>;
    broadcasts?: Array<{
      media: {
        shortName: string;
      };
      names?: string[];
    }>;
    venue?: {
      fullName: string;
      address?: {
        city?: string;
        state?: string;
      };
    };
    neutralSite?: boolean;
    notes?: Array<{
      type: string;
      headline: string;
    }>;
  }>;
}

interface ESPNScheduleResponse {
  events?: ESPNEvent[];
  team?: {
    id: string;
    displayName: string;
  };
}

/**
 * Format date from ESPN API to date_key (YYYY-MM-DD)
 * ESPN dates are in ET timezone, so we need to convert to ET before extracting the date
 * This ensures games show on the correct date (e.g., Dec 9 game doesn't show as Dec 10)
 */
function formatDateKey(dateStr: string): { date: Date; dateKey: string } {
  const date = new Date(dateStr);
  
  // ESPN dates are in ET timezone
  // Convert to ET and extract date components to get the correct local date
  // Use toLocaleString with ET timezone to get the correct date
  const etDateStr = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  // Parse the ET date string (format: "MM/DD/YYYY")
  const [month, day, year] = etDateStr.split('/');
  const dateKey = `${year}-${month}-${day}`;
  
  return { date, dateKey };
}

/**
 * Extract score from ESPN competitor object
 */
function extractScore(competitor: any): string | undefined {
  const scoreRaw = competitor?.score;
  if (scoreRaw === undefined || scoreRaw === null) {
    return undefined;
  }
  if (typeof scoreRaw === 'object' && scoreRaw.displayValue) {
    return String(scoreRaw.displayValue);
  }
  return String(scoreRaw);
}

/**
 * Sync NCAA team schedule to database
 */
export async function syncNCAATeamSchedule(
  espnTeamId: string,
  season?: string
): Promise<{ synced: number; errors: number }> {
  const supabase = getSupabaseClient();
  const url = new URL(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${espnTeamId}/schedule`
  );
  
  if (season) {
    url.searchParams.set('season', season);
  }
  
  console.log(`[Sync] Fetching NCAA schedule for team ${espnTeamId}...`);
  
  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch NCAA schedule for team ${espnTeamId}: ${response.status} ${response.statusText}`);
  }
  
  const data: ESPNScheduleResponse = await response.json();
  const events = data.events || [];
  
  let synced = 0;
  let errors = 0;
  
  for (const event of events) {
    const competition = event.competitions?.[0];
    if (!competition) continue;
    
    const state = competition.status?.type?.state;
    // Only sync valid game states
    if (!state || !['pre', 'in', 'post', 'final'].includes(state)) {
      continue;
    }
    
    const competitors = competition.competitors ?? [];
    const homeComp = competitors.find((c) => c.homeAway === 'home');
    const awayComp = competitors.find((c) => c.homeAway === 'away');
    
    if (!homeComp || !awayComp) continue;
    
    const isHome = homeComp.team.id === espnTeamId;
    const isNeutral = Boolean(competition.neutralSite);
    
    let locationType: 'home' | 'away' | 'neutral';
    if (isNeutral) {
      locationType = 'neutral';
    } else {
      locationType = isHome ? 'home' : 'away';
    }
    
    const { date, dateKey } = formatDateKey(event.date);
    
    const homeScore = extractScore(homeComp);
    const awayScore = extractScore(awayComp);
    
    const broadcasts = competition.broadcasts?.map((b) => 
      b.media?.shortName || b.names?.[0] || ''
    ).filter(Boolean) || [];
    
    const notes = competition.notes?.map((n) => n.headline).join('; ') || null;
    
    const homeLogo = homeComp.team.logos?.[0]?.href;
    const awayLogo = awayComp.team.logos?.[0]?.href;
    
    // ESPN API sometimes doesn't have 'name', use displayName as fallback
    const homeTeamName = homeComp.team.name || homeComp.team.displayName || homeComp.team.shortDisplayName || 'Unknown';
    const awayTeamName = awayComp.team.name || awayComp.team.displayName || awayComp.team.shortDisplayName || 'Unknown';
    const homeTeamDisplayName = homeComp.team.displayName || homeComp.team.name || homeComp.team.shortDisplayName || 'Unknown';
    const awayTeamDisplayName = awayComp.team.displayName || awayComp.team.name || awayComp.team.shortDisplayName || 'Unknown';
    
    const scheduleEntry = {
      espn_team_id: espnTeamId,
      game_id: event.id,
      date: date.toISOString(),
      date_key: dateKey,
      home_team_id: homeComp.team.id,
      away_team_id: awayComp.team.id,
      home_team_name: homeTeamName,
      away_team_name: awayTeamName,
      home_team_display_name: homeTeamDisplayName,
      away_team_display_name: awayTeamDisplayName,
      home_team_logo: homeLogo || null,
      away_team_logo: awayLogo || null,
      location_type: locationType,
      venue: competition.venue?.fullName || null,
      venue_city: competition.venue?.address?.city || null,
      venue_state: competition.venue?.address?.state || null,
      season: season || null,
      status: state,
      status_detail: competition.status?.type?.shortDetail || competition.status?.type?.detail || null,
      home_score: homeScore || null,
      away_score: awayScore || null,
      broadcasts: broadcasts.length > 0 ? broadcasts : null,
      notes: notes,
    };
    
    try {
      const { error } = await supabase
        .from('ncaa_team_schedules')
        .upsert(scheduleEntry, {
          onConflict: 'espn_team_id,game_id',
        });
      
      if (error) {
        console.error(`[Sync] Error syncing game ${event.id} for team ${espnTeamId}:`, error);
        errors++;
      } else {
        synced++;
      }
    } catch (err) {
      console.error(`[Sync] Exception syncing game ${event.id} for team ${espnTeamId}:`, err);
      errors++;
    }
  }
  
  console.log(`[Sync] Synced ${synced} games for NCAA team ${espnTeamId} (${errors} errors)`);
  return { synced, errors };
}

/**
 * Sync NBL team schedule to database
 */
export async function syncNBLTeamSchedule(
  espnTeamId: string,
  season?: string
): Promise<{ synced: number; errors: number }> {
  const supabase = getSupabaseClient();
  const url = new URL(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nbl/teams/${espnTeamId}/schedule`
  );
  
  if (season) {
    url.searchParams.set('season', season);
  }
  
  console.log(`[Sync] Fetching NBL schedule for team ${espnTeamId}...`);
  
  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch NBL schedule for team ${espnTeamId}: ${response.status} ${response.statusText}`);
  }
  
  const data: ESPNScheduleResponse = await response.json();
  const events = data.events || [];
  
  let synced = 0;
  let errors = 0;
  
  for (const event of events) {
    const competition = event.competitions?.[0];
    if (!competition) continue;
    
    const state = competition.status?.type?.state;
    // Only sync valid game states
    if (!state || !['pre', 'in', 'post', 'final'].includes(state)) {
      continue;
    }
    
    const competitors = competition.competitors ?? [];
    const homeComp = competitors.find((c) => c.homeAway === 'home');
    const awayComp = competitors.find((c) => c.homeAway === 'away');
    
    if (!homeComp || !awayComp) continue;
    
    const isHome = homeComp.team.id === espnTeamId;
    const isNeutral = Boolean(competition.neutralSite);
    
    let locationType: 'home' | 'away' | 'neutral';
    if (isNeutral) {
      locationType = 'neutral';
    } else {
      locationType = isHome ? 'home' : 'away';
    }
    
    const { date, dateKey } = formatDateKey(event.date);
    
    const homeScore = extractScore(homeComp);
    const awayScore = extractScore(awayComp);
    
    const broadcasts = competition.broadcasts?.map((b) => 
      b.media?.shortName || b.names?.[0] || ''
    ).filter(Boolean) || [];
    
    const notes = competition.notes?.map((n) => n.headline).join('; ') || null;
    
    const homeLogo = homeComp.team.logos?.[0]?.href;
    const awayLogo = awayComp.team.logos?.[0]?.href;
    
    // ESPN API sometimes doesn't have 'name', use displayName as fallback
    const homeTeamName = homeComp.team.name || homeComp.team.displayName || homeComp.team.shortDisplayName || 'Unknown';
    const awayTeamName = awayComp.team.name || awayComp.team.displayName || awayComp.team.shortDisplayName || 'Unknown';
    const homeTeamDisplayName = homeComp.team.displayName || homeComp.team.name || homeComp.team.shortDisplayName || 'Unknown';
    const awayTeamDisplayName = awayComp.team.displayName || awayComp.team.name || awayComp.team.shortDisplayName || 'Unknown';
    
    const scheduleEntry = {
      espn_team_id: espnTeamId,
      game_id: event.id,
      date: date.toISOString(),
      date_key: dateKey,
      home_team_id: homeComp.team.id,
      away_team_id: awayComp.team.id,
      home_team_name: homeTeamName,
      away_team_name: awayTeamName,
      home_team_display_name: homeTeamDisplayName,
      away_team_display_name: awayTeamDisplayName,
      home_team_logo: homeLogo || null,
      away_team_logo: awayLogo || null,
      location_type: locationType,
      venue: competition.venue?.fullName || null,
      venue_city: competition.venue?.address?.city || null,
      venue_state: competition.venue?.address?.state || null,
      season: season || null,
      status: state,
      status_detail: competition.status?.type?.shortDetail || competition.status?.type?.detail || null,
      home_score: homeScore || null,
      away_score: awayScore || null,
      broadcasts: broadcasts.length > 0 ? broadcasts : null,
      notes: notes,
    };
    
    try {
      const { error } = await supabase
        .from('nbl_team_schedules')
        .upsert(scheduleEntry, {
          onConflict: 'espn_team_id,game_id',
        });
      
      if (error) {
        console.error(`[Sync] Error syncing game ${event.id} for NBL team ${espnTeamId}:`, error);
        errors++;
      } else {
        synced++;
      }
    } catch (err) {
      console.error(`[Sync] Exception syncing game ${event.id} for NBL team ${espnTeamId}:`, err);
      errors++;
    }
  }
  
  console.log(`[Sync] Synced ${synced} games for NBL team ${espnTeamId} (${errors} errors)`);
  return { synced, errors };
}

