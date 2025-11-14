#!/usr/bin/env node
/**
 * Fix New Zealand Breakers schedule times
 * The schedule file has ET times that were incorrectly converted using Australian logic
 * We need to recalculate them using the correct NZ timezone conversion
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse, format } from 'date-fns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get NZ timezone offset based on date
const getNZOffset = (date) => {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();
  
  // NZDT periods:
  // 2025: Sep 28, 2025 to Apr 6, 2026
  // 2026: Sep 27, 2026 to Apr 5, 2027
  
  if (month >= 10 || month <= 3) {
    // Oct, Nov, Dec, Jan, Feb, Mar are definitely NZDT
    return 13;
  } else if (month === 9) {
    // September: NZDT starts Sep 28, 2025
    return day >= 28 ? 13 : 12;
  } else if (month === 4) {
    // April: NZDT ends Apr 6, 2026
    return day < 6 ? 13 : 12;
  }
  return 12; // Default to NZST
};

// Get US Eastern Time offset based on date
const getETOffset = (date) => {
  const month = date.getMonth() + 1; // 1-12
  
  // EDT periods (approximate):
  // 2025: Mar 9 to Nov 2 = EDT, Nov 2 to Mar 8, 2026 = EST
  // 2026: Mar 8 to Nov 1 = EDT, Nov 1 to Mar 14, 2027 = EST
  
  if (month >= 3 && month <= 10) {
    // Mar-Oct are typically EDT
    return -4;
  } else {
    // Nov-Feb are typically EST
    return -5;
  }
};

// Convert NZ local time to ET
// This assumes the original time in the schedule was NZ local time (without timezone)
// and we need to convert it to ET
function convertNZLocalToET(nzLocalTime, date) {
  const [timePart, period] = nzLocalTime.split(' ');
  const [hours, minutes] = timePart.split(':').map(Number);
  
  let nzHours = hours;
  if (period.toUpperCase() === 'PM' && nzHours !== 12) nzHours += 12;
  if (period.toUpperCase() === 'AM' && nzHours === 12) nzHours = 0;
  
  const nzOffset = getNZOffset(date);
  const etOffset = getETOffset(date);
  
  // Convert NZ time to UTC
  let utcTotalMinutes = (nzHours * 60 + minutes) - (nzOffset * 60);
  if (utcTotalMinutes < 0) utcTotalMinutes += 24 * 60;
  if (utcTotalMinutes >= 24 * 60) utcTotalMinutes -= 24 * 60;
  
  // Convert UTC to ET
  let etTotalMinutes = utcTotalMinutes + (Math.abs(etOffset) * 60);
  let dayOffset = 0;
  
  if (etTotalMinutes >= 24 * 60) {
    etTotalMinutes -= 24 * 60;
    dayOffset = 1;
  } else if (etTotalMinutes < 0) {
    etTotalMinutes += 24 * 60;
    dayOffset = -1;
  }
  
  const etHours = Math.floor(etTotalMinutes / 60) % 24;
  const etMinutes = etTotalMinutes % 60;
  
  let displayHours = etHours;
  let displayPeriod = 'AM';
  if (displayHours === 0) {
    displayHours = 12;
  } else if (displayHours === 12) {
    displayPeriod = 'PM';
  } else if (displayHours > 12) {
    displayHours -= 12;
    displayPeriod = 'PM';
  }
  
  return {
    time: `${displayHours}:${String(etMinutes).padStart(2, '0')} ${displayPeriod} ET`,
    dayOffset
  };
}

// But wait - the schedule file already has ET times that are wrong
// We need to work backwards: if the ET time is wrong, what should it be?
// The user says: pre DST = 2 hour shift error, post DST = 1 hour shift error

// So if schedule says "1:30 AM ET" but should be "11:30 PM ET" (previous day), that's a 2 hour error
// If schedule says "1:30 AM ET" but should be "12:30 AM ET", that's a 1 hour error

// Actually, I think the issue is simpler: the ET times need to be adjusted
// Pre DST: subtract 2 hours
// Post DST: subtract 1 hour

function fixETTime(etTime, date) {
  const [timePart, period, tz] = etTime.split(' ');
  if (tz !== 'ET') return etTime; // Only fix ET times
  
  let [hours, minutes] = timePart.split(':').map(Number);
  if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
  
  // Determine if pre or post DST
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const isPreDST = month === 9 && day < 28; // Before Sep 28
  
  // Adjust: pre DST add 2 hours, post DST add 1 hour
  // (The original times were too early, so we need to add time)
  const adjustmentHours = isPreDST ? 2 : 1;
  let adjustedMinutes = (hours * 60 + minutes) + (adjustmentHours * 60);
  
  let dayOffset = 0;
  if (adjustedMinutes < 0) {
    adjustedMinutes += 24 * 60;
    dayOffset = -1;
  }
  
  const adjustedHours = Math.floor(adjustedMinutes / 60) % 24;
  const adjustedMins = adjustedMinutes % 60;
  
  let displayHours = adjustedHours;
  let displayPeriod = 'AM';
  if (displayHours === 0) {
    displayHours = 12;
  } else if (displayHours === 12) {
    displayPeriod = 'PM';
  } else if (displayHours > 12) {
    displayHours -= 12;
    displayPeriod = 'PM';
  }
  
  return `${displayHours}:${String(adjustedMins).padStart(2, '0')} ${displayPeriod} ET`;
}

const scheduleFile = path.join(__dirname, '..', 'karim_lopez_schedule.txt');
const content = fs.readFileSync(scheduleFile, 'utf-8');
const lines = content.split('\n');

let matchCount = 0;
const fixedLines = lines.map((line, idx) => {
  // Split by em dash or en dash
  const parts = line.split(/[—–]/).map(p => p.trim());
  if (parts.length < 4 || !parts[2].includes('ET')) {
    return line;
  }
  
  const dateStr = parts[0];
  const matchup = parts[1];
  const timeStr = parts[2];
  const rest = parts.slice(3).join(' — ');
  
  const date = parse(dateStr, 'MMM d, yyyy', new Date());
  
  if (isNaN(date.getTime())) {
    return line;
  }
  
  matchCount++;
  const fixedTime = fixETTime(timeStr, date);
  
  if (fixedTime !== timeStr) {
    console.log(`${dateStr}: ${timeStr} -> ${fixedTime}`);
  }
  
  return `${dateStr} — ${matchup} — ${fixedTime}${rest ? ' — ' + rest : ''}`;
});

const fixedContent = fixedLines.join('\n');
const backupFile = scheduleFile + '.backup';
fs.copyFileSync(scheduleFile, backupFile);
fs.writeFileSync(scheduleFile, fixedContent, 'utf-8');

console.log(`✅ Processed ${matchCount} matching lines`);
console.log('✅ Fixed New Zealand Breakers schedule times!');
console.log(`📦 Backup saved to: ${backupFile}`);
console.log('\nChanges:');
console.log('- Pre DST (before Sep 28): Adjusted ET times by +2 hours');
console.log('- Post DST (after Sep 28): Adjusted ET times by +1 hour');

