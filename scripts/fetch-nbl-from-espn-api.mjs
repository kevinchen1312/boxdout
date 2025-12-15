#!/usr/bin/env node
/**
 * Fetch New Zealand Breakers schedule from ESPN API
 * Similar to generateTextSchedule.mjs but for NBL
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputFile = path.join(__dirname, '..', 'karim_lopez_schedule.txt');

async function findTeamId() {
  const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nbl/teams');
  const data = await response.json();
  
  const teams = data.sports[0].leagues[0].teams;
  const nzl = teams.find(t => 
    t.team.name.toLowerCase().includes('zealand') || 
    t.team.name.toLowerCase().includes('breaker') ||
    t.team.slug.includes('zealand') ||
    t.team.slug.includes('breaker')
  );
  
  if (!nzl) {
    throw new Error('New Zealand Breakers team not found');
  }
  
  console.log(`Found team: ${nzl.team.name} (ID: ${nzl.team.id}, Slug: ${nzl.team.slug})`);
  return nzl.team.id;
}

async function fetchSchedule(teamId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nbl/teams/${teamId}/schedule`;
  console.log(`Fetching schedule from ${url}...`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

function formatDate(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  }).format(date);
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

async function main() {
  try {
    const teamId = await findTeamId();
    const data = await fetchSchedule(teamId);
    
    const events = (data.events ?? [])
      .filter((event) => {
        const state = event.competitions?.[0]?.status?.type?.state;
        return state === 'pre' || state === 'in' || state === 'post' || state === 'final';
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    
    console.log(`Found ${events.length} games`);
    
    const lines = [];
    lines.push('Karim Lopez 2025-26 New Zealand Breakers Schedule');
    lines.push('Rank: #11');
    lines.push('');
    
    for (const event of events) {
      const comp = event.competitions[0];
      const status = comp.status;
      const home = comp.competitors.find((c) => c.homeAway === 'home');
      const away = comp.competitors.find((c) => c.homeAway === 'away');
      const isHome = home?.team?.id === String(teamId);
      const isNeutral = Boolean(comp.neutralSite);
      const opponent = (isHome ? away : home)?.team?.displayName ?? 'TBD';
      const prefix = isNeutral ? 'vs' : isHome ? 'vs' : 'at';
      const dateStr = formatDate(event.date);
      const timeStr = formatTime(status, event.date);
      const tvNames = (comp.broadcasts ?? []).map((b) => b.media?.shortName).filter(Boolean);
      const tv = tvNames.length ? Array.from(new Set(tvNames)).join(' / ') : 'TBA';
      const venueName = comp.venue?.fullName ?? '';
      const venueCity = comp.venue?.address?.city ?? '';
      const venueState = comp.venue?.address?.state ?? '';
      const venueCountry = comp.venue?.address?.country ?? '';
      
      let venue = '';
      if (venueName) {
        const parts = [venueName];
        if (venueCity) parts.push(venueCity);
        if (venueState && venueState !== venueCity) parts.push(venueState);
        if (venueCountry && venueCountry !== 'USA') parts.push(venueCountry);
        venue = `(${parts.join(' • ')})`;
      }
      
      lines.push(`${dateStr} — ${prefix} ${opponent} — ${timeStr} — TV: ${tv} ${venue}`);
    }
    
    lines.push('');
    lines.push('Notes:');
    lines.push('- Times converted from New Zealand local time to Eastern Time.');
    lines.push('- Home games played at Spark Arena in Auckland, New Zealand (except Nov 6 at Wolfbrook Arena in Christchurch).');
    lines.push('- Source: ESPN NBL API (2025-26 season).');
    lines.push('');
    
    fs.writeFileSync(outputFile, lines.join('\n'), 'utf-8');
    console.log(`\n✅ Generated schedule with ${events.length} games`);
    console.log(`📄 Output: ${outputFile}`);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();







