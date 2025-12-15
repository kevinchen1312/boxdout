#!/usr/bin/env node

/**
 * Script to find all French/LNB leagues and their IDs
 */

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

async function findFrenchLeagues() {
  console.log('🔵 Finding all French/LNB leagues...\n');
  
  try {
    const leaguesUrl = `${BASE_URL}/leagues`;
    const leaguesResponse = await fetch(leaguesUrl, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    if (!leaguesResponse.ok) {
      console.log(`❌ Failed: ${leaguesResponse.status}`);
      return;
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
    
    console.log(`✅ Found ${frenchLeagues.length} French/LNB leagues:\n`);
    frenchLeagues.forEach((league, idx) => {
      console.log(`${idx + 1}. League ID ${league.id}: "${league.name}"`);
      console.log(`   Country: ${league.country?.name || 'Unknown'}`);
      console.log(`   Type: ${league.type || 'Unknown'}`);
      console.log('');
    });
    
    // Now try to fetch games for Paris (ID 108) in each league
    const teamId = 108;
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const season = `${currentYear}-${nextYear}`;
    
    console.log(`\n🔵 Testing Paris (ID ${teamId}) games in each league with season "${season}":\n`);
    
    for (const league of frenchLeagues) {
      try {
        const gamesParams = new URLSearchParams({
          team: String(teamId),
          league: String(league.id),
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
          console.log(`League ${league.id} ("${league.name}"): ${games.length} games`);
          
          if (games.length > 0) {
            console.log(`   ✅ FOUND GAMES! First game: ${games[0].teams?.away?.name} @ ${games[0].teams?.home?.name} on ${games[0].date}`);
            console.log(`   Sample games:`);
            games.slice(0, 5).forEach((game, idx) => {
              const date = new Date(game.date);
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              console.log(`     ${idx + 1}. ${dateStr}: ${game.teams?.away?.name} @ ${game.teams?.home?.name}`);
            });
            console.log('');
          }
        } else {
          console.log(`League ${league.id} ("${league.name}"): Failed (${gamesResponse.status})`);
        }
      } catch (error) {
        console.log(`League ${league.id} ("${league.name}"): Error - ${error.message}`);
      }
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

findFrenchLeagues().catch(console.error);





