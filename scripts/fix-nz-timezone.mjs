#!/usr/bin/env node
/**
 * Test timezone conversion for New Zealand Breakers games
 */

// New Zealand daylight saving dates:
// 2025: Starts last Sunday in September (Sep 28), ends first Sunday in April (Apr 6, 2026)
// NZDT = UTC+13 (during daylight saving)
// NZST = UTC+12 (standard time)

// US Eastern Time:
// EDT = UTC-4 (during daylight saving, typically Mar-Nov)
// EST = UTC-5 (standard time)

function getNZOffset(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  const day = d.getDate();
  
  // NZDT typically runs from last Sunday in September to first Sunday in April
  // For 2025: Sep 28, 2025 to Apr 6, 2026
  // For 2026: Sep 27, 2026 to Apr 5, 2027
  
  // Check if date is in NZDT period
  let isNZDT = false;
  if (month >= 10 || month <= 3) {
    // Oct, Nov, Dec, Jan, Feb, Mar are definitely NZDT
    isNZDT = true;
  } else if (month === 9) {
    // September: check if after last Sunday
    // For 2025: Sep 28 is the start
    isNZDT = day >= 28;
  } else if (month === 4) {
    // April: check if before first Sunday
    // For 2026: Apr 6 is the end
    isNZDT = day < 6;
  }
  
  return isNZDT ? 13 : 12; // UTC offset
}

function getETOffset(date) {
  const d = new Date(date);
  const month = d.getMonth() + 1; // 1-12
  
  // EDT typically runs from second Sunday in March to first Sunday in November
  // For simplicity, approximate: Mar-Nov = EDT, Dec-Feb = EST
  // More accurate: Mar 9, 2025 to Nov 2, 2025 = EDT
  //                Nov 2, 2025 to Mar 8, 2026 = EST
  //                Mar 8, 2026 to Nov 1, 2026 = EDT
  
  if (month >= 3 && month <= 10) {
    return -4; // EDT
  } else {
    return -5; // EST
  }
}

function convertNZToET(nzHours, nzMinutes, date) {
  const nzOffset = getNZOffset(date);
  const etOffset = getETOffset(date);
  
  // Convert NZ time to UTC
  let utcHours = nzHours - nzOffset;
  if (utcHours < 0) utcHours += 24;
  if (utcHours >= 24) utcHours -= 24;
  
  // Convert UTC to ET
  let etHours = utcHours + Math.abs(etOffset); // etOffset is negative, so add abs
  let dayOffset = 0;
  
  if (etHours >= 24) {
    etHours -= 24;
    dayOffset = 1;
  } else if (etHours < 0) {
    etHours += 24;
    dayOffset = -1;
  }
  
  return { hours: etHours, minutes: nzMinutes, dayOffset };
}

// Test cases from the schedule
const testCases = [
  { date: '2025-09-19', nzTime: '1:30 AM', expected: '1:30 AM ET' }, // Pre DST
  { date: '2025-11-22', nzTime: '2:30 AM', expected: '2:30 AM ET' }, // Post DST
  { date: '2026-01-04', nzTime: '11:30 PM', expected: '11:30 PM ET' }, // Post DST
];

console.log('Testing NZ to ET conversion:\n');
for (const test of testCases) {
  const [hour, minute, period] = test.nzTime.match(/(\d+):(\d+)\s*(AM|PM)/i).slice(1);
  let hours = parseInt(hour);
  if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
  
  const result = convertNZToET(hours, parseInt(minute), test.date);
  const nzOffset = getNZOffset(test.date);
  const etOffset = getETOffset(test.date);
  
  let displayHours = result.hours;
  let displayPeriod = 'AM';
  if (displayHours === 0) {
    displayHours = 12;
  } else if (displayHours === 12) {
    displayPeriod = 'PM';
  } else if (displayHours > 12) {
    displayHours -= 12;
    displayPeriod = 'PM';
  }
  
  console.log(`${test.date}: NZ ${test.nzTime} (UTC+${nzOffset}) → ET ${displayHours}:${String(result.minutes).padStart(2, '0')} ${displayPeriod} (UTC${etOffset})`);
  console.log(`  Expected: ${test.expected}`);
  console.log(`  Offset: ${nzOffset - etOffset} hours\n`);
}






