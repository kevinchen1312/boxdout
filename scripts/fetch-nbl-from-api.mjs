#!/usr/bin/env node
/**
 * Fetch New Zealand Breakers schedule from JSON API
 * Uses fixturedownload.com JSON feed
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputFile = path.join(__dirname, '..', 'karim_lopez_schedule.txt');

async function fetchSchedule() {
  const url = 'https://fixturedownload.com/view/json/nbl-2025/new-zealand-breakers';
  console.log(`Fetching schedule from ${url}...`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const games = await response.json();
  console.log(`Found ${games.length} games`);
  
  if (!Array.isArray(games) || games.length === 0) {
    throw new Error('No games found in response');
  }
  
  // Process games
  const processedGames = [];
  
  for (const game of games) {
    try {
      // Parse date and time from the game object
      // Format varies, but typically has: Date, Time, HomeTeam, AwayTeam
      const dateStr = game.Date || game.date || game.matchDate;
      const timeStr = game.Time || game.time || game.matchTime;
      const homeTeam = game.HomeTeam || game.homeTeam || game.Home;
      const awayTeam = game.AwayTeam || game.awayTeam || game.Away;
      
      if (!dateStr || !timeStr || !homeTeam || !awayTeam) {
        console.log('Skipping game with missing data:', game);
        continue;
      }
      
      // Determine if Breakers are home or away
      const isHome = homeTeam.toLowerCase().includes('breakers') || 
                     homeTeam.toLowerCase().includes('new zealand');
      const opponent = isHome ? awayTeam : homeTeam;
      const prefix = isHome ? 'vs' : 'at';
      
      // Parse date - try multiple formats
      let gameDate;
      const dateFormats = [
        'yyyy-MM-dd',
        'dd/MM/yyyy',
        'MM/dd/yyyy',
        'dd-MM-yyyy',
        'yyyy/MM/dd',
      ];
      
      for (const fmt of dateFormats) {
        gameDate = DateTime.fromFormat(dateStr.trim(), fmt, { zone: 'Pacific/Auckland' });
        if (gameDate.isValid) break;
      }
      
      // If still invalid, try ISO format
      if (!gameDate.isValid) {
        gameDate = DateTime.fromISO(dateStr, { zone: 'Pacific/Auckland' });
      }
      
      if (!gameDate.isValid) {
        console.log(`Could not parse date: ${dateStr}`);
        continue;
      }
      
      // Parse time - handle formats like "7:30 PM", "19:30", etc.
      let gameTime;
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
      if (!timeMatch) {
        console.log(`Could not parse time: ${timeStr}`);
        continue;
      }
      
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const period = timeMatch[3]?.toUpperCase();
      
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      if (!period && hours < 12) {
        // Assume 24-hour format if no AM/PM
        // But if hours < 12 and no period, might be AM - need to check context
      }
      
      // Create DateTime in NZ timezone
      const gameDateTime = gameDate.set({ hour: hours, minute: minutes });
      
      // Convert to ET
      const etDateTime = gameDateTime.setZone('America/New_York');
      
      // Format for output
      const formattedDate = etDateTime.toFormat('MMM d, yyyy');
      let displayHours = etDateTime.hour;
      let displayPeriod = 'AM';
      
      if (displayHours === 0) {
        displayHours = 12;
      } else if (displayHours === 12) {
        displayPeriod = 'PM';
      } else if (displayHours > 12) {
        displayHours -= 12;
        displayPeriod = 'PM';
      }
      
      const formattedTime = `${displayHours}:${String(etDateTime.minute).padStart(2, '0')} ${displayPeriod} ET`;
      
      // Get venue
      const venue = game.Venue || game.venue || game.Location || 
                   (isHome ? 'Spark Arena • Auckland, New Zealand' : '');
      
      processedGames.push({
        date: formattedDate,
        dateSort: etDateTime.toFormat('yyyy-MM-dd'),
        time: formattedTime,
        timeSort: etDateTime.toFormat('HH:mm'),
        prefix,
        opponent,
        venue,
      });
    } catch (err) {
      console.log(`Error processing game:`, err.message);
      console.log('Game data:', game);
      continue;
    }
  }
  
  // Sort by date, then time
  processedGames.sort((a, b) => {
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
  
  for (const game of processedGames) {
    outputLines.push(
      `${game.date} — ${game.prefix} ${game.opponent} — ${game.time} — TV: TBA ${game.venue ? `(${game.venue})` : ''}`
    );
  }
  
  outputLines.push('');
  outputLines.push('Notes:');
  outputLines.push('- Times converted from New Zealand local time to Eastern Time.');
  outputLines.push('- Home games played at Spark Arena in Auckland, New Zealand (except Nov 6 at Wolfbrook Arena in Christchurch).');
  outputLines.push('- Source: NBL official schedule via fixturedownload.com (2025-26 season).');
  outputLines.push('');
  
  fs.writeFileSync(outputFile, outputLines.join('\n'), 'utf-8');
  console.log(`\n✅ Generated schedule with ${processedGames.length} games`);
  console.log(`📄 Output: ${outputFile}`);
}

fetchSchedule().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

