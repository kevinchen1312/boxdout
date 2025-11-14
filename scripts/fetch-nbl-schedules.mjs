#!/usr/bin/env node
/**
 * Fetch NBL schedules from ESPN API for multiple teams
 * Fetches New Zealand Breakers and Melbourne United, merges duplicates
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEAMS = [
  { id: 6, name: 'New Zealand Breakers', slug: 'new-zealand-breakers', player: 'Karim Lopez', rank: 11 },
  { id: 5, name: 'Melbourne United', slug: 'melbourne-united', player: 'Dash Daniels', rank: 50 },
];

async function fetchSchedule(teamId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nbl/teams/${teamId}/schedule`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

function formatDate(iso, sourceTimezone) {
  const date = new Date(iso);
  // Use the source timezone to determine the actual game date
  // This prevents dates from shifting when converting to ET
  const dateStr = date.toLocaleString('en-US', {
    timeZone: sourceTimezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return dateStr;
}

function formatTime(status, eventDate) {
  // For completed games, use the original scheduled time from event.date
  const state = status?.type?.state;
  if (state === 'final' || state === 'post') {
    const date = new Date(eventDate);
    const timeStr = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    }).format(date);
    return `${timeStr} ET`;
  }
  
  // For future games, use the status shortDetail
  const shortDetail = status?.type?.shortDetail ?? '';
  if (!shortDetail) return 'TBD';
  const pieces = shortDetail.split('-');
  const time = pieces[1]?.trim() ?? shortDetail.trim();
  return time.replace('EST', 'ET').replace('EDT', 'ET');
}

function buildGameKey(event) {
  const comp = event.competitions[0];
  const home = comp.competitors.find((c) => c.homeAway === 'home');
  const away = comp.competitors.find((c) => c.homeAway === 'away');
  const date = new Date(event.date);
  const dateKey = date.toISOString().split('T')[0];
  return `${dateKey}-${home?.team?.id}-${away?.team?.id}`;
}

async function main() {
  const allGames = new Map(); // Use Map to deduplicate by game key
  
  for (const team of TEAMS) {
    console.log(`\n=== Fetching ${team.name} (${team.player}) ===`);
    try {
      const data = await fetchSchedule(team.id);
      
      const events = (data.events ?? [])
        .filter((event) => {
          const state = event.competitions?.[0]?.status?.type?.state;
          return state === 'pre' || state === 'in' || state === 'post' || state === 'final';
        });
      
      console.log(`Found ${events.length} games`);
      
      for (const event of events) {
        const gameKey = buildGameKey(event);
        if (!allGames.has(gameKey)) {
          allGames.set(gameKey, {
            event,
            teams: [team],
          });
        } else {
          // Game already exists, add this team to the list
          allGames.get(gameKey).teams.push(team);
        }
      }
    } catch (err) {
      console.error(`Error fetching ${team.name}:`, err);
    }
  }
  
  console.log(`\n=== Total unique games: ${allGames.size} ===`);
  
  // Generate schedules for each player
  for (const team of TEAMS) {
    const playerGames = [];
    
    for (const [gameKey, gameData] of allGames.entries()) {
      const event = gameData.event;
      const comp = event.competitions[0];
      const home = comp.competitors.find((c) => c.homeAway === 'home');
      const away = comp.competitors.find((c) => c.homeAway === 'away');
      
      // Check if this team is involved in this game
      const isHome = home?.team?.id === String(team.id);
      const isAway = away?.team?.id === String(team.id);
      if (!isHome && !isAway) continue;
      
      const isNeutral = Boolean(comp.neutralSite);
      const opponent = (isHome ? away : home)?.team?.displayName ?? 'TBD';
      const prefix = isNeutral ? 'vs' : isHome ? 'vs' : 'at';
      
      // Determine source timezone based on venue
      const venueName = comp.venue?.fullName ?? '';
      const venueCity = comp.venue?.address?.city ?? '';
      const venueState = comp.venue?.address?.state ?? '';
      const venueCountry = comp.venue?.address?.country ?? '';
      
      const isNZVenue = venueCountry.toLowerCase().includes('zealand') || 
                        venueCity.toLowerCase().includes('auckland') ||
                        venueCity.toLowerCase().includes('christchurch');
      const sourceTimezone = isNZVenue ? 'Pacific/Auckland' : 'Australia/Melbourne';
      
      const dateStr = formatDate(event.date, sourceTimezone);
      const timeStr = formatTime(comp.status, event.date);
      const tvNames = (comp.broadcasts ?? []).map((b) => b.media?.shortName).filter(Boolean);
      const tv = tvNames.length ? Array.from(new Set(tvNames)).join(' / ') : 'TBA';
      
      let venue = '';
      if (venueName) {
        const parts = [venueName];
        if (venueCity) parts.push(venueCity);
        if (venueState && venueState !== venueCity) parts.push(venueState);
        if (venueCountry && venueCountry !== 'USA') parts.push(venueCountry);
        venue = `(${parts.join(' • ')})`;
      }
      
      playerGames.push({
        date: event.date,
        dateStr,
        timeStr,
        prefix,
        opponent,
        tv,
        venue,
      });
    }
    
    // Sort by date, then time
    playerGames.sort((a, b) => a.date.localeCompare(b.date));
    
    // Write schedule file
    const outputFile = path.join(__dirname, '..', `${team.player.toLowerCase().replace(/\s+/g, '_')}_schedule.txt`);
    const lines = [];
    lines.push(`${team.player} 2025-26 ${team.name} Schedule`);
    lines.push(`Rank: #${team.rank}`);
    lines.push('');
    
    for (const game of playerGames) {
      lines.push(`${game.dateStr} — ${game.prefix} ${game.opponent} — ${game.timeStr} — TV: ${game.tv} ${game.venue}`);
    }
    
    lines.push('');
    lines.push('Notes:');
    if (team.id === 6) {
      lines.push('- Times converted from New Zealand local time to Eastern Time.');
      lines.push('- Home games played at Spark Arena in Auckland, New Zealand (except Nov 6 at Wolfbrook Arena in Christchurch).');
    } else {
      lines.push('- Times converted from Australian local time to Eastern Time.');
    }
    lines.push('- Source: ESPN NBL API (2025-26 season).');
    lines.push('');
    
    fs.writeFileSync(outputFile, lines.join('\n'), 'utf-8');
    console.log(`✅ Generated ${playerGames.length} games for ${team.player}`);
    console.log(`📄 Output: ${outputFile}`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

