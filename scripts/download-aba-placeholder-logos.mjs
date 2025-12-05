#!/usr/bin/env node
/**
 * Download real logos for ABA League teams that currently have placeholder SVGs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Teams with placeholder SVGs that need real logos
const teamsToDownload = {
  'bosna-bh-telecom': [
    'https://www.aba-liga.com/wp-content/uploads/2024/09/bosna-logo.png',
    'https://upload.wikimedia.org/wikipedia/en/thumb/0/0a/Bosna_Royal_logo.svg/200px-Bosna_Royal_logo.svg.png',
    'https://www.aba-liga.com/wp-content/themes/aba-liga/assets/images/teams/bosna.png',
  ],
  'bc-vienna': [
    'https://www.aba-liga.com/wp-content/uploads/2024/09/vienna-logo.png',
    'https://www.aba-liga.com/wp-content/themes/aba-liga/assets/images/teams/vienna.png',
    'https://upload.wikimedia.org/wikipedia/en/thumb/1/1a/BC_Vienna_logo.svg/200px-BC_Vienna_logo.svg.png',
  ],
  'ilirija': [
    'https://www.aba-liga.com/wp-content/uploads/2024/09/ilirija-logo.png',
    'https://www.aba-liga.com/wp-content/themes/aba-liga/assets/images/teams/ilirija.png',
  ],
  'zadar': [
    'https://www.aba-liga.com/wp-content/uploads/2024/09/zadar-logo.png',
    'https://www.aba-liga.com/wp-content/themes/aba-liga/assets/images/teams/zadar.png',
    'https://upload.wikimedia.org/wikipedia/en/thumb/5/5a/KK_Zadar_logo.svg/200px-KK_Zadar_logo.svg.png',
  ],
  'spartak': [
    'https://www.aba-liga.com/wp-content/uploads/2024/09/spartak-logo.png',
    'https://www.aba-liga.com/wp-content/themes/aba-liga/assets/images/teams/spartak.png',
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
      
      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('image') && !contentType.includes('svg') && !contentType.includes('octet-stream') && !contentType.includes('binary')) {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        reject(new Error(`Not an image: ${contentType}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(filepath);
        if (stats.size < 1000) {
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
  console.log('🏀 Downloading Real Logos for ABA League Teams\n');
  console.log('='.repeat(70));
  
  let success = 0;
  let failed = 0;
  
  for (const [teamName, urls] of Object.entries(teamsToDownload)) {
    // Check if we already have a real logo (larger than 5KB)
    const existingSvg = path.join(logosDir, `${teamName}.svg`);
    const existingPng = path.join(logosDir, `${teamName}.png`);
    
    let shouldDownload = true;
    if (fs.existsSync(existingPng)) {
      const stats = fs.statSync(existingPng);
      if (stats.size > 5000) {
        console.log(`⏭️  ${teamName}: Already has real logo (${stats.size} bytes)`);
        shouldDownload = false;
      }
    }
    
    if (!shouldDownload) continue;
    
    console.log(`\n📥 ${teamName.toUpperCase()}:`);
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const ext = url.includes('.svg') ? 'svg' : 'png';
      const filepath = path.join(logosDir, `${teamName}.${ext}`);
      
      // Remove old placeholder if it exists
      if (fs.existsSync(existingSvg) && filepath !== existingSvg) {
        fs.unlinkSync(existingSvg);
      }
      
      try {
        process.stdout.write(`  [${i + 1}/${urls.length}] Trying... `);
        const size = await downloadFile(url, filepath);
        console.log(`✓ Success! (${size} bytes)`);
        success++;
        break;
      } catch (error) {
        process.stdout.write(`✗ ${error.message.substring(0, 40)}\n`);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
    if (!fs.existsSync(path.join(logosDir, `${teamName}.png`)) && 
        !fs.existsSync(path.join(logosDir, `${teamName}.svg`))) {
      console.log(`  ❌ All sources failed`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ✅ ${success} | ❌ ${failed}\n`);
}

main().catch(console.error);






