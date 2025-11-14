#!/usr/bin/env node
/**
 * Final logo download script with verified Wikipedia URLs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Verified Wikipedia Commons URLs
const verifiedUrls = {
  'partizan': 'https://upload.wikimedia.org/wikipedia/en/8/80/KK_Partizan_logo.svg',
  'crvena-zvezda': 'https://upload.wikimedia.org/wikipedia/en/3/39/KK_Crvena_zvezda_logo.svg',
  'mega-superbet': 'https://upload.wikimedia.org/wikipedia/en/5/57/KK_Mega_logo.svg',
  'cedevita-olimpija': 'https://upload.wikimedia.org/wikipedia/en/9/9c/Cedevita_Olimpija_logo.svg',
  'buducnost': 'https://upload.wikimedia.org/wikipedia/en/2/29/KK_Budu%C4%87nost_VOLI_logo.svg',
  'anadolu-efes': 'https://upload.wikimedia.org/wikipedia/en/3/36/Anadolu_Efes_S.K._logo.svg',
  'panathinaikos': 'https://upload.wikimedia.org/wikipedia/commons/3/38/Panathinaikos_BC_logo.svg',
  'olympiacos': 'https://upload.wikimedia.org/wikipedia/en/e/e4/Olympiacos_BC_logo.svg',
  'armani-milan': 'https://upload.wikimedia.org/wikipedia/en/f/f0/Olimpia_Milano_logo.svg',
  'zalgiris': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/BC_%C5%BDalgiris_logo.svg',
  'maccabi-tel-aviv': 'https://upload.wikimedia.org/wikipedia/en/7/7c/Maccabi_Tel_Aviv_BC_logo.svg',
  'hapoel-tel-aviv': 'https://upload.wikimedia.org/wikipedia/en/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg',
  'monaco': 'https://upload.wikimedia.org/wikipedia/en/7/7a/AS_Monaco_Basket_logo.svg',
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://en.wikipedia.org/',
      },
      timeout: 15000,
    };
    
    const req = https.get(url, options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
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
    
    req.on('error', (err) => {
      file.close();
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      reject(err);
    });
    
    req.setTimeout(15000, () => {
      req.destroy();
      file.close();
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      reject(new Error('Timeout'));
    });
  });
}

async function main() {
  console.log('🏀 Downloading Real Logos from Verified Wikipedia URLs\n');
  console.log('='.repeat(70));
  
  let success = 0;
  let failed = 0;
  const failedTeams = [];
  
  for (const [teamName, url] of Object.entries(verifiedUrls)) {
    const filename = `${teamName}.svg`;
    const filepath = path.join(logosDir, filename);
    
    // Delete placeholder if exists
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      if (stats.size < 10000) {
        fs.unlinkSync(filepath);
      } else {
        console.log(`⏭️  ${teamName}: Already exists (${stats.size} bytes)`);
        success++;
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
      failedTeams.push(teamName);
    }
    
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ✅ ${success} | ❌ ${failed}`);
  
  if (failed > 0) {
    console.log(`\n⚠️  Failed: ${failedTeams.join(', ')}`);
  }
  
  console.log('\n');
}

main().catch(console.error);

