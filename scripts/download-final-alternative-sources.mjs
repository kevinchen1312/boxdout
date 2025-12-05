#!/usr/bin/env node
/**
 * Final comprehensive script trying ALL possible alternative sources
 * Including sports databases, CDNs, image hosting, and social media
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Comprehensive list of ALL possible sources for each team
const allPossibleSources = {
  'mega-superbet': [
    // Wikimedia Commons variations
    'https://upload.wikimedia.org/wikipedia/commons/5/57/KK_Mega_logo.svg',
    'https://upload.wikimedia.org/wikipedia/sr/5/57/KK_Mega_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/5/57/KK_Mega_logo.svg',
    // Sports databases
    'https://www.sportslogos.net/logos/view/KK_Mega_Basketball/2023/Primary_Logo',
    'https://cdn.sportlogos.net/logos/32/134104/full/mega.png',
    // Team website variations
    'https://kk-mega.rs/wp-content/uploads/logo.png',
    'https://kk-mega.rs/images/logo.png',
    'https://kk-mega.rs/assets/img/logo.png',
    // ABA League
    'https://www.aba-liga.com/wp-content/uploads/teams/mega/logo.png',
  ],
  'cedevita-olimpija': [
    'https://upload.wikimedia.org/wikipedia/commons/9/9c/Cedevita_Olimpija_logo.svg',
    'https://upload.wikimedia.org/wikipedia/sl/9/9c/Cedevita_Olimpija_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/9/9c/Cedevita_Olimpija_logo.svg',
    'https://cdn.sportlogos.net/logos/32/136067/full/cedevita_olimpija.png',
    'https://www.cedevitaolimpija.com/wp-content/uploads/logo.png',
    'https://www.cedevitaolimpija.com/images/logo.png',
  ],
  'buducnost': [
    'https://upload.wikimedia.org/wikipedia/commons/2/29/KK_Budu%C4%87nost_VOLI_logo.svg',
    'https://upload.wikimedia.org/wikipedia/sr/2/29/KK_Budu%C4%87nost_VOLI_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/2/29/KK_Budu%C4%87nost_VOLI_logo.svg',
    'https://cdn.sportlogos.net/logos/32/134105/full/buducnost.png',
    'https://kkbuducnost.me/wp-content/uploads/logo.png',
    'https://kkbuducnost.me/images/logo.png',
  ],
  'anadolu-efes': [
    'https://upload.wikimedia.org/wikipedia/commons/3/36/Anadolu_Efes_S.K._logo.svg',
    'https://upload.wikimedia.org/wikipedia/tr/3/36/Anadolu_Efes_S.K._logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/3/36/Anadolu_Efes_S.K._logo.svg',
    'https://cdn.sportlogos.net/logos/32/133603/full/anadolu_efes.png',
    'https://www.anadoluefessk.org.tr/wp-content/uploads/logo.png',
    'https://www.anadoluefessk.org.tr/images/logo.png',
    'https://www.anadoluefessk.org.tr/assets/img/logo.png',
    // Try EuroLeague CDN
    'https://www.euroleaguebasketball.net/euroleague/teams/anadolu-efes-istanbul/logo.png',
  ],
  'zalgiris': [
    'https://upload.wikimedia.org/wikipedia/commons/c/c7/BC_%C5%BDalgiris_logo.svg',
    'https://upload.wikimedia.org/wikipedia/lt/c/c7/BC_%C5%BDalgiris_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/c/c7/BC_%C5%BDalgiris_logo.svg',
    'https://cdn.sportlogos.net/logos/32/136063/full/zalgiris.png',
    'https://www.zalgiris.lt/wp-content/uploads/logo.png',
    'https://www.zalgiris.lt/images/logo.png',
    'https://www.zalgiris.lt/assets/img/logo.png',
    // Try EuroLeague CDN
    'https://www.euroleaguebasketball.net/euroleague/teams/zalgiris-kaunas/logo.png',
  ],
  'maccabi-tel-aviv': [
    'https://upload.wikimedia.org/wikipedia/commons/7/7c/Maccabi_Tel_Aviv_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/he/7/7c/Maccabi_Tel_Aviv_BC_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/7/7c/Maccabi_Tel_Aviv_BC_logo.svg',
    'https://cdn.sportlogos.net/logos/32/133601/full/maccabi_tel_aviv.png',
    'https://www.maccabi.co.il/wp-content/uploads/logo.png',
    'https://www.maccabi.co.il/images/logo.png',
    'https://www.maccabi.co.il/assets/img/logo.png',
    // Try EuroLeague CDN
    'https://www.euroleaguebasketball.net/euroleague/teams/maccabi-playtika-tel-aviv/logo.png',
  ],
  'hapoel-tel-aviv': [
    'https://upload.wikimedia.org/wikipedia/commons/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg',
    'https://upload.wikimedia.org/wikipedia/he/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg',
    'https://cdn.sportlogos.net/logos/32/133899/full/hapoel_tel_aviv.png',
    'https://hapoeluta.org/wp-content/uploads/logo.png',
    'https://hapoeluta.org/images/logo.png',
    'https://hapoeluta.org/assets/img/logo.png',
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
      timeout: 25000,
      rejectUnauthorized: false, // Allow self-signed certs
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
    
    req.setTimeout(25000, () => {
      req.destroy();
      file.close();
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      reject(new Error('Timeout'));
    });
  });
}

async function tryDownloadTeam(teamName, urls) {
  const filepath = path.join(logosDir, `${teamName}.svg`);
  const pngPath = path.join(logosDir, `${teamName}.png`);
  
  // Check if we already have a real logo
  if (fs.existsSync(filepath)) {
    const stats = fs.statSync(filepath);
    if (stats.size > 10000) {
      return { success: true, skipped: true };
    }
  }
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
      process.stdout.write(`  [${i + 1}/${urls.length}] Trying... `);
      const size = await downloadFile(url, finalPath);
      console.log(`✓ Success! (${size} bytes)`);
      return { success: true, size };
    } catch (error) {
      process.stdout.write(`✗ ${error.message.substring(0, 40)}\n`);
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
    }
    
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log(`  ❌ All sources failed`);
  return { success: false };
}

async function main() {
  console.log('🏀 Final Comprehensive Logo Download - ALL Alternative Sources\n');
  console.log('='.repeat(70));
  
  let success = 0;
  let skipped = 0;
  let failed = 0;
  const failedTeams = [];
  
  for (const [teamName, urls] of Object.entries(allPossibleSources)) {
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
    console.log(`\n💡 These teams may require:`);
    console.log(`   - Manual download from official team websites`);
    console.log(`   - Browser inspection to find CDN URLs`);
    console.log(`   - Contacting teams directly for logo assets`);
  }
  
  console.log('\n');
}

main().catch(console.error);






