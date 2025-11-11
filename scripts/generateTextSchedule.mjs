#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

const [,, teamId, rankArg, playerName, teamLabel, outputPath] = process.argv;

if (!teamId || !rankArg || !playerName || !teamLabel || !outputPath) {
  console.error('Usage: node scripts/generateTextSchedule.mjs <teamId> <rank> <playerName> <teamLabel> <outputPath>');
  process.exit(1);
}

const rank = Number(rankArg);

const formatDate = (iso) => {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  }).format(date);
};

const formatTime = (status, eventDate) => {
  // For completed games, use the original scheduled time from event.date
  const state = status?.type?.state;
  if (state === 'final' || state === 'post') {
    // Format the original scheduled time from event date
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
};

const fetchSchedule = async () => {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}/schedule`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch schedule: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

const buildLines = (data) => {
  const events = (data.events ?? [])
    .filter((event) => {
      // Include all games (past, present, and future)
      const state = event.competitions?.[0]?.status?.type?.state;
      return state === 'pre' || state === 'in' || state === 'post' || state === 'final';
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const lines = [];
  lines.push(`${playerName} 2025-26 ${teamLabel} Schedule`);
  lines.push(`Rank: #${rank}`);
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
    const city = comp.venue?.address?.city;
    const state = comp.venue?.address?.state;
    const localeParts = [venueName, city && state ? `${city}, ${state}` : city || state].filter(Boolean);
    const venueText = localeParts.length ? ` (${localeParts.join(' • ')})` : '';
    const note = comp.notes?.find((n) => n.type === 'event')?.headline;
    const noteText = note ? ` [${note}]` : '';

    lines.push(`${dateStr} — ${prefix} ${opponent} — ${timeStr} — ${tv}${venueText}${noteText}`);
  }

  lines.push('');
  lines.push('Source: ESPN team schedule API (queried Nov 10, 2025).');
  return lines;
};

const data = await fetchSchedule();
const lines = buildLines(data);
writeFileSync(outputPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${lines.length - 3} games to ${outputPath}`);


