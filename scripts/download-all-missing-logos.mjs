#!/usr/bin/env node
/**
 * Download logos for all missing teams
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Teams that need logos - with multiple source URLs
const missingTeams = {
  'baxi-manresa': [
    'https://static.acb.com/img/www/clubes2024/2425BAXIManresaLogo.png',
    'https://www.acb.com/static/img/equipos/logo_10.png',
  ],
  'bcm-gravelines': [
    'https://www.lnb.fr/static/img/equipos/logo_gravelines.png',
    'https://assets.altrstat.xyz/images/Basketball/Team/1790/logoBlack/md.png',
  ],
  'bilbao-basket': [
    'https://static.acb.com/img/www/clubes2024/2425SurneBilbaoBasketLogo.png',
    'https://www.acb.com/static/img/equipos/logo_4.png',
  ],
  'boulazac-basket-dordogne': [
    'https://www.lnb.fr/static/img/equipos/logo_boulazac.png',
    'https://assets.altrstat.xyz/images/Basketball/Team/1791/logoBlack/md.png',
  ],
  'bursaspor': [
    'https://www.eurocupbasketball.com/eurocup/teams/bursaspor/logo.png',
    'https://media-cdn.incrowdsports.com/teams/bursaspor/logo.png',
  ],
  'cb-girona': [
    'https://static.acb.com/img/www/clubes2024/2425BasketGironaLogo.png',
    'https://www.acb.com/static/img/equipos/logo_591.png',
  ],
  'cb-granada': [
    'https://static.acb.com/img/www/clubes2024/2425CoviranGranadaLogo.png',
    'https://www.acb.com/static/img/equipos/logo_592.png',
  ],
  'casademont-zaragoza': [
    'https://static.acb.com/img/www/clubes2024/2425CasademontZaragozaLogo.png',
    'https://www.acb.com/static/img/equipos/logo_16.png',
  ],
  'chalon-sur-saone': [
    'https://www.lnb.fr/static/img/equipos/logo_chalon.png',
    'https://assets.altrstat.xyz/images/Basketball/Team/1786/logoBlack/md.png',
  ],
  'cholet-basket': [
    'https://www.lnb.fr/static/img/equipos/logo_cholet.png',
    'https://assets.altrstat.xyz/images/Basketball/Team/1787/logoBlack/md.png',
    'https://www.eurocupbasketball.com/eurocup/teams/cholet-basket/logo.png',
  ],
  'forca-lleida-ce': [
    'https://static.acb.com/img/www/clubes2024/2425HioposLleidaLogo.png',
    'https://www.acb.com/static/img/equipos/logo_658.png',
  ],
  'le-mans-sarthe-basket': [
    'https://www.lnb.fr/static/img/equipos/logo_mans.png',
    'https://assets.altrstat.xyz/images/Basketball/Team/1792/logoBlack/md.png',
  ],
  'le-portel': [
    'https://www.lnb.fr/static/img/equipos/logo_portel.png',
    'https://assets.altrstat.xyz/images/Basketball/Team/1793/logoBlack/md.png',
  ],
  'morabanc-andorra': [
    'https://static.acb.com/img/www/clubes2024/2425MoraBancAndorraLogo.png',
    'https://www.acb.com/static/img/equipos/logo_22.png',
  ],
  'nancy-basket': [
    'https://www.lnb.fr/static/img/equipos/logo_nancy.png',
    'https://assets.altrstat.xyz/images/Basketball/Team/1794/logoBlack/md.png',
  ],
  'nanterre-92': [
    'https://www.lnb.fr/static/img/equipos/logo_nanterre.png',
    'https://assets.altrstat.xyz/images/Basketball/Team/1795/logoBlack/md.png',
  ],
  'rio-breogan': [
    'https://static.acb.com/img/www/clubes2024/2425RioBreoganLogo.png',
    'https://www.acb.com/static/img/equipos/logo_25.png',
  ],
  'saint-quentin-basketball': [
    'https://www.lnb.fr/static/img/equipos/logo_saint_quentin.png',
    'https://assets.altrstat.xyz/images/Basketball/Team/1797/logoBlack/md.png',
  ],
  'siblo-san-pablo-burgos': [
    'https://static.acb.com/img/www/clubes2024/2425RecoletasSaludSanPabloBurgosLogo.png',
    'https://www.acb.com/static/img/equipos/logo_549.png',
  ],
  'strasbourg-ig': [
    'https://www.lnb.fr/static/img/equipos/logo_strasbourg.png',
    'https://assets.altrstat.xyz/images/Basketball/Team/1798/logoBlack/md.png',
  ],
  'ucam-murcia-cb': [
    'https://static.acb.com/img/www/clubes2024/2425UCAMMurciaCBLogo.png',
    'https://www.acb.com/static/img/equipos/logo_6.png',
  ],
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': 'https://www.google.com/',
      },
      timeout: 20000,
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
    
    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy();
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
  console.log('🏀 Downloading All Missing Team Logos\n');
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







