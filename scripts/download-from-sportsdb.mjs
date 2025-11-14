#!/usr/bin/env node
/**
 * Script to download international team logos from TheSportsDB
 * TheSportsDB provides free access to team logos and information
 * Run with: node scripts/download-from-sportsdb.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Ensure logos directory exists
if (!fs.existsSync(logosDir)) {
  fs.mkdirSync(logosDir, { recursive: true });
}

// TheSportsDB team IDs (found by searching their API)
const teamIds = {
  'baskonia': '138595',  // Saski Baskonia
  'unicaja': '138602',   // Unicaja Malaga
  'fenerbahce': '133607',  // Fenerbahce
  'anadolu-efes': '133603',  // Anadolu Efes
  'panathinaikos': '133606',  // Panathinaikos
  'olympiacos': '133605',    // Olympiacos
  'zalgiris': '136063',  // Zalgiris Kaunas
  'virtus-bologna': '138597',  // Virtus Bologna
  'armani-milan': '133602',    // Olimpia Milano
  'partizan': '134103',  // Partizan
  'crvena-zvezda': '134102',  // Crvena zvezda
  'maccabi-tel-aviv': '133601',  // Maccabi Tel Aviv
  'hapoel-tel-aviv': '133899',  // Hapoel Tel Aviv
  'monaco': '139135',    // AS Monaco
  'mega-superbet': '134104',  // KK Mega
  'cedevita-olimpija': '136067',  // Cedevita Olimpija
  'buducnost': '134105',  // Buducnost
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    };
    
    https.get(url, options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      reject(err);
    });
  });
}

async function downloadTeamLogo(teamName, teamId) {
  // TheSportsDB API endpoint
  const apiUrl = `https://www.thesportsdb.com/api/v1/json/3/lookupteam.php?id=${teamId}`;
  
  return new Promise((resolve, reject) => {
    https.get(apiUrl, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', async () => {
        try {
          const json = JSON.parse(data);
          if (json.teams && json.teams[0]) {
            const team = json.teams[0];
            // Try to get the badge/logo URL
            const logoUrl = team.strTeamBadge || team.strTeamLogo;
            
            if (logoUrl) {
              const ext = logoUrl.includes('.png') ? 'png' : 'svg';
              const filepath = path.join(logosDir, `${teamName}.${ext}`);
              
              if (fs.existsSync(filepath)) {
                console.log(`✓ ${teamName}.${ext} already exists, skipping...`);
                resolve();
                return;
              }
              
              console.log(`Downloading ${teamName}.${ext} from TheSportsDB...`);
              await downloadFile(logoUrl, filepath);
              console.log(`✓ Downloaded ${teamName}.${ext}\n`);
              resolve();
            } else {
              reject(new Error(`No logo URL found for ${teamName}`));
            }
          } else {
            reject(new Error(`Team not found: ${teamName}`));
          }
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Downloading logos from TheSportsDB...\n');
  
  for (const [teamName, teamId] of Object.entries(teamIds)) {
    try {
      await downloadTeamLogo(teamName, teamId);
    } catch (error) {
      console.error(`✗ Failed to download ${teamName}: ${error.message}\n`);
    }
  }
  
  console.log('Done!');
}

main().catch(console.error);

