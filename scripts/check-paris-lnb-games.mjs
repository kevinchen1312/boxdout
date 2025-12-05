#!/usr/bin/env node

/**
 * Script to fetch and display Paris Basketball LNB Pro A games
 * Try multiple league IDs to find the correct one
 */

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const currentYear = new Date().getFullYear();
const nextYear = currentYear + 1;
const seasonsToTry = [
  `${currentYear}-${nextYear}`,  // 2025-2026
  `${currentYear - 1}-${currentYear}`,  // 2024-2025
];

// Try multiple league IDs - the console showed "League 2: LNB"
const leagueIdsToTry = [2, 118];

async function fetchParisLnbGames() {
  console.log('🔵🔵🔵 PARIS BASKETBALL LNB PRO A GAMES 🔵🔵🔵\n');
  
  const teamId = 108; // Paris Basketball
  
  for (const leagueId of leagueIdsToTry) {
    console.log(`\n🔵🔵🔵 Testing League ID: ${leagueId} 🔵🔵🔵\n`);
    
    for (const season of seasonsToTry) {
      console.log(`\n🔵 Season: ${season}`);
      console.log(`🔵 Fetching games for team ${teamId} in league ${leagueId}...\n`);
      
      try {
        const gamesParams = new URLSearchParams({
          team: String(teamId),
          league: String(leagueId),
          season: season,
        });
        const gamesUrl = `${BASE_URL}/games?${gamesParams.toString()}`;
        
        const gamesResponse = await fetch(gamesUrl, {
          headers: {
            'x-apisports-key': API_KEY,
          },
        });
        
        if (!gamesResponse.ok) {
          console.log(`❌ Failed: ${gamesResponse.status} ${gamesResponse.statusText}`);
          const errorText = await gamesResponse.text();
          console.log(`   Error: ${errorText.substring(0, 200)}`);
          continue;
        }
        
        const gamesData = await gamesResponse.json();
        const games = gamesData.response || [];
        
        console.log(`✅ Found ${games.length} games\n`);
        
        if (games.length > 0) {
          // Sort by date
          games.sort((a, b) => new Date(a.date) - new Date(b.date));
          
          // Display first 20 games
          const gamesToShow = games.slice(0, 20);
          console.log(`\n📋 First ${gamesToShow.length} games:\n`);
          gamesToShow.forEach((game, idx) => {
            const date = new Date(game.date);
            const dateStr = date.toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              year: 'numeric' 
            });
            const timeStr = date.toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit',
              timeZoneName: 'short'
            });
            
            const homeTeam = game.teams?.home?.name || 'Unknown';
            const awayTeam = game.teams?.away?.name || 'Unknown';
            const status = game.status?.long || game.status?.short || 'Scheduled';
            const leagueName = game.league?.name || 'Unknown League';
            
            console.log(`${idx + 1}. ${dateStr} @ ${timeStr}`);
            console.log(`   ${awayTeam} @ ${homeTeam}`);
            console.log(`   League: ${leagueName} (ID: ${game.league?.id || 'N/A'})`);
            console.log(`   Status: ${status}`);
            if (game.scores?.home || game.scores?.away) {
              console.log(`   Score: ${game.scores?.away || 0} - ${game.scores?.home || 0}`);
            }
            console.log('');
          });
          
          if (games.length > 20) {
            console.log(`... and ${games.length - 20} more games\n`);
          }
          
          // Summary by month
          const gamesByMonth = new Map();
          games.forEach(game => {
            const date = new Date(game.date);
            const monthKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            if (!gamesByMonth.has(monthKey)) {
              gamesByMonth.set(monthKey, []);
            }
            gamesByMonth.get(monthKey).push(game);
          });
          
          console.log('\n📅 Games by Month:');
          Array.from(gamesByMonth.entries())
            .sort((a, b) => new Date(a[1][0].date) - new Date(b[1][0].date))
            .forEach(([month, monthGames]) => {
              console.log(`   ${month}: ${monthGames.length} games`);
            });
          
          // Return early if we found games
          return;
        }
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
    }
  }
}

fetchParisLnbGames().catch(console.error);
