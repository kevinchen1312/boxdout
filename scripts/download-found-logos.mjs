#!/usr/bin/env node
/**
 * Download logos found via browser automation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Logos found via browser automation
const foundLogos = {
  'dreamland-gran-canaria': 'https://www.acb.com/Documentos/Static/0000816482-16-9-02.jpg',
  'lenovo-tenerife': 'https://static.acb.com/img/www/clubes2024/2425LaLagunaTenerifeLogo.png',
  'csp-limoges': 'https://assets.altrstat.xyz/images/Basketball/Team/1789/logoBlack/md.png',
  'jl-bourg-en-bresse': 'https://media-cdn.incrowdsports.com/d4225e1b-7c1b-4382-98d4-ca8511c64441.png',
  'jda-dijon-basket': 'https://assets.altrstat.xyz/images/Basketball/Team/1785/logoBlack/md.png',
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': 'https://www.google.com/',
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
  console.log('🏀 Downloading Found Logos\n');
  console.log('='.repeat(70));
  
  let success = 0;
  let failed = 0;
  
  for (const [teamName, url] of Object.entries(foundLogos)) {
    const ext = url.includes('.jpg') ? 'jpg' : url.includes('.svg') ? 'svg' : 'png';
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






