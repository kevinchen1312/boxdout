// Check what API-Basketball returns for Fenerbahce roster
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;
const BASE_URL = 'https://v1.basketball.api-sports.io';

async function checkApiBirsen() {
  console.log('🔍 Checking API-Basketball for Fenerbahce roster...\n');
  
  // Fenerbahce team ID: 1270, season: 2025-2026
  const params = new URLSearchParams({
    team: '1270',
    season: '2025-2026',
  });
  
  const url = `${BASE_URL}/players?${params.toString()}`;
  console.log(`URL: ${url}\n`);
  
  const response = await fetch(url, {
    headers: { 'x-apisports-key': apiKey! },
  });
  
  const data = await response.json();
  
  if (data.errors && Object.keys(data.errors).length > 0) {
    console.error('API Errors:', data.errors);
    return;
  }
  
  console.log(`Total players: ${data.response?.length || 0}\n`);
  
  if (data.response && data.response.length > 0) {
    // Find players with "Birsen" in name
    const birsenPlayers = data.response.filter((p: any) => 
      p.name?.toLowerCase().includes('birsen') ||
      p.firstname?.toLowerCase().includes('birsen') ||
      p.lastname?.toLowerCase().includes('birsen')
    );
    
    console.log('Players with "Birsen" in name:');
    birsenPlayers.forEach((p: any) => {
      console.log(`  ID: ${p.id}`);
      console.log(`  Name: ${p.name}`);
      console.log(`  First: ${p.firstname}`);
      console.log(`  Last: ${p.lastname}`);
      console.log(`  Position: ${p.position}`);
      console.log(`  Number: ${p.number}`);
      console.log();
    });
    
    if (birsenPlayers.length === 0) {
      console.log('No players with "Birsen" found. Showing all players:');
      data.response.forEach((p: any) => {
        console.log(`  #${p.number || '?'} ${p.name} (${p.position || 'N/A'})`);
      });
    }
  }
}

checkApiBirsen().catch(console.error);





