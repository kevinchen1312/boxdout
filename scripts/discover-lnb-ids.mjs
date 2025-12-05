#!/usr/bin/env node

/**
 * Script to discover LNB Pro A team IDs for Paris Basketball and ASVEL
 * Then update the mappings in loadSchedulesFromApiBasketball.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const currentYear = new Date().getFullYear();
const nextYear = currentYear + 1;
const seasonsToTry = [
  `${currentYear}-${nextYear}`,  // 2025-2026
  `${currentYear - 1}-${currentYear}`,  // 2024-2025
  String(currentYear),  // 2025
  String(currentYear - 1),  // 2024
];

async function discoverTeamId(teamName, leagueId) {
  console.log(`\n🔵 Discovering LNB team ID for "${teamName}" in league ${leagueId}...`);
  
  // First, try searching by name without league filter
  try {
    console.log(`🔵   Searching teams by name "${teamName}"...`);
    const searchUrl = `${BASE_URL}/teams?search=${encodeURIComponent(teamName)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      const teams = searchData.response || [];
      console.log(`🔵   Found ${teams.length} teams matching "${teamName}"`);
      
      // Look for teams that play in the target league
      for (const team of teams) {
        // Check if this team has games in the target league
        for (const season of seasonsToTry) {
          const gamesParams = new URLSearchParams({
            team: String(team.id),
            league: String(leagueId),
            season: season,
          });
          const gamesUrl = `${BASE_URL}/games?${gamesParams.toString()}`;
          const gamesResponse = await fetch(gamesUrl, {
            headers: {
              'x-apisports-key': API_KEY,
            },
          });
          
          if (gamesResponse.ok) {
            const gamesData = await gamesResponse.json();
            const games = gamesData.response || [];
            if (games.length > 0) {
              console.log(`🔵   ✅ Found: ID=${team.id}, Name="${team.name}" (${games.length} games in league ${leagueId}, season: ${season})`);
              console.log(`🔵   ✅ Sample game: ${games[0].teams?.away?.name} @ ${games[0].teams?.home?.name} on ${games[0].date}`);
              return team.id;
            }
          }
        }
      }
    }
  } catch (error) {
    console.log(`🔵     Search error: ${error.message}`);
  }
  
  // Fallback: try searching within the league
  for (const season of seasonsToTry) {
    try {
      const teamsParams = new URLSearchParams({
        league: String(leagueId),
        season: season,
      });
      const teamsUrl = `${BASE_URL}/teams?${teamsParams.toString()}`;
      
      console.log(`🔵   Trying league ${leagueId}, season ${season}...`);
      const teamsResponse = await fetch(teamsUrl, {
        headers: {
          'x-apisports-key': API_KEY,
        },
      });
      
      if (!teamsResponse.ok) {
        console.log(`🔵     Failed: ${teamsResponse.status}`);
        continue;
      }
      
      const teamsData = await teamsResponse.json();
      const teams = teamsData.response || [];
      
      if (teams.length === 0) {
        console.log(`🔵     No teams found`);
        continue;
      }
      
      // Search for matching team
      const normalizedSearchName = teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matchingTeam = teams.find((team) => {
        const teamNameNormalized = (team.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return teamNameNormalized.includes(normalizedSearchName) || 
               normalizedSearchName.includes(teamNameNormalized) ||
               (normalizedSearchName.includes('paris') && teamNameNormalized.includes('paris')) ||
               (normalizedSearchName.includes('asvel') && (teamNameNormalized.includes('asvel') || teamNameNormalized.includes('lyon')));
      });
      
      if (matchingTeam) {
        console.log(`🔵   ✅ Found: ID=${matchingTeam.id}, Name="${matchingTeam.name}" (season: ${season})`);
        
        // Verify we can fetch games with this ID
        const gamesParams = new URLSearchParams({
          team: String(matchingTeam.id),
          league: String(leagueId),
          season: season,
        });
        const gamesUrl = `${BASE_URL}/games?${gamesParams.toString()}`;
        const gamesResponse = await fetch(gamesUrl, {
          headers: {
            'x-apisports-key': API_KEY,
          },
        });
        
        if (gamesResponse.ok) {
          const gamesData = await gamesResponse.json();
          const games = gamesData.response || [];
          console.log(`🔵   ✅ Verified: Found ${games.length} games`);
          if (games.length > 0) {
            console.log(`🔵   ✅ Sample game: ${games[0].teams?.away?.name} @ ${games[0].teams?.home?.name} on ${games[0].date}`);
          }
        }
        
        return matchingTeam.id;
      } else {
        console.log(`🔵     No match found (found ${teams.length} teams)`);
      }
    } catch (error) {
      console.log(`🔵     Error: ${error.message}`);
    }
  }
  
  return null;
}

async function findFrenchLeague() {
  console.log('🔵 Finding French/LNB leagues...\n');
  
  try {
    const leaguesUrl = `${BASE_URL}/leagues`;
    const leaguesResponse = await fetch(leaguesUrl, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    if (!leaguesResponse.ok) {
      console.log(`❌ Failed to fetch leagues: ${leaguesResponse.status}`);
      return null;
    }
    
    const leaguesData = await leaguesResponse.json();
    const allLeagues = leaguesData.response || [];
    
    const frenchLeagueKeywords = ['lnb', 'élite', 'elite', 'betclic', 'pro a', 'france'];
    const frenchLeagues = allLeagues.filter((league) => {
      const leagueName = (league.name || '').toLowerCase();
      const countryName = (league.country?.name || '').toLowerCase();
      return countryName.includes('france') || 
             frenchLeagueKeywords.some(keyword => leagueName.includes(keyword));
    });
    
    console.log(`🔵 Found ${frenchLeagues.length} potential French/LNB leagues:`);
    frenchLeagues.forEach((league) => {
      console.log(`🔵   League ID ${league.id}: "${league.name}" (Country: ${league.country?.name || 'Unknown'})`);
    });
    
    // Try to find the main LNB Pro A league (usually has "Pro A" or "Betclic" in the name)
    const lnbLeague = frenchLeagues.find(l => 
      l.name.toLowerCase().includes('pro a') || 
      l.name.toLowerCase().includes('betclic') ||
      l.name.toLowerCase().includes('lnb')
    ) || frenchLeagues[0];
    
    if (lnbLeague) {
      console.log(`\n✅ Using league: ${lnbLeague.id} - "${lnbLeague.name}"\n`);
      return lnbLeague.id;
    }
    
    return null;
  } catch (error) {
    console.log(`❌ Error finding leagues: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🔵🔵🔵 LNB PRO A TEAM ID DISCOVERY 🔵🔵🔵\n');
  
  // First, find the correct French league ID
  const leagueId = await findFrenchLeague();
  
  const finalLeagueId = leagueId || 118;
  
  if (!leagueId) {
    console.log('⚠️  Could not find French league. Trying default league 118...\n');
  }
  
  // Discover Paris Basketball
  const parisId = await discoverTeamId('Paris', finalLeagueId);
  
  // Discover ASVEL
  const asvelId = await discoverTeamId('ASVEL', finalLeagueId);
  
  console.log('\n🔵🔵🔵 RESULTS 🔵🔵🔵\n');
  console.log(`Paris Basketball LNB Team ID: ${parisId || 'NOT FOUND'}`);
  console.log(`ASVEL LNB Team ID: ${asvelId || 'NOT FOUND'}`);
  
  if (parisId || asvelId) {
    // Update the mappings file
    const filePath = join(process.cwd(), 'lib', 'loadSchedulesFromApiBasketball.ts');
    let content = readFileSync(filePath, 'utf-8');
    
    if (parisId) {
      // Update all Paris entries
      content = content.replace(
        /('parisbasketball':\s*\{[^}]*lnbTeamId:\s*)undefined/g,
        `$1${parisId}`
      );
      content = content.replace(
        /('parisbasket':\s*\{[^}]*lnbTeamId:\s*)undefined/g,
        `$1${parisId}`
      );
      content = content.replace(
        /('paris':\s*\{[^}]*lnbTeamId:\s*)undefined/g,
        `$1${parisId}`
      );
      console.log(`\n✅ Updated Paris mappings with LNB team ID: ${parisId}`);
    }
    
    if (asvelId) {
      // Update all ASVEL entries
      content = content.replace(
        /('asvel':\s*\{[^}]*lnbTeamId:\s*)undefined/g,
        `$1${asvelId}`
      );
      content = content.replace(
        /('ldlcasvel':\s*\{[^}]*lnbTeamId:\s*)undefined/g,
        `$1${asvelId}`
      );
      content = content.replace(
        /('asvelbasket':\s*\{[^}]*lnbTeamId:\s*)undefined/g,
        `$1${asvelId}`
      );
      content = content.replace(
        /('lyonvilleurbanne':\s*\{[^}]*lnbTeamId:\s*)undefined/g,
        `$1${asvelId}`
      );
      content = content.replace(
        /('lyon':\s*\{[^}]*lnbTeamId:\s*)undefined/g,
        `$1${asvelId}`
      );
      console.log(`✅ Updated ASVEL mappings with LNB team ID: ${asvelId}`);
    }
    
    writeFileSync(filePath, content, 'utf-8');
    console.log('\n✅ Mappings file updated successfully!');
  } else {
    console.log('\n❌ No team IDs found. Please check the API manually.');
  }
}

main().catch(console.error);

