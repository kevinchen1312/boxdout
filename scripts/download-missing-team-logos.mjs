#!/usr/bin/env node
/**
 * Download logos for teams that still have placeholders
 * Teams identified from schedule files:
 * - Dreamland Gran Canaria
 * - Lenovo Tenerife
 * - Hapoel Unet Holon
 * - CSP Limoges
 * - JL Bourg-en-Bresse
 * - JDA Dijon Basket
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Teams that need logos - multiple sources for each
const missingTeams = {
  'dreamland-gran-canaria': [
    'https://www.acb.com/static/img/equipos/logo_33.png',
    'https://www.acb.com/static/img/equipos/logo_33_300.png',
    'https://upload.wikimedia.org/wikipedia/en/thumb/0/0c/CB_Gran_Canaria_logo.svg/200px-CB_Gran_Canaria_logo.svg.png',
    'https://www.eurocupbasketball.com/eurocup/teams/dreamland-gran-canaria/logo.png',
  ],
  'lenovo-tenerife': [
    'https://www.acb.com/static/img/equipos/logo_1039.png',
    'https://www.acb.com/static/img/equipos/logo_1039_300.png',
    'https://upload.wikimedia.org/wikipedia/en/thumb/5/5a/CB_Tenerife_logo.svg/200px-CB_Tenerife_logo.svg.png',
    'https://www.eurocupbasketball.com/eurocup/teams/lenovo-tenerife/logo.png',
  ],
  'hapoel-unet-holon': [
    'https://www.basketball-champions.com/teams/hapoel-unet-holon/logo.png',
    'https://www.eurocupbasketball.com/eurocup/teams/hapoel-unet-holon/logo.png',
    'https://upload.wikimedia.org/wikipedia/en/thumb/8/8f/Hapoel_Holon_BC_logo.svg/200px-Hapoel_Holon_BC_logo.svg.png',
  ],
  'csp-limoges': [
    'https://www.lnb.fr/static/img/equipos/logo_limoges.png',
    'https://www.lnb.fr/static/img/equipos/logo_limoges_300.png',
    'https://upload.wikimedia.org/wikipedia/en/thumb/9/9e/CSP_Limoges_logo.svg/200px-CSP_Limoges_logo.svg.png',
    'https://www.eurocupbasketball.com/eurocup/teams/csp-limoges/logo.png',
  ],
  'jl-bourg-en-bresse': [
    'https://www.lnb.fr/static/img/equipos/logo_bourg.png',
    'https://www.lnb.fr/static/img/equipos/logo_bourg_300.png',
    'https://upload.wikimedia.org/wikipedia/en/thumb/7/7a/JL_Bourg_logo.svg/200px-JL_Bourg_logo.svg.png',
    'https://www.eurocupbasketball.com/eurocup/teams/jl-bourg-en-bresse/logo.png',
  ],
  'jda-dijon-basket': [
    'https://www.lnb.fr/static/img/equipos/logo_dijon.png',
    'https://www.lnb.fr/static/img/equipos/logo_dijon_300.png',
    'https://upload.wikimedia.org/wikipedia/en/thumb/d/d1/JDA_Dijon_logo.svg/200px-JDA_Dijon_logo.svg.png',
    'https://www.eurocupbasketball.com/eurocup/teams/jda-dijon-basket/logo.png',
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
      rejectUnauthorized: false,
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
  const filepath = path.join(logosDir, `${teamName}.png`);
  const svgPath = path.join(logosDir, `${teamName}.svg`);
  
  // Check if we already have a real logo
  if (fs.existsSync(filepath)) {
    const stats = fs.statSync(filepath);
    if (stats.size > 5000) {
      return { success: true, skipped: true };
    }
  }
  if (fs.existsSync(svgPath)) {
    const stats = fs.statSync(svgPath);
    if (stats.size > 1000) {
      return { success: true, skipped: true };
    }
  }
  
  console.log(`\n📥 ${teamName.toUpperCase()}:`);
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const ext = url.includes('.svg') ? 'svg' : 'png';
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
  console.log('🏀 Downloading Missing Team Logos\n');
  console.log('='.repeat(70));
  
  let success = 0;
  let skipped = 0;
  let failed = 0;
  const failedTeams = [];
  
  for (const [teamName, urls] of Object.entries(missingTeams)) {
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
  console.log(`\n📊 Results:`);
  console.log(`   ✅ Downloaded: ${success}`);
  console.log(`   ⏭️  Skipped (already exist): ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log(`\n⚠️  Still missing: ${failedTeams.join(', ')}`);
    console.log(`\n💡 Will try browser automation for remaining teams...`);
  }
  
  console.log('\n');
}

main().catch(console.error);

