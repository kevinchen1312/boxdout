#!/usr/bin/env node

/**
 * Script to directly fetch Paris Basketball games
 * Try all possible league IDs that might be LNB Pro A
 */

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

const teamId = 108; // Paris Basketball
const seasons = ['2025-2026', '2024-2025'];

// Try a range of league IDs that might be LNB Pro A
// Common basketball league IDs: 1-200
const leagueIdsToTry = [1, 2, 3, 4, 5, 118, 119, 120];

async function fetchGamesForLeague(leagueId) {
  console.log(`\n🔵 Testing League ID: ${leagueId}\n`);
  
  for (const season of seasons) {
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
        continue; // Skip failed requests
      }
      
      const gamesData = await gamesResponse.json();
      const games = gamesData.response || [];
      
      if (games.length > 0) {
        const leagueName = games[0]?.league?.name || 'Unknown';
        console.log(`✅ FOUND ${games.length} games in League ${leagueId} ("${leagueName}") for season ${season}`);
        
        // Show first 10 games
        games.sort((a, b) => new Date(a.date) - new Date(b.date));
        console.log(`\n📋 First 10 games:\n`);
        games.slice(0, 10).forEach((game, idx) => {
          const date = new Date(game.date);
          const dateStr = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          });
          const timeStr = date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit'
          });
          
          const homeTeam = game.teams?.home?.name || 'Unknown';
          const awayTeam = game.teams?.away?.name || 'Unknown';
          
          console.log(`${idx + 1}. ${dateStr} @ ${timeStr}`);
          console.log(`   ${awayTeam} @ ${homeTeam}`);
          if (game.scores?.home || game.scores?.away) {
            console.log(`   Score: ${game.scores?.away || 0} - ${game.scores?.home || 0}`);
          }
          console.log('');
        });
        
        if (games.length > 10) {
          console.log(`... and ${games.length - 10} more games\n`);
        }
        
        return { leagueId, leagueName, games, season };
      }
    } catch (error) {
      // Skip errors
    }
  }
  
  return null;
}

async function main() {
  console.log('🔵🔵🔵 SEARCHING FOR PARIS BASKETBALL LNB GAMES 🔵🔵🔵\n');
  console.log(`Team ID: ${teamId} (Paris Basketball)\n`);
  
  for (const leagueId of leagueIdsToTry) {
    const result = await fetchGamesForLeague(leagueId);
    if (result) {
      console.log(`\n✅ SUCCESS! Found games in League ${result.leagueId} ("${result.leagueName}")`);
      console.log(`   Season: ${result.season}`);
      console.log(`   Total games: ${result.games.length}`);
      break;
    }
  }
}

main().catch(console.error);




