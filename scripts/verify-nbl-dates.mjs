#!/usr/bin/env node
/**
 * Verify NBL schedule dates from ESPN API
 * Check if dates are correct (not shifted due to timezone conversion)
 */

async function fetchSchedule(teamId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nbl/teams/${teamId}/schedule`;
  const response = await fetch(url);
  return response.json();
}

function formatDate(iso, timezone = 'America/New_York') {
  const date = new Date(iso);
  // Get the date components in the specified timezone
  const dateStr = date.toLocaleString('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  
  // Also get the time to see if it's early morning (which might cause date shift)
  const timeStr = date.toLocaleString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  
  return { dateStr, timeStr, rawDate: date };
}

async function main() {
  const data = await fetchSchedule(6); // New Zealand Breakers
  
  const events = (data.events ?? [])
    .filter((event) => {
      const state = event.competitions?.[0]?.status?.type?.state;
      return state === 'pre' || state === 'in' || state === 'post' || state === 'final';
    })
    .slice(0, 15); // Check first 15 games
  
  console.log('Checking dates from ESPN API:\n');
  
  for (const event of events) {
    const comp = event.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === 'home');
    const away = comp.competitors.find((c) => c.homeAway === 'away');
    
    // Get date in ET
    const et = formatDate(event.date, 'America/New_York');
    
    // Also check what date it is in NZ timezone (to see original game date)
    const nz = formatDate(event.date, 'Pacific/Auckland');
    
    // Get the date from the ISO string directly (UTC date)
    const utcDate = new Date(event.date);
    const utcDateStr = utcDate.toISOString().split('T')[0];
    
    console.log(`Game: ${home.team.displayName} vs ${away.team.displayName}`);
    console.log(`  UTC date: ${utcDateStr}`);
    console.log(`  ET date/time: ${et.dateStr} ${et.timeStr} ET`);
    console.log(`  NZ date/time: ${nz.dateStr} ${nz.timeStr} NZ`);
    console.log(`  ISO: ${event.date}`);
    console.log('');
  }
}

main().catch(console.error);







