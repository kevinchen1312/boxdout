#!/usr/bin/env node
/**
 * Find college team IDs and logos from ESPN API
 */

const teamsToFind = ['Lindenwood Lions', 'Queens University', 'Queens'];

const url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?groups=50&limit=500';

fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0',
  },
})
  .then(res => res.json())
  .then(data => {
    const teams = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
    
    console.log('🔍 Searching for college teams:\n');
    
    for (const searchTerm of teamsToFind) {
      const found = teams.find(t => {
        const team = t.team ?? t;
        const displayName = (team.displayName || '').toLowerCase();
        const name = (team.name || '').toLowerCase();
        const location = (team.location || '').toLowerCase();
        const search = searchTerm.toLowerCase();
        
        return displayName.includes(search) || 
               name.includes(search) || 
               location.includes(search) ||
               `${location} ${name}`.includes(search);
      });
      
      if (found) {
        const team = found.team ?? found;
        const logo = team.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.id}.png`;
        console.log(`✅ ${searchTerm}:`);
        console.log(`   ID: ${team.id}`);
        console.log(`   Name: ${team.displayName}`);
        console.log(`   Logo: ${logo}\n`);
      } else {
        console.log(`❌ ${searchTerm}: Not found\n`);
      }
    }
  })
  .catch(err => {
    console.error('Error:', err.message);
  });






