#!/usr/bin/env node
/**
 * Download ACB logos found via browser automation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Logos found via browser automation from ACB website
const acbLogos = {
  'baxi-manresa': 'https://static.acb.com/img/31/9/2f/75632.png',
  'bilbao-basket': 'https://static.acb.com/img/www/clubes2022/logo_surnebb_pos.png',
  'cb-girona': 'https://static.acb.com/img/www/clubes2023/BASQUET-GIRONA-Logonegativo2223.png',
  'cb-granada': 'https://static.acb.com/img/www/clubes2024/2425CoviranGranadapositivo.png',
  'casademont-zaragoza': 'https://static.acb.com/img/www/clubes2024/2425CasademontZaragoza.png',
  'morabanc-andorra': 'https://static.acb.com/img/43/43/28/75593.png',
  'rio-breogan': 'https://static.acb.com/logos/1718/breogan_00.png',
  'siblo-san-pablo-burgos': 'https://static.acb.com/img/www/clubes2025/2526SanPabloLogo.png',
  'ucam-murcia-cb': 'https://static.acb.com/img/www/clubes2024/2425UCAMMurciapositivo.png',
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/svg+xml,image/png,image/jpeg,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.acb.com/',
      },
      timeout: 20000,
    };
    
    const req = https.get(url, options, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode)) {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        const location = response.headers.location;
        if (location) {
          const absoluteUrl = location.startsWith('http') ? location : new URL(location, url).href;
          return downloadFile(absoluteUrl, filepath).then(resolve).catch(reject);
        }
        reject(new Error('Redirect without location'));
        return;
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
  console.log('🏀 Downloading ACB Logos from Browser URLs\n');
  console.log('='.repeat(70));
  
  let success = 0;
  let failed = 0;
  
  for (const [teamName, url] of Object.entries(acbLogos)) {
    const ext = url.includes('.svg') ? 'svg' : 'png';
    const filepath = path.join(logosDir, `${teamName}.${ext}`);
    
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







