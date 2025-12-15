// Quick script to check what teams are in international_teams table

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('📋 Fetching teams from international_teams table...\n');
  
  // Get total count first
  const { count, error: countError } = await supabase
    .from('international_teams')
    .select('*', { count: 'exact', head: true });
  
  if (countError) {
    console.error('❌ Error getting count:', countError);
    process.exit(1);
  }
  
  console.log(`Total teams in database: ${count}\n`);
  
  // Get all teams with pagination (Supabase default limit is 1000)
  let allTeams: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;
  
  while (hasMore) {
    const { data: teams, error } = await supabase
      .from('international_teams')
      .select('id, name, api_team_id, league_name, country')
      .order('name')
      .range(from, from + pageSize - 1);
    
    if (error) {
      console.error('❌ Error fetching teams:', error);
      process.exit(1);
    }
    
    if (teams && teams.length > 0) {
      allTeams.push(...teams);
      from += pageSize;
      hasMore = teams.length === pageSize;
    } else {
      hasMore = false;
    }
  }
  
  const teams = allTeams;
  
  if (teams.length === 0) {
    console.log('No teams found in database');
    return;
  }
  
  console.log(`Successfully fetched ${teams.length} teams (out of ${count} total):\n`);
  
  // Check for specific teams we're looking for
  const searchTerms = ['ASVEL', 'Partizan', 'Chalon', 'Lyon', 'LDLC'];
  
  console.log('🔍 Looking for specific teams:');
  searchTerms.forEach(term => {
    const matches = teams.filter(t => 
      t.name.toLowerCase().includes(term.toLowerCase())
    );
    if (matches.length > 0) {
      console.log(`\n  "${term}":`);
      matches.forEach(t => {
        console.log(`    - ${t.name} (API ID: ${t.api_team_id}, League: ${t.league_name || 'N/A'})`);
      });
    } else {
      console.log(`\n  "${term}": Not found`);
    }
  });
  
  // Show teams with API IDs we're looking for
  console.log('\n\n🔍 Teams with specific API IDs:');
  const targetApiIds = [26, 1068, 20]; // ASVEL, Partizan, Chalon
  targetApiIds.forEach(apiId => {
    const match = teams.find(t => t.api_team_id === apiId);
    if (match) {
      console.log(`  API ID ${apiId}: ${match.name} (League: ${match.league_name || 'N/A'})`);
    } else {
      console.log(`  API ID ${apiId}: Not found`);
    }
  });
  
  // Export full list to file
  const fs = require('fs');
  const path = require('path');
  const outputPath = path.join(process.cwd(), 'international-teams-list.json');
  
  const teamsList = teams.map(t => ({
    name: t.name,
    api_team_id: t.api_team_id,
    league_name: t.league_name,
    country: t.country,
    id: t.id,
  }));
  
  fs.writeFileSync(outputPath, JSON.stringify(teamsList, null, 2));
  console.log(`\n✅ Full list exported to: ${outputPath}`);
  
  // Show first 20 teams as sample
  console.log('\n\n📊 Sample of teams (first 20):');
  teams.slice(0, 20).forEach(t => {
    console.log(`  - ${t.name} (API ID: ${t.api_team_id}, League: ${t.league_name || 'N/A'})`);
  });
  
  // Show last 20 teams as sample
  console.log('\n\n📊 Sample of teams (last 20):');
  teams.slice(-20).forEach(t => {
    console.log(`  - ${t.name} (API ID: ${t.api_team_id}, League: ${t.league_name || 'N/A'})`);
  });
  
  // Count by league
  console.log('\n\n📊 Teams by league:');
  const byLeague: Record<string, number> = {};
  teams.forEach(t => {
    const league = t.league_name || 'Unknown';
    byLeague[league] = (byLeague[league] || 0) + 1;
  });
  
  Object.entries(byLeague)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([league, count]) => {
      console.log(`  ${league}: ${count} teams`);
    });
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

