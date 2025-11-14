#!/usr/bin/env node
/**
 * Download logos from verified team website URLs found via browser inspection
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Verified URLs from team websites (found via browser inspection)
const verifiedTeamLogos = {
  'panathinaikos': 'https://media-cdn.incrowdsports.com/e3dff28a-9ec6-4faf-9d96-ecbc68f75780.png',
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/svg+xml,image/png,image/jpeg,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
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
    
    req.on('error', (err) => {
      file.close();
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      reject(err);
    });
    
    req.setTimeout(20000, () => {
      req.destroy();
      file.close();
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      reject(new Error('Timeout'));
    });
  });
}

async function main() {
  console.log('🏀 Downloading Logos from Verified Team Website URLs\n');
  console.log('='.repeat(70));
  
  let success = 0;
  let skipped = 0;
  let failed = 0;
  const failedTeams = [];
  
  for (const [teamName, url] of Object.entries(verifiedTeamLogos)) {
    const ext = url.includes('.png') ? 'png' : url.includes('.svg') ? 'svg' : 'png';
    const filename = `${teamName}.${ext}`;
    const filepath = path.join(logosDir, filename);
    
    // Delete placeholder if exists
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      if (stats.size > 5000) {
        console.log(`⏭️  ${teamName}: Already exists (${stats.size} bytes)`);
        skipped++;
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
      failedTeams.push(teamName);
    }
    
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ✅ ${success} | ⏭️  ${skipped} | ❌ ${failed}`);
  
  if (failed > 0) {
    console.log(`\n⚠️  Failed: ${failedTeams.join(', ')}`);
  }
  
  console.log('\n');
}

main().catch(console.error);

