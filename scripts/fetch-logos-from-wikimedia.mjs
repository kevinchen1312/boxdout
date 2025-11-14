#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import https from 'https';

const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');

// Wikimedia Commons file names for each team
const WIKIMEDIA_FILES = {
  'fenerbahce': 'Fenerbahçe_SK_Logo.svg',
  'panathinaikos': 'Panathinaikos_BC_logo.svg',
  'olympiacos': 'Olympiacos_BC_logo.svg',
  'crvena-zvezda': 'KK_Crvena_zvezda_logo.svg',
  'partizan': 'KK_Partizan_logo.svg',
  'zalgiris': 'BC_Žalgiris_logo.svg',
  'maccabi-tel-aviv': 'Maccabi_Tel_Aviv_BC_logo.svg',
  'anadolu-efes': 'Anadolu_Efes_S.K._logo.svg',
  'baskonia': 'Saski_Baskonia_logo.svg',
  'armani-milan': 'Olimpia_Milano_logo.svg',
  'virtus-bologna': 'Virtus_Bologna_logo.svg',
  'monaco': 'AS_Monaco_Basket_logo.svg',
  'mega-superbet': 'KK_Mega_logo.svg',
  'hapoel-tel-aviv': 'Hapoel_Tel_Aviv_B.C._logo.svg',
  'unicaja': 'Unicaja_logo.svg',
  'cedevita-olimpija': 'Cedevita_Olimpija_logo.svg',
  'buducnost': 'KK_Budućnost_VOLI_logo.svg',
};

async function getWikimediaImageUrl(filename) {
  return new Promise((resolve, reject) => {
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&format=json`;
    
    https.get(apiUrl, {
      headers: {
        'User-Agent': 'ProspectCal/1.0 (Basketball Schedule App; contact@example.com)',
        'Accept': 'application/json'
      }
    }, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          const pages = json.query.pages;
          const page = Object.values(pages)[0];
          
          if (page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url) {
            resolve(page.imageinfo[0].url);
          } else {
            reject(new Error('Image URL not found in API response'));
          }
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        resolve(downloadFile(response.headers.location, filepath));
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      const file = fs.createWriteStream(filepath);
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve(true);
      });
      
      file.on('error', (err) => {
        fs.unlink(filepath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function downloadAllLogos() {
  console.log('🏀 Downloading Real Team Logos from Wikimedia Commons...\n');
  console.log('=' .repeat(70));
  console.log('\n');

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const failedTeams = [];

  for (const [teamKey, wikiFilename] of Object.entries(WIKIMEDIA_FILES)) {
    const ext = wikiFilename.endsWith('.svg') ? 'svg' : 'png';
    const filename = `${teamKey}.${ext}`;
    const outputPath = path.join(LOGOS_DIR, filename);
    
    if (fs.existsSync(outputPath)) {
      console.log(`⏭️  Skipped ${filename.padEnd(35)} (already exists)`);
      skipped++;
      continue;
    }
    
    process.stdout.write(`⬇️  ${filename.padEnd(35)} ... `);
    
    try {
      const imageUrl = await getWikimediaImageUrl(wikiFilename);
      await downloadFile(imageUrl, outputPath);
      console.log('✅');
      downloaded++;
    } catch (error) {
      console.log(`❌ ${error.message}`);
      failed++;
      failedTeams.push(teamKey);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '=' .repeat(70));
  console.log('\n📊 Summary:');
  console.log(`   ✅ Downloaded: ${downloaded}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  if (downloaded > 0) {
    console.log('\n🎉 Real logos downloaded successfully!');
  }
  
  if (failed > 0) {
    console.log(`\n⚠️  Failed: ${failedTeams.join(', ')}`);
  }

  console.log('\n');
}

downloadAllLogos().catch(console.error);

