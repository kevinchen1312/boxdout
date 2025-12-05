#!/usr/bin/env node
/**
 * Convert NBL schedule from raw format to formatted text schedule
 * Input: public/data/pro_schedules/karim_lopez_schedule.txt (CSV format)
 * Output: karim_lopez_schedule.txt (formatted text)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { format, parse } from 'date-fns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputFile = path.join(__dirname, '..', 'public', 'data', 'pro_schedules', 'karim_lopez_schedule.txt');
const outputFile = path.join(__dirname, '..', 'karim_lopez_schedule.txt');

// Read raw schedule
const rawContent = fs.readFileSync(inputFile, 'utf-8');
const lines = rawContent.trim().split('\n').filter(l => l.trim());

const games = [];
for (const line of lines) {
  // Format: "2025-09-19, 01:30 ET, NBL, Brisbane Bullets, H, Spark Arena • Auckland, New Zealand, https://..."
  const parts = line.split(',').map(p => p.trim());
  if (parts.length < 5) continue;
  
  const [dateStr, timeStr, comp, opp, hoa, venue, ...rest] = parts;
  
  // Parse date
  const date = parse(dateStr, 'yyyy-MM-dd', new Date());
  if (isNaN(date.getTime())) continue;
  
  // Format date as "Sep 19, 2025"
  const formattedDate = format(date, 'MMM d, yyyy');
  
  // Parse time (format: "01:30 ET" or "13:30 ET")
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*ET/);
  if (!timeMatch) continue;
  
  let hours = parseInt(timeMatch[1]);
  const minutes = timeMatch[2];
  let period = 'AM';
  
  if (hours === 0) {
    hours = 12;
    period = 'AM';
  } else if (hours === 12) {
    period = 'PM';
  } else if (hours > 12) {
    hours -= 12;
    period = 'PM';
  }
  
  const formattedTime = `${hours}:${minutes} ${period} ET`;
  
  // Determine prefix
  const prefix = hoa === 'H' ? 'vs' : hoa === 'A' ? 'at' : 'vs';
  
  // Format venue
  const venueStr = venue ? `(${venue})` : '';
  
  games.push({
    date: formattedDate,
    dateSort: dateStr,
    time: formattedTime,
    timeSort: timeStr,
    prefix,
    opponent: opp,
    venue: venueStr,
  });
}

// Sort by date, then time
games.sort((a, b) => {
  const dateCompare = a.dateSort.localeCompare(b.dateSort);
  if (dateCompare !== 0) return dateCompare;
  return a.timeSort.localeCompare(b.timeSort);
});

// Write formatted schedule
const outputLines = [
  'Karim Lopez 2025-26 New Zealand Breakers Schedule',
  'Rank: #11',
  '',
];

for (const game of games) {
  outputLines.push(
    `${game.date} — ${game.prefix} ${game.opponent} — ${game.time} — TV: TBA ${game.venue}`
  );
}

outputLines.push('');
outputLines.push('Notes:');
outputLines.push('- Times converted from New Zealand local time to Eastern Time.');
outputLines.push('- Home games played at Spark Arena in Auckland, New Zealand (except Nov 6 at Wolfbrook Arena in Christchurch).');
outputLines.push('- Source: NBL official schedule (2025-26 season).');
outputLines.push('');

fs.writeFileSync(outputFile, outputLines.join('\n'), 'utf-8');
console.log(`✅ Converted ${games.length} games to formatted schedule`);
console.log(`📄 Output: ${outputFile}`);






