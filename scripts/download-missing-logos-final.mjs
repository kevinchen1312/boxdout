#!/usr/bin/env node
/**
 * Download the logos that were reported as successful but are missing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// URLs that were reported as successful but files are missing
const missingLogos = {
  'fenerbahce': [
    'https://www.fenerbahce.org/assets/img/logo.svg',
    'https://www.fenerbahce.org/images/logo.png',
    'https://cdn.sportlogos.net/logos/32/133607/full/fenerbahce.png',
  ],
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
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
  console.log('🏀 Downloading Missing Logos\n');
  
  for (const [teamName, urls] of Object.entries(missingLogos)) {
    const urlList = Array.isArray(urls) ? urls : [urls];
    const filepath = path.join(logosDir, `${teamName}.svg`);
    const pngPath = path.join(logosDir, `${teamName}.png`);
    
    if (fs.existsSync(filepath) || fs.existsSync(pngPath)) {
      console.log(`⏭️  ${teamName}: Already exists`);
      continue;
    }
    
    process.stdout.write(`📥 ${teamName}... `);
    let success = false;
    
    for (const url of urlList) {
      const ext = url.includes('.png') ? 'png' : 'svg';
      const finalPath = path.join(logosDir, `${teamName}.${ext}`);
      
      try {
        const size = await downloadFile(url, finalPath);
        console.log(`✓ Success! (${size} bytes)`);
        success = true;
        break;
      } catch (error) {
        if (url === urlList[urlList.length - 1]) {
          console.log(`✗ Failed: ${error.message}`);
        }
      }
    }
  }
  
  console.log('\n');
}

main().catch(console.error);

