#!/usr/bin/env node
/**
 * Aggressive logo download script - tries many different URL patterns
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Multiple URL patterns to try for each team
const teamUrls = {
  'partizan': [
    // Wikimedia Commons - different paths
    'https://upload.wikimedia.org/wikipedia/en/8/86/KK_Partizan_logo.svg',
    'https://upload.wikimedia.org/wikipedia/commons/8/86/KK_Partizan_logo.svg',
    'https://upload.wikimedia.org/wikipedia/sr/8/86/KK_Partizan_logo.svg',
    // Direct image hosts
    'https://logos-world.net/wp-content/uploads/2020/11/Partizan-Belgrade-Logo.png',
    'https://cdn.sportlogos.net/logos/32/134103/full/partizan.png',
    'https://www.sportslogos.net/logos/view/134103/Partizan_Belgrade/2023/Primary_Logo',
  ],
  'crvena-zvezda': [
    'https://upload.wikimedia.org/wikipedia/en/3/39/KK_Crvena_zvezda_logo.svg',
    'https://upload.wikimedia.org/wikipedia/commons/3/39/KK_Crvena_zvezda_logo.svg',
    'https://upload.wikimedia.org/wikipedia/sr/3/39/KK_Crvena_zvezda_logo.svg',
    'https://logos-world.net/wp-content/uploads/2020/11/Crvena-Zvezda-Logo.png',
    'https://cdn.sportlogos.net/logos/32/134102/full/crvena_zvezda.png',
  ],
  'mega-superbet': [
    'https://upload.wikimedia.org/wikipedia/en/5/57/KK_Mega_logo.svg',
    'https://upload.wikimedia.org/wikipedia/commons/5/57/KK_Mega_logo.svg',
    'https://upload.wikimedia.org/wikipedia/sr/5/57/KK_Mega_logo.svg',
  ],
  'cedevita-olimpija': [
    'https://upload.wikimedia.org/wikipedia/en/9/9c/Cedevita_Olimpija_logo.svg',
    'https://upload.wikimedia.org/wikipedia/commons/9/9c/Cedevita_Olimpija_logo.svg',
    'https://upload.wikimedia.org/wikipedia/sl/9/9c/Cedevita_Olimpija_logo.svg',
  ],
  'buducnost': [
    'https://upload.wikimedia.org/wikipedia/en/2/29/KK_Budu%C4%87nost_VOLI_logo.svg',
    'https://upload.wikimedia.org/wikipedia/commons/2/29/KK_Budu%C4%87nost_VOLI_logo.svg',
    'https://upload.wikimedia.org/wikipedia/sr/2/29/KK_Budu%C4%87nost_VOLI_logo.svg',
  ],
  'anadolu-efes': [
    'https://upload.wikimedia.org/wikipedia/en/3/36/Anadolu_Efes_S.K._logo.svg',
    'https://upload.wikimedia.org/wikipedia/commons/3/36/Anadolu_Efes_S.K._logo.svg',
    'https://upload.wikimedia.org/wikipedia/tr/3/36/Anadolu_Efes_S.K._logo.svg',
  ],
  'panathinaikos': [
    'https://upload.wikimedia.org/wikipedia/commons/3/38/Panathinaikos_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/3/38/Panathinaikos_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/el/3/38/Panathinaikos_BC_logo.svg',
  ],
  'olympiacos': [
    'https://upload.wikimedia.org/wikipedia/en/e/e4/Olympiacos_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/commons/e/e4/Olympiacos_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/el/e/e4/Olympiacos_BC_logo.svg',
  ],
  'armani-milan': [
    'https://upload.wikimedia.org/wikipedia/en/f/f0/Olimpia_Milano_logo.svg',
    'https://upload.wikimedia.org/wikipedia/commons/f/f0/Olimpia_Milano_logo.svg',
    'https://upload.wikimedia.org/wikipedia/it/f/f0/Olimpia_Milano_logo.svg',
  ],
  'zalgiris': [
    'https://upload.wikimedia.org/wikipedia/commons/c/c7/BC_%C5%BDalgiris_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/c/c7/BC_%C5%BDalgiris_logo.svg',
    'https://upload.wikimedia.org/wikipedia/lt/c/c7/BC_%C5%BDalgiris_logo.svg',
  ],
  'maccabi-tel-aviv': [
    'https://upload.wikimedia.org/wikipedia/en/7/7c/Maccabi_Tel_Aviv_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/commons/7/7c/Maccabi_Tel_Aviv_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/he/7/7c/Maccabi_Tel_Aviv_BC_logo.svg',
  ],
  'hapoel-tel-aviv': [
    'https://upload.wikimedia.org/wikipedia/en/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg',
    'https://upload.wikimedia.org/wikipedia/commons/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg',
    'https://upload.wikimedia.org/wikipedia/he/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg',
  ],
  'monaco': [
    'https://upload.wikimedia.org/wikipedia/en/7/7a/AS_Monaco_Basket_logo.svg',
    'https://upload.wikimedia.org/wikipedia/commons/7/7a/AS_Monaco_Basket_logo.svg',
    'https://upload.wikimedia.org/wikipedia/fr/7/7a/AS_Monaco_Basket_logo.svg',
  ],
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
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
      
      const contentType = response.headers['content-type'] || '';
      if (response.statusCode === 200 && !contentType.includes('image') && !contentType.includes('svg') && !contentType.includes('octet-stream')) {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        reject(new Error(`Not an image: ${contentType}`));
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

async function tryDownloadTeam(teamName, urls) {
  const filename = `${teamName}.svg`;
  const filepath = path.join(logosDir, filename);
  
  // Delete placeholder if exists
  if (fs.existsSync(filepath)) {
    const stats = fs.statSync(filepath);
    // If it's a small placeholder, delete it
    if (stats.size < 10000) {
      fs.unlinkSync(filepath);
    } else {
      console.log(`  ⏭️  ${teamName}: Already has logo (${stats.size} bytes)`);
      return true;
    }
  }
  
  console.log(`\n📥 ${teamName.toUpperCase()}:`);
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      process.stdout.write(`  [${i + 1}/${urls.length}] Trying... `);
      const size = await downloadFile(url, filepath);
      console.log(`✓ Success! (${size} bytes)`);
      return true;
    } catch (error) {
      process.stdout.write(`✗ ${error.message}\n`);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    }
  }
  
  console.log(`  ❌ All sources failed`);
  return false;
}

async function main() {
  console.log('🏀 Aggressive Logo Download - Trying Multiple Sources\n');
  console.log('='.repeat(70));
  
  let success = 0;
  let failed = 0;
  const failedTeams = [];
  
  for (const [teamName, urls] of Object.entries(teamUrls)) {
    const result = await tryDownloadTeam(teamName, urls);
    if (result) {
      success++;
    } else {
      failed++;
      failedTeams.push(teamName);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ✅ ${success} | ❌ ${failed}`);
  
  if (failed > 0) {
    console.log(`\n⚠️  Failed: ${failedTeams.join(', ')}`);
    console.log(`\n💡 For remaining teams, we may need to:`);
    console.log(`   1. Check official team websites`);
    console.log(`   2. Use browser dev tools to find logo URLs`);
    console.log(`   3. Download manually from team sites`);
  }
  
  console.log('\n');
}

main().catch(console.error);

