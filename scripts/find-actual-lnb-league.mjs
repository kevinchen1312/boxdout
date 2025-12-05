#!/usr/bin/env node

/**
 * Script to find the actual LNB Pro A league ID by searching all leagues
 */

const API_KEY = process.env.API_SPORTS_BASKETBALL_KEY || process.env.RAPIDAPI_BASKETBALL_KEY || '137753bdboce20234730692c73';
const BASE_URL = process.env.API_SPORTS_ENDPOINT || 'https://v1.basketball.api-sports.io';

async function findLnbProA() {
  console.log('🔵 Finding LNB Pro A league...\n');
  
  try {
    // Get all leagues
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
    
    // Search for LNB Pro A by various names
    const lnbKeywords = ['pro a', 'betclic', 'lnb élite', 'lnb elite', 'france', 'french'];
    const potentialLnbLeagues = allLeagues.filter((league) => {
      const leagueName = (league.name || '').toLowerCase();
      const countryName = (league.country?.name || '').toLowerCase();
      
      // Must be from France
      if (!countryName.includes('france')) return false;
      
      // Must match LNB keywords
      return lnbKeywords.some(keyword => leagueName.includes(keyword)) ||
             leagueName.includes('pro a') ||
             (leagueName.includes('élite') && countryName.includes('france'));
    });
    
    console.log(`✅ Found ${potentialLnbLeagues.length} potential LNB Pro A leagues:\n`);
    
    for (const league of potentialLnbLeagues) {
      console.log(`League ID ${league.id}: "${league.name}"`);
      console.log(`   Country: ${league.country?.name || 'Unknown'}`);
      console.log(`   Type: ${league.type || 'Unknown'}`);
      
      // Try to fetch teams for this league
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;
      const season = `${currentYear}-${nextYear}`;
      
      try {
        const teamsParams = new URLSearchParams({
          league: String(league.id),
          season: season,
        });
        const teamsUrl = `${BASE_URL}/teams?${teamsParams.toString()}`;
        
        const teamsResponse = await fetch(teamsUrl, {
          headers: {
            'x-apisports-key': API_KEY,
          },
        });
        
        if (teamsResponse.ok) {
          const teamsData = await teamsResponse.json();
          const teams = teamsData.response || [];
          
          // Check if Paris is in this league
          const parisTeam = teams.find(t => 
            (t.name || '').toLowerCase().includes('paris') &&
            !(t.name || '').toLowerCase().includes('u21') &&
            !(t.name || '').toLowerCase().includes('21')
          );
          
          if (parisTeam) {
            console.log(`   ✅ FOUND PARIS: ID=${parisTeam.id}, Name="${parisTeam.name}"`);
            
            // Try to fetch games
            const gamesParams = new URLSearchParams({
              team: String(parisTeam.id),
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
              console.log(`   ✅ Found ${games.length} games for Paris in this league`);
              
              if (games.length > 0) {
                console.log(`   📋 Sample games:`);
                games.slice(0, 3).forEach((game, idx) => {
                  const date = new Date(game.date);
                  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  console.log(`      ${idx + 1}. ${dateStr}: ${game.teams?.away?.name} @ ${game.teams?.home?.name}`);
                });
              }
            }
          } else {
            console.log(`   Teams found: ${teams.length} (no Paris main team)`);
          }
        }
      } catch (error) {
        // Skip errors
      }
      
      console.log('');
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

findLnbProA().catch(console.error);




