#!/usr/bin/env node

/**
 * Fetch EuroLeague game times from The Odds API
 * Updates only the EuroLeague portion of European player schedules
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const API_KEY = process.env.ODDS_API_KEY || 'aaf293b1fae835a0563180c575ccba81';

// Players with EuroLeague teams
const EUROLEAGUE_PLAYERS = {
  'adam_atamna_schedule.txt': {
    team: 'ASVEL',
    teamVariants: ['ASVEL', 'Villeurbanne'],
  },
  'sergio_de_larrea_schedule.txt': {
    team: 'Valencia Basket',
    teamVariants: ['Valencia'],
  },
  'mouhamed_faye_schedule.txt': {
    team: 'Paris Basketball',
    teamVariants: ['Paris'],
  },
};

console.log('Fetching EuroLeague game times from The Odds API...\n');

// Fetch EuroLeague events
async function fetchEuroLeagueGames() {
  const url = `https://api.the-odds-api.com/v4/sports/basketball_euroleague/events?apiKey=${API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    const remaining = response.headers.get('x-requests-remaining');
    console.log(`✅ Fetched ${data.length} EuroLeague games`);
    console.log(`   API requests remaining: ${remaining}\n`);
    
    return data;
  } catch (err) {
    console.error(`❌ Error fetching data: ${err.message}`);
    return [];
  }
}

// Parse a schedule file
function parseScheduleFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  return {
    lines,
    content,
  };
}

// Match a team name
function matchesTeam(eventTeam, teamVariants) {
  const eventLower = eventTeam.toLowerCase();
  return teamVariants.some(variant => eventLower.includes(variant.toLowerCase()));
}

// Format date for matching
function formatDate(isoDate) {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    timeZone: 'America/New_York'
  });
}

// Format time in ET
function formatTimeET(isoDate) {
  const date = new Date(isoDate);
  let time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
  
  // Remove leading zero
  if (time.startsWith('0')) {
    time = time.substring(1);
  }
  
  return `${time} ET`;
}

// Update schedule file with new times
function updateScheduleWithTimes(filePath, config, euroLeagueGames) {
  const { lines } = parseScheduleFile(filePath);
  let updatedLines = [...lines];
  let updateCount = 0;
  let inEuroLeagueSection = false;
  
  // Find games for this team
  const teamGames = euroLeagueGames.filter(game => 
    matchesTeam(game.home_team, config.teamVariants) || 
    matchesTeam(game.away_team, config.teamVariants)
  );
  
  console.log(`\n${filePath}:`);
  console.log(`  Found ${teamGames.length} ${config.team} games in EuroLeague data`);
  
  // Create a map of date+opponent -> time
  const gameTimeMap = new Map();
  teamGames.forEach(game => {
    const isHome = matchesTeam(game.home_team, config.teamVariants);
    const opponent = isHome ? game.away_team : game.home_team;
    const date = formatDate(game.commence_time);
    const time = formatTimeET(game.commence_time);
    
    const key = `${date}|${opponent}`;
    gameTimeMap.set(key, { time, fullDate: game.commence_time });
  });
  
  // Process each line
  for (let i = 0; i < updatedLines.length; i++) {
    const line = updatedLines[i];
    
    // Track if we're in EuroLeague section
    if (line.includes('EUROLEAGUE')) {
      inEuroLeagueSection = true;
      continue;
    }
    if (line.match(/^[A-Z][A-Z ]+\(/)) {
      // New section started (like "FRENCH JEEP ELITE")
      inEuroLeagueSection = false;
      continue;
    }
    
    // Only update EuroLeague games
    if (!inEuroLeagueSection) continue;
    
    // Look for game lines
    const dateMatch = line.match(/([A-Z][a-z]{2} \d{1,2}, \d{4})/);
    if (!dateMatch) continue;
    
    const date = dateMatch[1];
    
    // Extract opponent
    let opponent = '';
    if (line.includes(' vs ')) {
      const vsMatch = line.match(/vs ([^@]+?)(?:@|,|$)/);
      if (vsMatch) opponent = vsMatch[1].trim();
    } else if (line.includes(' @ ')) {
      const atMatch = line.match(/@ ([^@]+?)(?:@|,|$)/);
      if (atMatch) opponent = atMatch[1].trim();
    }
    
    if (!opponent) continue;
    
    // Try to match with fetched game
    const key = `${date}|${opponent}`;
    const gameData = gameTimeMap.get(key);
    
    if (gameData) {
      // Update the time
      const oldLine = updatedLines[i];
      
      // Remove old time if present
      let newLine = oldLine.replace(/, \d{1,2}:\d{2} (?:AM|PM) ET/g, '');
      
      // Find the venue @ (should be the last @)
      const atIndex = newLine.lastIndexOf(' @ ');
      
      if (atIndex !== -1 && newLine.substring(atIndex + 3).trim()) {
        // There's a venue - insert time before it
        const beforeVenue = newLine.substring(0, atIndex);
        const venueAndRest = newLine.substring(atIndex);
        newLine = `${beforeVenue}, ${gameData.time}${venueAndRest}`;
      } else {
        // No venue or couldn't parse - just append
        newLine = `${newLine.trimEnd()}, ${gameData.time}`;
      }
      
      updatedLines[i] = newLine;
      updateCount++;
      
      console.log(`  ✅ Updated: ${date} vs ${opponent} → ${gameData.time}`);
    }
  }
  
  // Write updated file
  if (updateCount > 0) {
    writeFileSync(filePath, updatedLines.join('\n'), 'utf-8');
    console.log(`  📝 Updated ${updateCount} game times in ${filePath}`);
  } else {
    console.log(`  ⚠️  No games updated (might be off-season or no upcoming games)`);
  }
  
  return updateCount;
}

// Main execution
async function main() {
  const euroLeagueGames = await fetchEuroLeagueGames();
  
  if (euroLeagueGames.length === 0) {
    console.log('⚠️  No EuroLeague games found. Season might be over or API error.');
    return;
  }
  
  let totalUpdates = 0;
  
  for (const [filename, config] of Object.entries(EUROLEAGUE_PLAYERS)) {
    const filePath = join(process.cwd(), filename);
    const updates = updateScheduleWithTimes(filePath, config, euroLeagueGames);
    totalUpdates += updates;
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Complete! Updated ${totalUpdates} total game times across ${Object.keys(EUROLEAGUE_PLAYERS).length} players`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

