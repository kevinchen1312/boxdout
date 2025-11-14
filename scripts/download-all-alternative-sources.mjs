#!/usr/bin/env node
/**
 * Comprehensive script trying ALL alternative sources for remaining logos
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Comprehensive list of alternative URLs for each team
const allSources = {
  'mega-superbet': [
    // Wikimedia Commons - different language versions
    'https://upload.wikimedia.org/wikipedia/commons/5/57/KK_Mega_logo.svg',
    'https://upload.wikimedia.org/wikipedia/sr/5/57/KK_Mega_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/5/57/KK_Mega_logo.svg',
    // Team website
    'https://www.kk-mega.rs/wp-content/uploads/logo.svg',
    'https://www.kk-mega.rs/images/logo.png',
    // ABA League
    'https://www.aba-liga.com/teams/mega/logo.png',
  ],
  'cedevita-olimpija': [
    'https://upload.wikimedia.org/wikipedia/commons/9/9c/Cedevita_Olimpija_logo.svg',
    'https://upload.wikimedia.org/wikipedia/sl/9/9c/Cedevita_Olimpija_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/9/9c/Cedevita_Olimpija_logo.svg',
    'https://www.cedevitaolimpija.com/wp-content/uploads/logo.svg',
    'https://www.cedevitaolimpija.com/images/logo.png',
  ],
  'buducnost': [
    'https://upload.wikimedia.org/wikipedia/commons/2/29/KK_Budu%C4%87nost_VOLI_logo.svg',
    'https://upload.wikimedia.org/wikipedia/sr/2/29/KK_Budu%C4%87nost_VOLI_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/2/29/KK_Budu%C4%87nost_VOLI_logo.svg',
    'https://www.kkbuducnost.me/wp-content/uploads/logo.svg',
    'https://www.kkbuducnost.me/images/logo.png',
  ],
  'anadolu-efes': [
    'https://upload.wikimedia.org/wikipedia/commons/3/36/Anadolu_Efes_S.K._logo.svg',
    'https://upload.wikimedia.org/wikipedia/tr/3/36/Anadolu_Efes_S.K._logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/3/36/Anadolu_Efes_S.K._logo.svg',
    'https://www.anadoluefessk.org.tr/assets/img/logo.svg',
    'https://www.anadoluefessk.org.tr/images/logo.png',
    'https://www.anadoluefessk.org.tr/logo.svg',
  ],
  'panathinaikos': [
    'https://upload.wikimedia.org/wikipedia/commons/3/38/Panathinaikos_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/el/3/38/Panathinaikos_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/3/38/Panathinaikos_BC_logo.svg',
    'https://www.paobc.gr/wp-content/uploads/logo.svg',
    'https://www.paobc.gr/images/logo.png',
    'https://www.paobc.gr/assets/img/logo.svg',
  ],
  'olympiacos': [
    'https://upload.wikimedia.org/wikipedia/commons/e/e4/Olympiacos_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/el/e/e4/Olympiacos_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/e/e4/Olympiacos_BC_logo.svg',
    'https://www.olympiacosbc.gr/wp-content/uploads/logo.svg',
    'https://www.olympiacosbc.gr/images/logo.png',
    'https://www.olympiacosbc.gr/assets/img/logo.svg',
  ],
  'armani-milan': [
    'https://upload.wikimedia.org/wikipedia/commons/f/f0/Olimpia_Milano_logo.svg',
    'https://upload.wikimedia.org/wikipedia/it/f/f0/Olimpia_Milano_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/f/f0/Olimpia_Milano_logo.svg',
    'https://www.olimpiamilano.com/wp-content/uploads/logo.svg',
    'https://www.olimpiamilano.com/images/logo.png',
    'https://www.olimpiamilano.com/assets/img/logo.svg',
  ],
  'zalgiris': [
    'https://upload.wikimedia.org/wikipedia/commons/c/c7/BC_%C5%BDalgiris_logo.svg',
    'https://upload.wikimedia.org/wikipedia/lt/c/c7/BC_%C5%BDalgiris_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/c/c7/BC_%C5%BDalgiris_logo.svg',
    'https://www.zalgiris.lt/wp-content/uploads/logo.svg',
    'https://www.zalgiris.lt/images/logo.png',
    'https://www.zalgiris.lt/assets/img/logo.svg',
  ],
  'maccabi-tel-aviv': [
    'https://upload.wikimedia.org/wikipedia/commons/7/7c/Maccabi_Tel_Aviv_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/he/7/7c/Maccabi_Tel_Aviv_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/7/7c/Maccabi_Tel_Aviv_BC_logo.svg',
    'https://www.maccabi.co.il/wp-content/uploads/logo.svg',
    'https://www.maccabi.co.il/images/logo.png',
    'https://www.maccabi.co.il/assets/img/logo.svg',
  ],
  'hapoel-tel-aviv': [
    'https://upload.wikimedia.org/wikipedia/commons/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg',
    'https://upload.wikimedia.org/wikipedia/he/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg',
    'https://hapoeluta.org/wp-content/uploads/logo.svg',
    'https://hapoeluta.org/images/logo.png',
    'https://hapoeluta.org/assets/img/logo.svg',
  ],
  'monaco': [
    'https://upload.wikimedia.org/wikipedia/commons/7/7a/AS_Monaco_Basket_logo.svg',
    'https://upload.wikimedia.org/wikipedia/fr/7/7a/AS_Monaco_Basket_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/7/7a/AS_Monaco_Basket_logo.svg',
    'https://asmonaco.basketball/wp-content/uploads/logo.svg',
    'https://asmonaco.basketball/images/logo.png',
    'https://asmonaco.basketball/assets/img/logo.svg',
  ],
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
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
    
    const req = protocol.get(url, options, (response) => {
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
      if (!contentType.includes('image') && !contentType.includes('svg') && !contentType.includes('octet-stream')) {
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
    
    req.setTimeout(20000, () => {
      req.destroy();
      file.close();
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      reject(new Error('Timeout'));
    });
  });
}

async function tryDownloadTeam(teamName, urls) {
  const filepath = path.join(logosDir, `${teamName}.svg`);
  
  // Delete placeholder if exists
  if (fs.existsSync(filepath)) {
    const stats = fs.statSync(filepath);
    if (stats.size < 10000) {
      fs.unlinkSync(filepath);
    } else {
      return { success: true, skipped: true };
    }
  }
  
  // Also try PNG
  const pngPath = path.join(logosDir, `${teamName}.png`);
  if (fs.existsSync(pngPath)) {
    const stats = fs.statSync(pngPath);
    if (stats.size > 5000) {
      return { success: true, skipped: true };
    }
  }
  
  console.log(`\n📥 ${teamName.toUpperCase()}:`);
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const ext = url.includes('.png') ? 'png' : 'svg';
    const finalPath = path.join(logosDir, `${teamName}.${ext}`);
    
    try {
      process.stdout.write(`  [${i + 1}/${urls.length}] Trying ${url.substring(0, 60)}... `);
      const size = await downloadFile(url, finalPath);
      console.log(`✓ Success! (${size} bytes)`);
      return { success: true, size };
    } catch (error) {
      console.log(`✗ ${error.message}`);
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
    }
    
    await new Promise(r => setTimeout(r, 200));
  }
  
  return { success: false };
}

async function main() {
  console.log('🏀 Trying ALL Alternative Sources for Remaining Logos\n');
  console.log('='.repeat(70));
  
  let success = 0;
  let skipped = 0;
  let failed = 0;
  const failedTeams = [];
  
  for (const [teamName, urls] of Object.entries(allSources)) {
    const result = await tryDownloadTeam(teamName, urls);
    
    if (result.success) {
      if (result.skipped) {
        skipped++;
      } else {
        success++;
      }
    } else {
      failed++;
      failedTeams.push(teamName);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Final Results:`);
  console.log(`   ✅ Downloaded: ${success}`);
  console.log(`   ⏭️  Skipped (already exist): ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log(`\n⚠️  Still missing: ${failedTeams.join(', ')}`);
    console.log(`\n💡 For these teams, we may need to:`);
    console.log(`   - Check official team websites manually`);
    console.log(`   - Use browser dev tools to find logo URLs`);
    console.log(`   - Download from team social media profiles`);
  }
  
  console.log('\n');
}

main().catch(console.error);

