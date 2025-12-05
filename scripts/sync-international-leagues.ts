// Sync all international basketball leagues and teams from API-Basketball
// This script discovers all basketball leagues and their teams, excluding USA leagues

import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') }); // Load .env.local

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

if (!apiKey) {
  console.error('Missing API_BASKETBALL_KEY - set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BASE_URL = 'https://v1.basketball.api-sports.io';

interface League {
  id: number;
  name: string;
  type: string;
  logo: string;
  country: {
    id: number;
    name: string;
    code: string;
    flag: string;
  };
  seasons: Array<{
    season: string;
    start: string;
    end: string;
  }>;
}

interface Team {
  id: number;
  name: string;
  logo: string;
  country: {
    id: number;
    name: string;
    code: string;
  };
}

// Determine season format from league seasons
function detectSeasonFormat(seasons: any[]): 'YYYY' | 'YYYY-YYYY' {
  if (!seasons || seasons.length === 0) return 'YYYY';
  
  const recentSeasons = seasons.slice(0, 3);
  const hasRangeFormat = recentSeasons.some(s => {
    if (!s.season) return false;
    const seasonStr = String(s.season);
    return seasonStr.includes('-') && seasonStr.match(/^\d{4}-\d{4}$/);
  });
  
  return hasRangeFormat ? 'YYYY-YYYY' : 'YYYY';
}

// Fetch all basketball leagues
async function fetchAllLeagues(): Promise<League[]> {
  try {
    console.log('🔍 Fetching all basketball leagues from API...');
    
    const url = `${BASE_URL}/leagues`;
    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey! },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const allLeagues = data.response || [];
    
    console.log(`   Found ${allLeagues.length} total leagues`);
    
    // Filter out USA leagues (NBA, NCAA, G-League, etc.)
    const internationalLeagues = allLeagues.filter((league: League) => {
      const countryName = league.country?.name?.toLowerCase() || '';
      const leagueName = league.name?.toLowerCase() || '';
      
      // Exclude USA leagues
      if (countryName === 'usa' || countryName === 'united states') {
        return false;
      }
      
      // Exclude specific USA leagues even if not tagged as USA
      const usaLeagues = ['nba', 'ncaa', 'g-league', 'gleague', 'wnba', 'nbl-usa'];
      if (usaLeagues.some(usa => leagueName.includes(usa))) {
        return false;
      }
      
      return true;
    });
    
    console.log(`   Filtered to ${internationalLeagues.length} international leagues`);
    
    return internationalLeagues;
  } catch (error) {
    console.error('Error fetching leagues:', error);
    return [];
  }
}

// Fetch teams for a specific league
async function fetchTeamsForLeague(leagueId: number, season: string): Promise<Team[]> {
  try {
    const params = new URLSearchParams({
      league: String(leagueId),
      season: season,
    });
    
    const url = `${BASE_URL}/teams?${params.toString()}`;
    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey! },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.response || [];
  } catch (error) {
    console.error(`Error fetching teams for league ${leagueId}:`, error);
    return [];
  }
}

// Store teams in database
async function storeTeams(teams: Team[], leagueId: number, leagueName: string, seasonFormat: 'YYYY' | 'YYYY-YYYY'): Promise<number> {
  let storedCount = 0;
  
  for (const team of teams) {
    try {
      const { error } = await supabase
        .from('international_teams')
        .upsert({
          api_team_id: team.id,
          name: team.name,
          logo_url: team.logo,
          country: team.country?.name,
          league_id: leagueId,
          league_name: leagueName,
          season_format: seasonFormat,
          last_synced: new Date().toISOString(),
        }, {
          onConflict: 'api_team_id',
        });

      if (!error) {
        storedCount++;
      } else {
        console.error(`Error storing team ${team.name}:`, error);
      }
    } catch (error) {
      console.error(`Exception storing team ${team.name}:`, error);
    }
  }
  
  return storedCount;
}

async function syncLeaguesAndTeams(): Promise<void> {
  console.log('🌍 Starting International Leagues and Teams Sync\n');
  console.log('='.repeat(80));
  
  // Fetch all international leagues
  const leagues = await fetchAllLeagues();
  
  if (leagues.length === 0) {
    console.log('\n❌ No leagues found. Exiting.');
    return;
  }
  
  let totalTeamsStored = 0;
  let leaguesProcessed = 0;
  
  // Get current year for season
  const currentYear = new Date().getFullYear();
  
  for (const league of leagues) {
    console.log(`\n📊 Processing: ${league.name} (ID: ${league.id}, ${league.country?.name || 'Unknown'})`);
    
    // Determine season format
    const seasonFormat = detectSeasonFormat(league.seasons);
    console.log(`   Season format: ${seasonFormat}`);
    
    // Determine which season to fetch
    let seasonToFetch: string;
    if (seasonFormat === 'YYYY-YYYY') {
      seasonToFetch = `${currentYear}-${currentYear + 1}`;
    } else {
      seasonToFetch = String(currentYear);
    }
    
    console.log(`   Fetching teams for season: ${seasonToFetch}`);
    
    // Fetch teams
    const teams = await fetchTeamsForLeague(league.id, seasonToFetch);
    console.log(`   Found ${teams.length} teams`);
    
    if (teams.length > 0) {
      // Store teams
      const stored = await storeTeams(teams, league.id, league.name, seasonFormat);
      console.log(`   ✅ Stored ${stored} teams`);
      totalTeamsStored += stored;
      leaguesProcessed++;
    } else {
      console.log(`   ⚠️  No teams found, skipping`);
    }
    
    // Rate limiting - wait 1 second between API calls
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📈 SYNC SUMMARY\n');
  console.log(`Leagues processed: ${leaguesProcessed}`);
  console.log(`Total teams stored: ${totalTeamsStored}`);
  console.log('\n✅ Sync complete!');
}

// Run sync
syncLeaguesAndTeams().catch(error => {
  console.error('Sync failed:', error);
  process.exit(1);
});

