#!/usr/bin/env node
/**
 * Download ABA League team logos using the pattern found via browser inspection
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// ABA League team IDs found from team pages
// Pattern: https://www.aba-liga.com/images/club/150x150/{TEAM_ID}.png
const abaLeagueLogos = {
  'mega-superbet': [
    'https://www.aba-liga.com/images/club/150x150/13.png', // Mega Basket
    'https://www.aba-liga.com/images/club/300x300/13.png', // Try larger size
  ],
  'cedevita-olimpija': [
    'https://www.aba-liga.com/images/club/150x150/66.png', // Cedevita Olimpija
    'https://www.aba-liga.com/images/club/300x300/66.png',
  ],
  'buducnost': [
    'https://www.aba-liga.com/images/club/150x150/12.png', // Budućnost VOLI
    'https://www.aba-liga.com/images/club/300x300/12.png',
  ],
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': 'https://www.aba-liga.com/',
      },
      timeout: 20000,
    };
    
    const req = https.get(url, options, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode)) {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        return downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(filepath);
        if (stats.size < 100) {
          fs.unlinkSync(filepath);
          reject(new Error('File too small'));
          return;
        }
        resolve(stats.size);
      });
    });
    
    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function main() {
  console.log('🏀 Downloading ABA League Logos\n');
  console.log('='.repeat(70));
  
  let success = 0;
  let failed = 0;
  
  for (const [teamName, urls] of Object.entries(abaLeagueLogos)) {
    const filepath = path.join(logosDir, `${teamName}.png`);
    
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      if (stats.size > 5000) {
        console.log(`⏭️  ${teamName}: Already exists (${stats.size} bytes)`);
        continue;
      } else {
        fs.unlinkSync(filepath);
      }
    }
    
    process.stdout.write(`📥 ${teamName}... `);
    let downloaded = false;
    
    for (const url of urls) {
      try {
        const size = await downloadFile(url, filepath);
        console.log(`✓ Success! (${size} bytes)`);
        success++;
        downloaded = true;
        break;
      } catch (error) {
        if (url === urls[urls.length - 1]) {
          console.log(`✗ Failed: ${error.message}`);
          failed++;
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ✅ ${success} | ❌ ${failed}\n`);
}

main().catch(console.error);







