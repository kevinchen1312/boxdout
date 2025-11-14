#!/usr/bin/env node
/**
 * Download remaining ACB and other team logos found via browser
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Logos found via browser automation - will be populated
const foundLogos = {};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': 'https://www.acb.com/',
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
  console.log('🏀 Downloading Remaining Logos\n');
  console.log('='.repeat(70));
  
  // Wait for browser results - this will be populated from browser automation
  console.log('Waiting for browser automation results...\n');
  
  // For now, try common ACB logo paths
  const acbTeams = {
    'baxi-manresa': 'https://static.acb.com/img/www/clubes2024/2425BAXIManresaLogo.png',
    'bilbao-basket': 'https://static.acb.com/img/www/clubes2024/2425SurneBilbaoBasketLogo.png',
    'cb-girona': 'https://static.acb.com/img/www/clubes2024/2425BasketGironaLogo.png',
    'cb-granada': 'https://static.acb.com/img/www/clubes2024/2425CoviranGranadaLogo.png',
    'casademont-zaragoza': 'https://static.acb.com/img/www/clubes2024/2425CasademontZaragozaLogo.png',
    'morabanc-andorra': 'https://static.acb.com/img/www/clubes2024/2425MoraBancAndorraLogo.png',
    'rio-breogan': 'https://static.acb.com/img/www/clubes2024/2425RioBreoganLogo.png',
    'siblo-san-pablo-burgos': 'https://static.acb.com/img/www/clubes2024/2425RecoletasSaludSanPabloBurgosLogo.png',
    'ucam-murcia-cb': 'https://static.acb.com/img/www/clubes2024/2425UCAMMurciaCBLogo.png',
  };
  
  let success = 0;
  let failed = 0;
  
  for (const [teamName, url] of Object.entries(acbTeams)) {
    const filepath = path.join(logosDir, `${teamName}.png`);
    
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      if (stats.size > 5000) {
        console.log(`⏭️  ${teamName}: Already exists`);
        continue;
      }
    }
    
    process.stdout.write(`📥 ${teamName}... `);
    try {
      const size = await downloadFile(url, filepath);
      console.log(`✓ Success! (${size} bytes)`);
      success++;
    } catch (error) {
      console.log(`✗ Failed: ${error.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ✅ ${success} | ❌ ${failed}\n`);
}

main().catch(console.error);

