#!/usr/bin/env node
/**
 * Download ABA League logos from found URLs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// URLs found via browser automation - try larger sizes
const teamsToDownload = {
  'bosna-bh-telecom': [
    'https://www.aba-liga.com/images/club/500x500/1.png',
    'https://www.aba-liga.com/images/club/200x200/1.png',
    'https://www.aba-liga.com/images/club/50x50/1.png',
    'https://upload.wikimedia.org/wikipedia/en/0/0a/Bosna_Royal_logo.svg',
  ],
  'bc-vienna': [
    'https://www.aba-liga.com/images/club/500x500/101.png',
    'https://www.aba-liga.com/images/club/200x200/101.png',
    'https://www.aba-liga.com/images/club/50x50/101.png',
    'https://upload.wikimedia.org/wikipedia/en/1/1a/BC_Vienna_logo.svg',
  ],
  'ilirija': [
    'https://www.aba-liga.com/images/club/500x500/92.png',
    'https://www.aba-liga.com/images/club/200x200/92.png',
    'https://www.aba-liga.com/images/club/50x50/92.png',
  ],
  'zadar': [
    'https://www.aba-liga.com/images/club/500x500/3.png',
    'https://www.aba-liga.com/images/club/200x200/3.png',
    'https://www.aba-liga.com/images/club/50x50/3.png',
    'https://upload.wikimedia.org/wikipedia/en/5/5a/KK_Zadar_logo.svg',
  ],
  'spartak': [
    'https://www.aba-liga.com/images/club/500x500/91.png',
    'https://www.aba-liga.com/images/club/200x200/91.png',
    'https://www.aba-liga.com/images/club/50x50/91.png',
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
  console.log('🏀 Downloading ABA League Logos from Found URLs\n');
  console.log('='.repeat(70));
  
  let success = 0;
  let failed = 0;
  
  for (const [teamName, urls] of Object.entries(teamsToDownload)) {
    const existingSvg = path.join(logosDir, `${teamName}.svg`);
    
    console.log(`\n📥 ${teamName.toUpperCase()}:`);
    
    let downloaded = false;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const ext = url.includes('.svg') ? 'svg' : 'png';
      const filepath = path.join(logosDir, `${teamName}.${ext}`);
      
      // Remove old placeholder SVG if downloading PNG
      if (ext === 'png' && fs.existsSync(existingSvg)) {
        const oldStats = fs.statSync(existingSvg);
        if (oldStats.size < 2000) {
          fs.unlinkSync(existingSvg);
        }
      }
      
      try {
        process.stdout.write(`  [${i + 1}/${urls.length}] Trying ${url.substring(0, 60)}... `);
        const size = await downloadFile(url, filepath);
        console.log(`✓ Success! (${size} bytes)`);
        success++;
        downloaded = true;
        break;
      } catch (error) {
        process.stdout.write(`✗ ${error.message.substring(0, 30)}\n`);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
    if (!downloaded) {
      console.log(`  ❌ All sources failed`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ✅ ${success} | ❌ ${failed}\n`);
}

main().catch(console.error);






