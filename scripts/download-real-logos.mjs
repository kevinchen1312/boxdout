#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');

// Real logo URLs from various CDN sources
// Using sportslogos.net, euroleague official, and other reliable sources
const TEAM_LOGO_URLS = {
  // EuroLeague teams - using official sources and CDNs
  'real-madrid': 'https://www.realmadrid.com/cs/Satellite?blobcol=urldata&blobheader=image%2Fpng&blobkey=id&blobtable=MungoBlobs&blobwhere=1203371619719&ssbinary=true',
  'barcelona': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/FC_Barcelona_%28crest%29.svg/800px-FC_Barcelona_%28crest%29.svg.png',
  'fenerbahce': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8c/Fenerbahçe_SK_Logo.svg/800px-Fenerbahçe_SK_Logo.svg.png',
  'panathinaikos': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Panathinaikos_BC_logo.svg/800px-Panathinaikos_BC_logo.svg.png',
  'olympiacos': 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e4/Olympiacos_BC_logo.svg/800px-Olympiacos_BC_logo.svg.png',
  'crvena-zvezda': 'https://upload.wikimedia.org/wikipedia/en/thumb/3/39/KK_Crvena_zvezda_logo.svg/800px-KK_Crvena_zvezda_logo.svg.png',
  'partizan': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/86/KK_Partizan_logo.svg/800px-KK_Partizan_logo.svg.png',
  'zalgiris': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/BC_Žalgiris_logo.svg/800px-BC_Žalgiris_logo.svg.png',
  'maccabi-tel-aviv': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/7c/Maccabi_Tel_Aviv_BC_logo.svg/800px-Maccabi_Tel_Aviv_BC_logo.svg.png',
  'anadolu-efes': 'https://upload.wikimedia.org/wikipedia/en/thumb/3/36/Anadolu_Efes_S.K._logo.svg/800px-Anadolu_Efes_S.K._logo.svg.png',
  'baskonia': 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b2/Saski_Baskonia_logo.svg/800px-Saski_Baskonia_logo.svg.png',
  'armani-milan': 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f0/Olimpia_Milano_logo.svg/800px-Olimpia_Milano_logo.svg.png',
  'virtus-bologna': 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b7/Virtus_Bologna_logo.svg/800px-Virtus_Bologna_logo.svg.png',
  'bayern-munich': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/FC_Bayern_München_logo_%282017%29.svg/800px-FC_Bayern_München_logo_%282017%29.svg.png',
  'monaco': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/7a/AS_Monaco_Basket_logo.svg/800px-AS_Monaco_Basket_logo.svg.png',
  'mega-superbet': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/57/KK_Mega_logo.svg/800px-KK_Mega_logo.svg.png',
  'hapoel-tel-aviv': 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg/800px-Hapoel_Tel_Aviv_B.C._logo.svg.png',
  'unicaja': 'https://upload.wikimedia.org/wikipedia/en/thumb/3/34/Unicaja_logo.svg/800px-Unicaja_logo.svg.png',
  'cedevita-olimpija': 'https://upload.wikimedia.org/wikipedia/en/thumb/9/9c/Cedevita_Olimpija_logo.svg/800px-Cedevita_Olimpija_logo.svg.png',
  'buducnost': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/29/KK_Budućnost_VOLI_logo.svg/800px-KK_Budućnost_VOLI_logo.svg.png',
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
        const redirectUrl = response.headers.location;
        resolve(downloadFile(redirectUrl, filepath));
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
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
    });
    
    request.on('error', (err) => {
      reject(err);
    });
    
    request.setTimeout(15000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function downloadAllLogos() {
  console.log('🏀 Downloading Real International Basketball Team Logos...\n');
  console.log('Source: Official CDNs and Wikimedia Commons\n');
  console.log('=' .repeat(70));
  console.log('\n');

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const failedTeams = [];

  for (const [teamKey, url] of Object.entries(TEAM_LOGO_URLS)) {
    const filename = `${teamKey}.png`;
    const outputPath = path.join(LOGOS_DIR, filename);
    
    // Check if file already exists
    if (fs.existsSync(outputPath)) {
      console.log(`⏭️  Skipped ${filename.padEnd(35)} (already exists)`);
      skipped++;
      continue;
    }
    
    process.stdout.write(`⬇️  Downloading ${filename.padEnd(35)} ... `);
    
    try {
      await downloadFile(url, outputPath);
      console.log('✅');
      downloaded++;
    } catch (error) {
      console.log(`❌ ${error.message}`);
      failed++;
      failedTeams.push({ team: teamKey, error: error.message });
    }
    
    // Small delay between downloads
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '=' .repeat(70));
  console.log('\n📊 Summary:');
  console.log(`   ✅ Downloaded: ${downloaded}`);
  console.log(`   ⏭️  Skipped: ${skipped} (already exist)`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📁 Total: ${Object.keys(TEAM_LOGO_URLS).length} teams`);
  
  if (failed > 0) {
    console.log('\n⚠️  Failed downloads:');
    failedTeams.forEach(({ team, error }) => {
      console.log(`   - ${team}: ${error}`);
    });
  }
  
  if (downloaded > 0) {
    console.log('\n🎉 Real logos successfully downloaded!');
    console.log('   Refresh your browser to see them.');
  }

  console.log('\n');
  return { downloaded, skipped, failed };
}

// Run the script
downloadAllLogos().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});






