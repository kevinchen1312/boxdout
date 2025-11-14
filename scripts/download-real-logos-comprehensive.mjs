#!/usr/bin/env node
/**
 * Comprehensive script to download REAL team logos from multiple sources
 * Tries multiple URLs per team to find working sources
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Ensure logos directory exists
if (!fs.existsSync(logosDir)) {
  fs.mkdirSync(logosDir, { recursive: true });
}

// Multiple URL sources for each team - we'll try them in order
const teamLogoUrls = {
  // Serbian ABA League
  'partizan': [
    'https://upload.wikimedia.org/wikipedia/en/8/86/KK_Partizan_logo.svg',
    'https://whatthelogo.com/storage/logos/229999/partizan-basketball-club.png',
    'https://www.kkpartizan.rs/wp-content/uploads/2020/01/logo-partizan.png',
    'https://www.euroleaguebasketball.net/euroleague/teams/partizan-belgrade/',
  ],
  'crvena-zvezda': [
    'https://upload.wikimedia.org/wikipedia/en/3/39/KK_Crvena_zvezda_logo.svg',
    'https://upload.wikimedia.org/wikipedia/en/thumb/2/2d/KK_Crvena_zvezda_logo.svg/512px-KK_Crvena_zvezda_logo.svg.png',
    'https://www.kkcrvenazvezda.rs/wp-content/uploads/2020/01/logo-crvena-zvezda.png',
  ],
  'mega-superbet': [
    'https://upload.wikimedia.org/wikipedia/en/5/57/KK_Mega_logo.svg',
    'https://www.kk-mega.rs/wp-content/uploads/2020/01/logo-mega.png',
  ],
  'cedevita-olimpija': [
    'https://upload.wikimedia.org/wikipedia/en/9/9c/Cedevita_Olimpija_logo.svg',
    'https://www.cedevitaolimpija.com/wp-content/uploads/2020/01/logo-cedevita-olimpija.png',
  ],
  'buducnost': [
    'https://upload.wikimedia.org/wikipedia/en/2/29/KK_Budu%C4%87nost_VOLI_logo.svg',
    'https://www.kkbuducnost.me/wp-content/uploads/2020/01/logo-buducnost.png',
  ],
  
  // EuroLeague - Turkish Teams
  'fenerbahce': [
    'https://upload.wikimedia.org/wikipedia/en/8/8c/Fenerbah%C3%A7e_SK_Logo.svg',
    'https://www.fenerbahce.org/assets/img/logo.png',
    'https://www.euroleaguebasketball.net/euroleague/teams/fenerbahce-beko-istanbul/',
  ],
  'anadolu-efes': [
    'https://upload.wikimedia.org/wikipedia/en/3/36/Anadolu_Efes_S.K._logo.svg',
    'https://www.anadoluefessk.org.tr/assets/img/logo.png',
  ],
  
  // EuroLeague - Greek Teams
  'panathinaikos': [
    'https://upload.wikimedia.org/wikipedia/commons/3/38/Panathinaikos_BC_logo.svg',
    'https://www.paobc.gr/wp-content/uploads/2020/01/logo-panathinaikos.png',
    'https://www.euroleaguebasketball.net/euroleague/teams/panathinaikos-aktor-athens/',
  ],
  'olympiacos': [
    'https://upload.wikimedia.org/wikipedia/en/e/e4/Olympiacos_BC_logo.svg',
    'https://www.olympiacosbc.gr/wp-content/uploads/2020/01/logo-olympiacos.png',
  ],
  
  // EuroLeague - Italian Teams
  'armani-milan': [
    'https://upload.wikimedia.org/wikipedia/en/f/f0/Olimpia_Milano_logo.svg',
    'https://www.olimpiamilano.com/wp-content/uploads/2020/01/logo-olimpia-milano.png',
    'https://www.euroleaguebasketball.net/euroleague/teams/ax-armani-exchange-milan/',
  ],
  
  // EuroLeague - Lithuanian Teams
  'zalgiris': [
    'https://upload.wikimedia.org/wikipedia/commons/c/c7/BC_%C5%BDalgiris_logo.svg',
    'https://www.zalgiris.lt/wp-content/uploads/2020/01/logo-zalgiris.png',
  ],
  
  // EuroLeague - Israeli Teams
  'maccabi-tel-aviv': [
    'https://upload.wikimedia.org/wikipedia/en/7/7c/Maccabi_Tel_Aviv_BC_logo.svg',
    'https://www.maccabi.co.il/wp-content/uploads/2020/01/logo-maccabi.png',
  ],
  'hapoel-tel-aviv': [
    'https://upload.wikimedia.org/wikipedia/en/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg',
    'https://www.hapoel.co.il/wp-content/uploads/2020/01/logo-hapoel.png',
  ],
  
  // EuroLeague - French Teams
  'monaco': [
    'https://upload.wikimedia.org/wikipedia/en/7/7a/AS_Monaco_Basket_logo.svg',
    'https://www.asmonaco.basketball/wp-content/uploads/2020/01/logo-monaco.png',
  ],
  
  // Other teams
  'bosna-bh-telecom': [
    'https://www.kkbosna.ba/wp-content/uploads/2020/01/logo-bosna.png',
  ],
  'bc-vienna': [
    'https://www.bcvienna.at/wp-content/uploads/2020/01/logo-vienna.png',
  ],
  'ilirija': [
    'https://www.kkilirija.si/wp-content/uploads/2020/01/logo-ilirija.png',
  ],
  'zadar': [
    'https://www.kkzadar.hr/wp-content/uploads/2020/01/logo-zadar.png',
  ],
  'spartak': [
    'https://www.kk-spartak.rs/wp-content/uploads/2020/01/logo-spartak.png',
  ],
  'dubai': [
    'https://www.dubaibasketball.com/wp-content/uploads/2020/01/logo-dubai.png',
  ],
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
      },
      timeout: 10000,
    };
    
    const req = protocol.get(url, options, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        file.close();
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        return downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
      }
      
      // Check content type
      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('image') && !contentType.includes('svg') && response.statusCode === 200) {
        // Might be HTML page, skip
        file.close();
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        reject(new Error(`Not an image: ${contentType}`));
        return;
      }
      
      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        // Verify file was written and has content
        const stats = fs.statSync(filepath);
        if (stats.size < 100) {
          fs.unlinkSync(filepath);
          reject(new Error('File too small, likely not an image'));
          return;
        }
        resolve();
      });
    });
    
    req.on('error', (err) => {
      file.close();
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      reject(err);
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      file.close();
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      reject(new Error('Request timeout'));
    });
  });
}

async function downloadTeamLogo(teamName, urls) {
  const ext = teamName.includes('partizan') || teamName.includes('crvena-zvezda') || 
              teamName.includes('mega') || teamName.includes('cedevita') || 
              teamName.includes('buducnost') || teamName.includes('fenerbahce') ||
              teamName.includes('anadolu-efes') || teamName.includes('panathinaikos') ||
              teamName.includes('olympiacos') || teamName.includes('armani-milan') ||
              teamName.includes('zalgiris') || teamName.includes('maccabi-tel-aviv') ||
              teamName.includes('hapoel-tel-aviv') || teamName.includes('monaco') ? 'svg' : 'png';
  
  const filename = `${teamName}.${ext}`;
  const filepath = path.join(logosDir, filename);
  
  // Skip if real logo already exists (not placeholder)
  if (fs.existsSync(filepath)) {
    const stats = fs.statSync(filepath);
    // If file is reasonably large, assume it's a real logo
    if (stats.size > 5000) {
      return { success: true, skipped: true, filename };
    }
  }
  
  // Try each URL in order
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      console.log(`  Trying source ${i + 1}/${urls.length}: ${url.substring(0, 60)}...`);
      await downloadFile(url, filepath);
      
      // Verify it's a valid image file
      const stats = fs.statSync(filepath);
      if (stats.size > 100) {
        console.log(`  ✓ Successfully downloaded ${filename} (${stats.size} bytes)`);
        return { success: true, filename, source: i + 1 };
      } else {
        fs.unlinkSync(filepath);
      }
    } catch (error) {
      // Continue to next URL
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      continue;
    }
  }
  
  return { success: false, filename };
}

async function main() {
  console.log('🏀 Downloading REAL Team Logos from Multiple Sources...\n');
  console.log('='.repeat(70));
  console.log('\n');
  
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const failedTeams = [];
  
  for (const [teamName, urls] of Object.entries(teamLogoUrls)) {
    console.log(`\n📥 ${teamName.toUpperCase()}:`);
    
    const result = await downloadTeamLogo(teamName, urls);
    
    if (result.success) {
      if (result.skipped) {
        console.log(`  ⏭️  Skipped (already exists)`);
        skipped++;
      } else {
        downloaded++;
      }
    } else {
      console.log(`  ❌ Failed to download from all sources`);
      failed++;
      failedTeams.push(teamName);
    }
    
    // Small delay between teams
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 Summary:');
  console.log(`   ✅ Downloaded: ${downloaded}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  if (downloaded > 0) {
    console.log('\n🎉 Real logos downloaded successfully!');
  }
  
  if (failed > 0) {
    console.log(`\n⚠️  Failed teams: ${failedTeams.join(', ')}`);
    console.log(`   These may need manual download from official team websites.`);
  }
  
  console.log('\n');
}

main().catch(console.error);

