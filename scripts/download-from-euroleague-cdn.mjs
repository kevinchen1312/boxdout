#!/usr/bin/env node
/**
 * Download logos from EuroLeague CDN URLs found via browser inspection
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// EuroLeague CDN URLs found via browser inspection
const euroleagueCdnLogos = {
  'anadolu-efes': 'https://media-cdn.cortextech.io/9a463aa2-ceb2-481c-9a95-1cddee0a248e.png',
  'fenerbahce': 'https://media-cdn.cortextech.io/1bc1eae7-6585-44c8-9d89-c585d424971c.png',
  'hapoel-tel-aviv': 'https://media-cdn.incrowdsports.com/cbb1c3ad-03d5-426a-b5ef-2832a4eee484.png',
  'zalgiris': 'https://media-cdn.incrowdsports.com/1f04fd8a-1fd4-43f9-b507-06c09a1a3a5d.png',
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': 'https://www.euroleaguebasketball.net/',
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
  console.log('🏀 Downloading Logos from EuroLeague CDN\n');
  console.log('='.repeat(70));
  
  let success = 0;
  let failed = 0;
  
  for (const [teamName, url] of Object.entries(euroleagueCdnLogos)) {
    const filename = `${teamName}.png`;
    const filepath = path.join(logosDir, filename);
    
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

