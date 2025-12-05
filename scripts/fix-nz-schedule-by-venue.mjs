#!/usr/bin/env node
/**
 * Fix New Zealand Breakers schedule times based on venue
 * Games at NZ venues: recalculate from NZ timezone (Pacific/Auckland)
 * Games at Australian venues: recalculate from Australian timezone (Australia/Melbourne)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scheduleFile = path.join(__dirname, '..', 'karim_lopez_schedule.txt');
const content = fs.readFileSync(scheduleFile, 'utf-8');
const lines = content.split('\n');

// NZ venues
const NZ_VENUES = ['spark arena', 'wolfbrook arena', 'auckland', 'christchurch'];

function isNZVenue(venue) {
  if (!venue) return false;
  const lower = venue.toLowerCase();
  return NZ_VENUES.some(v => lower.includes(v));
}

function fixTimeForVenue(originalETTime, dateStr, venue) {
  // Parse the original ET time
  const timeMatch = originalETTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s+ET/);
  if (!timeMatch) return originalETTime;
  
  const [, hourStr, minuteStr, period] = timeMatch;
  let hours = parseInt(hourStr);
  const minutes = parseInt(minuteStr);
  
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  
  // Parse date
  const date = DateTime.fromFormat(dateStr, 'MMM d, yyyy', { zone: 'America/New_York' });
  if (!date.isValid) return originalETTime;
  
  // Determine source timezone
  const sourceTZ = isNZVenue(venue) ? 'Pacific/Auckland' : 'Australia/Melbourne';
  
  // Convert ET time to source timezone, then back to ET
  // This corrects for the wrong timezone being used originally
  const etTime = date.set({ hour: hours, minute: minutes });
  
  // Get what this ET time represents in source timezone
  const sourceTime = etTime.setZone(sourceTZ);
  
  // Now convert from source timezone back to ET correctly
  const correctedET = sourceTime.setZone('America/New_York');
  
  // Format back
  let displayHours = correctedET.hour;
  let displayPeriod = 'AM';
  if (displayHours === 0) {
    displayHours = 12;
  } else if (displayHours === 12) {
    displayPeriod = 'PM';
  } else if (displayHours > 12) {
    displayHours -= 12;
    displayPeriod = 'PM';
  }
  
  return `${displayHours}:${String(correctedET.minute).padStart(2, '0')} ${displayPeriod} ET`;
}

const fixedLines = lines.map(line => {
  // Match: "Sep 19, 2025 — vs Brisbane Bullets — 1:30 AM ET — TV: TBA (Spark Arena • Auckland, New Zealand)"
  const parts = line.split(/[—–]/).map(p => p.trim());
  if (parts.length < 4 || !parts[2].includes('ET')) {
    return line;
  }
  
  const dateStr = parts[0];
  const matchup = parts[1];
  const timeStr = parts[2];
  const rest = parts.slice(3).join(' — ');
  
  // Extract venue from rest
  const venueMatch = rest.match(/\(([^)]+)\)/);
  const venue = venueMatch ? venueMatch[1] : '';
  
  const fixedTime = fixTimeForVenue(timeStr, dateStr, venue);
  
  if (fixedTime !== timeStr) {
    console.log(`${dateStr}: ${timeStr} -> ${fixedTime} (venue: ${venue.substring(0, 30)})`);
  }
  
  return `${dateStr} — ${matchup} — ${fixedTime}${rest ? ' — ' + rest : ''}`;
});

const backupFile = scheduleFile + '.backup2';
fs.copyFileSync(scheduleFile, backupFile);
fs.writeFileSync(scheduleFile, fixedLines.join('\n'), 'utf-8');

console.log(`\n✅ Fixed schedule times based on venue`);
console.log(`📦 Backup saved to: ${backupFile}`);






